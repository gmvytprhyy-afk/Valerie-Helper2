import {
  Client,
  Events,
  Message,
  PartialMessage,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
  GuildBan,
} from "discord.js";
import { pool } from "../database";
import { logger } from "../utils/logger";
import config from "../../config.json";

// Cache log_channel per guild — 2 minute TTL
const logChannelCache = new Map<string, { channelId: string | null; cachedAt: number }>();
const CACHE_TTL = 120_000;

async function getLogChannel(guildId: string, client: Client): Promise<TextChannel | null> {
  const cached = logChannelCache.get(guildId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    if (!cached.channelId) return null;
    return (client.channels.cache.get(cached.channelId) as TextChannel) ?? null;
  }

  try {
    const { rows } = await pool.query(
      `SELECT log_channel FROM guild_settings WHERE guild_id = $1`,
      [guildId]
    );
    const channelId: string | null = rows[0]?.log_channel ?? null;
    logChannelCache.set(guildId, { channelId, cachedAt: Date.now() });
    if (!channelId) return null;
    return (client.channels.cache.get(channelId) as TextChannel) ?? null;
  } catch {
    return null;
  }
}

async function sendLog(guildId: string, client: Client, embed: EmbedBuilder): Promise<void> {
  const channel = await getLogChannel(guildId, client);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error("Logging", "Failed to send log embed:", err);
  }
}

export function registerLogging(client: Client): void {
  // ─── Message Delete ─────────────────────────────────────
  client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
    if (!message.guild) return;
    if (message.author?.bot) return;

    const embed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("🗑️ Message Deleted")
      .addFields(
        { name: "Author", value: message.author ? `<@${message.author.id}> \`${message.author.username}\`` : "Unknown", inline: true },
        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({ name: "Content", value: message.content.slice(0, 1024) || "_empty_" });
    } else {
      embed.addFields({ name: "Content", value: "_Content not cached — message was sent before the bot started._" });
    }

    if (message.attachments.size > 0) {
      embed.addFields({
        name: "Attachments",
        value: message.attachments.map((a) => a.url).join("\n").slice(0, 1024),
      });
    }

    await sendLog(message.guild.id, client, embed);
  });

  // ─── Message Edit ────────────────────────────────────────
  client.on(Events.MessageUpdate, async (oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage) => {
    if (!newMsg.guild) return;
    if (newMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return; // embed unfurls trigger this event — ignore

    const embed = new EmbedBuilder()
      .setColor(config.color.warning as ColorResolvable)
      .setTitle("✏️ Message Edited")
      .setURL(newMsg.url)
      .addFields(
        { name: "Author", value: newMsg.author ? `<@${newMsg.author.id}> \`${newMsg.author.username}\`` : "Unknown", inline: true },
        { name: "Channel", value: `<#${newMsg.channelId}>`, inline: true },
        { name: "Before", value: (oldMsg.content?.slice(0, 512)) || "_Not cached_" },
        { name: "After", value: (newMsg.content?.slice(0, 512)) || "_empty_" },
      )
      .setTimestamp();

    await sendLog(newMsg.guild.id, client, embed);
  });

  // ─── Member Join (audit log) ────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const isNew = accountAge < 7 * 24 * 60 * 60 * 1000; // < 7 days old

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("📥 Member Joined")
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: "User", value: `<@${member.id}> \`${member.user.username}\``, inline: true },
        { name: "ID", value: `\`${member.id}\``, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Members", value: `${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();

    if (isNew) {
      embed.addFields({ name: "⚠️ New Account", value: "This account was created less than 7 days ago.", inline: false });
    }

    await sendLog(member.guild.id, client, embed);
  });

  // ─── Member Leave (audit log) ────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    const roles = member.roles?.cache
      ?.filter((r) => r.id !== member.guild.id)
      .map((r) => `<@&${r.id}>`)
      .slice(0, 10)
      .join(" ");

    const embed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("📤 Member Left")
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: "User", value: `<@${member.id}> \`${member.user.username}\``, inline: true },
        { name: "ID", value: `\`${member.id}\``, inline: true },
        { name: "Members", value: `${member.guild.memberCount}`, inline: true },
      )
      .setTimestamp();

    if (roles) embed.addFields({ name: "Roles", value: roles });

    await sendLog(member.guild.id, client, embed);
  });

  // ─── Ban / Unban ─────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban: GuildBan) => {
    const embed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("🔨 Member Banned")
      .addFields(
        { name: "User", value: `<@${ban.user.id}> \`${ban.user.username}\``, inline: true },
        { name: "Reason", value: ban.reason ?? "No reason provided", inline: false },
      )
      .setTimestamp();

    await sendLog(ban.guild.id, client, embed);
  });

  client.on(Events.GuildBanRemove, async (ban: GuildBan) => {
    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("✅ Member Unbanned")
      .addFields(
        { name: "User", value: `<@${ban.user.id}> \`${ban.user.username}\``, inline: true },
      )
      .setTimestamp();

    await sendLog(ban.guild.id, client, embed);
  });

  logger.info("Logging", "Server logging event handlers registered.");
}
