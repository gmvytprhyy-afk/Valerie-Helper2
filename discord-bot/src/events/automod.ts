import {
  Client,
  Events,
  Message,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
  PermissionFlagsBits,
} from "discord.js";
import { pool } from "../database";
import { logModAction } from "../moderation";
import { logger } from "../utils/logger";
import { formatDurationMs } from "../utils/mod-helpers";
import config from "../../config.json";

interface AutoModSettings {
  guild_id: string;
  anti_spam: boolean;
  anti_invite: boolean;
  anti_link: boolean;
  anti_caps: boolean;
  anti_mention_spam: boolean;
  anti_duplicate: boolean;
  max_mentions: number;
  caps_threshold: number;
  spam_threshold: number;
  spam_window_seconds: number;
  blocked_words: string[];
  log_channel: string | null;
  exempt_roles: string[];
  exempt_channels: string[];
  warn_on_trigger: boolean;
  timeout_on_trigger: boolean;
  timeout_duration: number;
}

interface ViolationResult {
  triggered: boolean;
  rule?: string;
  detail?: string;
}

// In-memory trackers (reset on bot restart — acceptable for anti-spam use)
const spamTracker = new Map<string, number[]>();          // key: guildId:userId → timestamps[]
const duplicateTracker = new Map<string, string>();       // key: guildId:userId → last message content

// AutoMod settings cache: 90-second TTL
const settingsCache = new Map<string, { data: AutoModSettings | null; cachedAt: number }>();
const CACHE_TTL = 90_000;

async function fetchSettings(guildId: string): Promise<AutoModSettings | null> {
  const cached = settingsCache.get(guildId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached.data;

  const { rows } = await pool.query(
    `SELECT * FROM automod_settings WHERE guild_id = $1`,
    [guildId]
  );
  const data = rows[0] ?? null;
  settingsCache.set(guildId, { data, cachedAt: Date.now() });
  return data;
}

function isExempt(message: Message, settings: AutoModSettings): boolean {
  if (!message.member) return false;
  const memberRoles = message.member.roles.cache.map((r) => r.id);
  if (settings.exempt_channels.includes(message.channelId)) return true;
  if (memberRoles.some((r) => settings.exempt_roles.includes(r))) return true;
  return false;
}

function checkSpam(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_spam) return { triggered: false };
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  const windowMs = settings.spam_window_seconds * 1000;
  const timestamps = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  spamTracker.set(key, timestamps);

  if (timestamps.length >= settings.spam_threshold) {
    spamTracker.delete(key);
    return { triggered: true, rule: "Anti-Spam", detail: `${timestamps.length} messages in ${settings.spam_window_seconds}s` };
  }
  return { triggered: false };
}

function checkDuplicate(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_duplicate) return { triggered: false };
  const content = message.content.trim().toLowerCase();
  if (content.length < 5) return { triggered: false };
  const key = `${message.guildId}:${message.author.id}`;
  const last = duplicateTracker.get(key);
  duplicateTracker.set(key, content);
  if (last && last === content) {
    return { triggered: true, rule: "Anti-Duplicate", detail: "Repeated identical message" };
  }
  return { triggered: false };
}

function checkInvite(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_invite) return { triggered: false };
  if (/discord\.(gg|com\/invite)\/[a-zA-Z0-9-]+/i.test(message.content)) {
    return { triggered: true, rule: "Anti-Invite", detail: "Discord invite link detected" };
  }
  return { triggered: false };
}

function checkLinks(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_link) return { triggered: false };
  if (/https?:\/\/[^\s]+/i.test(message.content)) {
    return { triggered: true, rule: "Anti-Link", detail: "External URL detected" };
  }
  return { triggered: false };
}

function checkCaps(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_caps) return { triggered: false };
  const letters = message.content.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 10) return { triggered: false };
  const upperCount = letters.replace(/[^A-Z]/g, "").length;
  const pct = (upperCount / letters.length) * 100;
  if (pct >= settings.caps_threshold) {
    return { triggered: true, rule: "Anti-Caps", detail: `${Math.round(pct)}% uppercase` };
  }
  return { triggered: false };
}

function checkMentionSpam(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.anti_mention_spam) return { triggered: false };
  const count = message.mentions.users.size + message.mentions.roles.size;
  if (count >= settings.max_mentions) {
    return { triggered: true, rule: "Anti-Mention", detail: `${count} mentions (max ${settings.max_mentions})` };
  }
  return { triggered: false };
}

function checkBlockedWords(message: Message, settings: AutoModSettings): ViolationResult {
  if (!settings.blocked_words || settings.blocked_words.length === 0) return { triggered: false };
  const content = message.content.toLowerCase();
  for (const word of settings.blocked_words) {
    if (content.includes(word.toLowerCase())) {
      return { triggered: true, rule: "Blocked Word", detail: `Matched: \`${word}\`` };
    }
  }
  return { triggered: false };
}

async function applyAction(
  message: Message,
  member: GuildMember,
  settings: AutoModSettings,
  violation: ViolationResult
): Promise<void> {
  const guild = message.guild!;

  // 1. Delete the message
  if (message.deletable) {
    await message.delete().catch(() => null);
  }

  const reason = `AutoMod: ${violation.rule} — ${violation.detail}`;

  // 2. Warn (log to DB)
  let caseId: number | undefined;
  if (settings.warn_on_trigger) {
    try {
      const log = await logModAction(guild.id, member.id, guild.client.user!.id, "automod", reason);
      caseId = log.id;
    } catch (err) {
      logger.error("AutoMod", "Failed to log warn:", err);
    }
  }

  // 3. Timeout user
  if (settings.timeout_on_trigger && member.moderatable) {
    try {
      await member.timeout(settings.timeout_duration, reason);
    } catch (err) {
      logger.error("AutoMod", "Failed to timeout member:", err);
    }
  }

  // 4. Log to automod log channel
  const logChannelId = settings.log_channel;
  if (!logChannelId) return;
  const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(config.color.warning as ColorResolvable)
    .setTitle(`🤖 AutoMod — ${violation.rule}`)
    .addFields(
      { name: "User", value: `<@${member.id}> \`${member.user.username}\``, inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Trigger", value: violation.detail ?? "Unknown", inline: true },
      { name: "Message", value: message.content.slice(0, 500) || "*[empty]*" },
    )
    .setTimestamp();

  if (caseId) embed.addFields({ name: "Case", value: `#${caseId}`, inline: true });

  if (settings.timeout_on_trigger) {
    embed.addFields({
      name: "Timeout Applied",
      value: formatDurationMs(settings.timeout_duration),
      inline: true,
    });
  }

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (err) {
    logger.error("AutoMod", "Failed to send log embed:", err);
  }

  // 5. Notify in channel (brief, non-ephemeral warning embed)
  const notifyChannel = message.channel as TextChannel;
  if (notifyChannel?.permissionsFor?.(guild.members.me!)?.has(PermissionFlagsBits.SendMessages)) {
    const notifyEmbed = new EmbedBuilder()
      .setColor(config.color.warning as ColorResolvable)
      .setDescription(`⚠️ <@${member.id}>, your message was removed. **${violation.rule}**: ${violation.detail}.`);
    const notif = await notifyChannel.send({ embeds: [notifyEmbed] }).catch(() => null);
    if (notif) setTimeout(() => notif.delete().catch(() => null), 7000);
  }
}

export function registerAutoMod(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot || !message.member) return;
    if (message.content.length === 0) return;

    let settings: AutoModSettings | null;
    try {
      settings = await fetchSettings(message.guildId!);
    } catch {
      return;
    }

    if (!settings) return;

    // Check if any feature is active
    const anyEnabled =
      settings.anti_spam ||
      settings.anti_duplicate ||
      settings.anti_invite ||
      settings.anti_link ||
      settings.anti_caps ||
      settings.anti_mention_spam ||
      (settings.blocked_words?.length > 0);

    if (!anyEnabled) return;
    if (isExempt(message, settings)) return;

    const checks: ViolationResult[] = [
      checkInvite(message, settings),
      checkLinks(message, settings),
      checkBlockedWords(message, settings),
      checkMentionSpam(message, settings),
      checkCaps(message, settings),
      checkDuplicate(message, settings),
      checkSpam(message, settings),
    ];

    const violation = checks.find((c) => c.triggered);
    if (!violation) return;

    try {
      await applyAction(message, message.member, settings, violation);
    } catch (err) {
      logger.error("AutoMod", "Error applying action:", err);
    }
  });

  logger.info("AutoMod", "AutoMod event handler registered.");
}
