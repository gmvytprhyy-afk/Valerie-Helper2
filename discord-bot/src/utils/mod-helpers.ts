import {
  Guild,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { GuildSettings } from "../types/index";
import { logger } from "./logger";
import config from "../../config.json";

const ACTION_COLORS: Record<string, number> = {
  ban:     config.color.error,
  kick:    config.color.warning,
  mute:    config.color.warning,
  warn:    config.color.warning,
  note:    config.color.info,
  unban:   config.color.success,
  unmute:  config.color.success,
  unwarn:  config.color.success,
  "un-note": config.color.success,
  automod: config.color.warning,
};

const ACTION_EMOJIS: Record<string, string> = {
  ban:     "🔨",
  kick:    "👢",
  mute:    "🔇",
  warn:    "⚠️",
  note:    "📝",
  unban:   "✅",
  unmute:  "🔊",
  unwarn:  "✅",
  "un-note": "🗑️",
  automod: "🤖",
};

export function buildCaseEmbed(opts: {
  action: string;
  moderator: GuildMember | { id: string; username: string };
  target: { id: string; username?: string; tag?: string } | GuildMember;
  reason?: string;
  duration?: string;
  caseId?: number;
  extra?: Record<string, string>;
}): EmbedBuilder {
  const { action, moderator, target, reason, duration, caseId, extra } = opts;
  const color = ACTION_COLORS[action.toLowerCase()] ?? config.color.primary;
  const emoji = ACTION_EMOJIS[action.toLowerCase()] ?? "🛡️";
  const label = action.charAt(0).toUpperCase() + action.slice(1);

  const modId = "id" in moderator ? moderator.id : (moderator as GuildMember).id;
  const modName =
    "username" in moderator
      ? moderator.username
      : (moderator as GuildMember).user.username;

  const targetId = "id" in target ? target.id : (target as GuildMember).id;
  const targetName =
    (target as any).username ??
    (target as any).user?.username ??
    `User ${targetId.slice(0, 6)}`;

  const embed = new EmbedBuilder()
    .setColor(color as ColorResolvable)
    .setTitle(`${emoji} ${label}${caseId ? ` — Case #${caseId}` : ""}`)
    .addFields(
      { name: "Target", value: `<@${targetId}> \`${targetName}\``, inline: true },
      { name: "Moderator", value: `<@${modId}> \`${modName}\``, inline: true },
    )
    .setTimestamp();

  if (duration) embed.addFields({ name: "Duration", value: duration, inline: true });
  if (reason) embed.addFields({ name: "Reason", value: reason });
  if (extra) {
    for (const [name, value] of Object.entries(extra)) {
      embed.addFields({ name, value, inline: true });
    }
  }

  return embed;
}

export async function sendModLog(
  guild: Guild,
  embed: EmbedBuilder,
  settings: GuildSettings
): Promise<void> {
  const channelId = settings.mod_channel ?? settings.log_channel;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error("ModHelpers", "Failed to send mod log:", err);
  }
}

export interface HierarchyResult {
  ok: boolean;
  reason?: string;
}

export function checkHierarchy(
  executor: GuildMember,
  target: GuildMember,
  bot?: GuildMember
): HierarchyResult {
  if (target.id === executor.guild.ownerId) {
    return { ok: false, reason: "You cannot moderate the server owner." };
  }
  if (target.id === executor.id) {
    return { ok: false, reason: "You cannot moderate yourself." };
  }
  if (executor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return {
      ok: false,
      reason: "Your highest role must be above the target's highest role.",
    };
  }
  if (bot && bot.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return {
      ok: false,
      reason: "My highest role must be above the target's highest role.",
    };
  }
  return { ok: true };
}

export function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function parseDurationInput(input: string): number | null {
  const match = input.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * mult[unit];
}

export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 28 days (Discord limit)
