import {
  Guild,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { query, queryOne } from "../database";
import { createTicket, closeTicket } from "../tickets";
import { getOrCreateGuildSettings } from "../utility";
import { buildTranscript } from "./transcript";
import { logger } from "./logger";
import config from "../../config.json";

export type TicketType = "purchase" | "sell" | "support";

export function buildTicketActionRow(ticketId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticketId}`)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🙋"),
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketId}`)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );
}

export function ticketTypeLabel(type: TicketType): string {
  return type === "purchase"
    ? "🛒 Purchase Ticket"
    : type === "sell"
    ? "💰 Sell Ticket"
    : "🎫 Support Ticket";
}

export async function createTicketChannel(opts: {
  guild: Guild;
  userId: string;
  type: TicketType;
  subject?: string;
  panelId?: number;
  extraRoles?: string[];
  categoryId?: string;
}): Promise<{ channel: TextChannel; ticketId: number } | null> {
  const { guild, userId, type, subject, panelId, extraRoles = [], categoryId } = opts;

  const prefix = type === "purchase" ? "purchase" : type === "sell" ? "sell" : "support";
  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    return null;
  }

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    ...extraRoles.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  let channel: TextChannel;
  try {
    channel = (await guild.channels.create({
      name: `${prefix}-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 100),
      type: ChannelType.GuildText,
      parent: categoryId ?? undefined,
      permissionOverwrites: overwrites,
    })) as TextChannel;
  } catch (err) {
    logger.error("TicketHelpers", "Failed to create ticket channel:", err);
    return null;
  }

  const ticket = await createTicket(guild.id, channel.id, userId, subject);

  await query(
    `UPDATE tickets SET ticket_type = $2, panel_id = $3 WHERE id = $1`,
    [ticket.id, type, panelId ?? null]
  );

  return { channel, ticketId: ticket.id };
}

export async function closeTicketWithTranscript(
  channel: TextChannel,
  ticketId: number,
  closerId: string,
  reason?: string
): Promise<void> {
  const ticket = await queryOne<{
    id: number;
    user_id: string;
    ticket_type: string;
    subject: string | null;
    claimed_by: string | null;
    status: string;
    created_at: Date;
    closed_at: Date | null;
  }>(
    `SELECT * FROM tickets WHERE id = $1`,
    [ticketId]
  );

  if (!ticket) return;

  const settings = await getOrCreateGuildSettings(channel.guild.id);

  let transcriptSent = false;
  try {
    const buf = await buildTranscript(channel, {
      id: ticket.id,
      guild_id: channel.guild.id,
      channel_id: channel.id,
      user_id: ticket.user_id,
      subject: ticket.subject,
      status: ticket.status as "open" | "closed" | "claimed",
      claimed_by: ticket.claimed_by,
      created_at: ticket.created_at,
      closed_at: new Date(),
      ticket_type: ticket.ticket_type as "purchase" | "sell" | "support",
      panel_id: null,
    });

    if (settings.ticket_log) {
      const logChannel = channel.guild.channels.cache.get(settings.ticket_log) as TextChannel | undefined;
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(config.color.info as ColorResolvable)
          .setTitle(`📋 Transcript — Ticket #${ticket.id}`)
          .addFields(
            { name: "Type", value: ticket.ticket_type, inline: true },
            { name: "Opened By", value: `<@${ticket.user_id}>`, inline: true },
            { name: "Closed By", value: `<@${closerId}>`, inline: true },
            { name: "Subject", value: ticket.subject ?? "N/A", inline: true },
            { name: "Reason", value: reason ?? "No reason given", inline: true }
          )
          .setTimestamp();

        await logChannel.send({
          embeds: [logEmbed],
          files: [{ name: `ticket-${ticket.id}-transcript.txt`, attachment: buf }],
        });
        transcriptSent = true;
      }
    }

    const closeEmbed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("🔒 Ticket Closing")
      .setDescription(
        `This ticket is being closed by <@${closerId}>.\n${reason ? `**Reason:** ${reason}\n` : ""}${transcriptSent ? "A transcript has been saved." : "No transcript log channel configured."}`
      )
      .setFooter({ text: "Channel will be deleted in 5 seconds." })
      .setTimestamp();

    await channel.send({ embeds: [closeEmbed] });
  } catch (err) {
    logger.error("TicketHelpers", "Error during transcript generation:", err);
  }

  await closeTicket(channel.id);

  setTimeout(async () => {
    try {
      await channel.delete(`Ticket #${ticketId} closed by ${closerId}`);
    } catch (err) {
      logger.error("TicketHelpers", "Failed to delete ticket channel:", err);
    }
  }, 5000);
}
