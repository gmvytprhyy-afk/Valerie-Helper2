import {
  Client,
  Events,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { queryOne } from "../database";
import { claimTicket } from "../tickets";
import { closeTicketWithTranscript } from "../utils/ticket-helpers";
import { errorEmbed, successEmbed } from "../utils/embed";
import { logger } from "../utils/logger";
import config from "../../config.json";

export function registerTicketButtons(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    const { customId } = interaction;

    if (customId.startsWith("ticket:claim:")) {
      await handleClaim(interaction as ButtonInteraction);
      return;
    }

    if (customId.startsWith("ticket:close:")) {
      await handleClose(interaction as ButtonInteraction);
      return;
    }

    if (customId.startsWith("sell:create:")) {
      await handleSellCreate(interaction as ButtonInteraction, client);
      return;
    }

    if (customId.startsWith("support:create:")) {
      await handleSupportCreate(interaction as ButtonInteraction, client);
      return;
    }
  });
}

async function handleClaim(interaction: ButtonInteraction): Promise<void> {
  const ticketId = parseInt(interaction.customId.split(":")[2], 10);
  const guild = interaction.guild!;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const hasPerms =
    member?.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasPerms) {
    await interaction.reply({
      embeds: [errorEmbed("No Permission", "Only staff members can claim tickets.")],
    });
    return;
  }

  const ticket = await queryOne<{ status: string; claimed_by: string | null }>(
    `SELECT status, claimed_by FROM tickets WHERE id = $1`,
    [ticketId]
  );

  if (!ticket) {
    await interaction.reply({ embeds: [errorEmbed("Not Found", "This ticket no longer exists.")] });
    return;
  }

  if (ticket.claimed_by) {
    await interaction.reply({
      embeds: [errorEmbed("Already Claimed", `This ticket is already claimed by <@${ticket.claimed_by}>.`)],
    });
    return;
  }

  await claimTicket(interaction.channel!.id, interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(config.color.success as ColorResolvable)
    .setTitle("🙋 Ticket Claimed")
    .setDescription(`<@${interaction.user.id}> has claimed this ticket and will be assisting you.`)
    .setTimestamp();

  await interaction.update({ components: [] });
  await (interaction.channel as import("discord.js").TextChannel).send({ embeds: [embed] });
}

async function handleClose(interaction: ButtonInteraction): Promise<void> {
  const ticketId = parseInt(interaction.customId.split(":")[2], 10);

  const ticket = await queryOne<{ user_id: string; claimed_by: string | null }>(
    `SELECT user_id, claimed_by FROM tickets WHERE id = $1`,
    [ticketId]
  );

  if (!ticket) {
    await interaction.reply({ embeds: [errorEmbed("Not Found", "Ticket not found.")] });
    return;
  }

  const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = ticket.user_id === interaction.user.id;
  const isStaff =
    member?.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isStaff) {
    await interaction.reply({
      embeds: [errorEmbed("No Permission", "Only the ticket owner or staff can close this ticket.")],
    });
    return;
  }

  const reasonModal = new ModalBuilder()
    .setCustomId(`ticket:close_reason:${ticketId}`)
    .setTitle("Close Ticket");

  reasonModal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for closing (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
    )
  );

  await interaction.showModal(reasonModal);

  const submit = await interaction
    .awaitModalSubmit({
      filter: (i) =>
        i.customId === `ticket:close_reason:${ticketId}` && i.user.id === interaction.user.id,
      time: 60_000,
    })
    .catch(() => null);

  if (!submit) return;

  const reason = submit.fields.getTextInputValue("reason") || undefined;

  await (submit as any).deferUpdate().catch(() => null);

  await closeTicketWithTranscript(
    interaction.channel as TextChannel,
    ticketId,
    interaction.user.id,
    reason
  );
}

async function handleSellCreate(interaction: ButtonInteraction, _client: Client): Promise<void> {
  const panelId = parseInt(interaction.customId.split(":")[2], 10);
  const { guild, user } = interaction;

  const openTicket = await queryOne<{ id: number }>(
    `SELECT id FROM tickets
     WHERE guild_id = $1 AND user_id = $2 AND ticket_type = 'sell' AND status != 'closed'
     LIMIT 1`,
    [guild!.id, user.id]
  );

  if (openTicket) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          "Ticket Already Open",
          `You already have an open sell ticket. Please close it before opening a new one.`
        ),
      ],
    });
    return;
  }

  const { createTicketChannel, buildTicketActionRow, ticketTypeLabel } = await import(
    "../utils/ticket-helpers"
  );
  const { getOrCreateGuildSettings } = await import("../utility");

  const settings = await getOrCreateGuildSettings(guild!.id);
  const pingRoles = [
    ...(settings.ping_roles ?? []),
    ...(settings.sell_roles ?? []),
  ];

  const result = await createTicketChannel({
    guild: guild!,
    userId: user.id,
    type: "sell",
    subject: `Sell Panel #${panelId}`,
    panelId,
    extraRoles: pingRoles,
    categoryId: settings.ticket_category ?? undefined,
  });

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed("Failed", "Could not create your ticket. Please contact a moderator.")],
    });
    return;
  }

  const { channel, ticketId } = result;

  const rolePings = pingRoles.length > 0 ? pingRoles.map((r) => `<@&${r}>`).join(" ") : "";

  const ticketEmbed = new EmbedBuilder()
    .setColor(config.color.primary as ColorResolvable)
    .setTitle(ticketTypeLabel("sell"))
    .setDescription(
      `Welcome <@${user.id}>! A staff member will be with you shortly.\n\n` +
        "Please describe **what you're selling**, your **price**, and any relevant details."
    )
    .addFields(
      { name: "Ticket ID", value: `#${ticketId}`, inline: true },
      { name: "Opened By", value: `<@${user.id}>`, inline: true },
      { name: "Status", value: "🟢 Open", inline: true }
    )
    .setFooter({ text: "Use the buttons below to claim or close this ticket." })
    .setTimestamp();

  await channel.send({
    content: `${rolePings ? rolePings + " " : ""}<@${user.id}>`,
    embeds: [ticketEmbed],
    components: [buildTicketActionRow(ticketId)],
  });

  await interaction.reply({
    embeds: [
      successEmbed("Ticket Created!", `Your sell ticket has been opened: <#${channel.id}>`),
    ],
  });
}

async function handleSupportCreate(interaction: ButtonInteraction, _client: Client): Promise<void> {
  const panelId = parseInt(interaction.customId.split(":")[2], 10);
  const { guild, user } = interaction;

  const openTicket = await queryOne<{ id: number }>(
    `SELECT id FROM tickets
     WHERE guild_id = $1 AND user_id = $2 AND ticket_type = 'support' AND status != 'closed'
     LIMIT 1`,
    [guild!.id, user.id]
  );

  if (openTicket) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          "Ticket Already Open",
          "You already have an open support ticket. Please close it before opening a new one."
        ),
      ],
    });
    return;
  }

  const { createTicketChannel, buildTicketActionRow, ticketTypeLabel } = await import(
    "../utils/ticket-helpers"
  );
  const { getOrCreateGuildSettings } = await import("../utility");

  const settings = await getOrCreateGuildSettings(guild!.id);

  const result = await createTicketChannel({
    guild: guild!,
    userId: user.id,
    type: "support",
    subject: `Support Panel #${panelId}`,
    panelId,
    extraRoles: settings.ping_roles ?? [],
    categoryId: settings.ticket_category ?? undefined,
  });

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed("Failed", "Could not create your ticket. Please contact a moderator.")],
    });
    return;
  }

  const { channel, ticketId } = result;
  const rolePings =
    settings.ping_roles?.length > 0
      ? settings.ping_roles.map((r: string) => `<@&${r}>`).join(" ")
      : "";

  const ticketEmbed = new EmbedBuilder()
    .setColor(config.color.primary as ColorResolvable)
    .setTitle(ticketTypeLabel("support"))
    .setDescription(
      `Welcome <@${user.id}>! A staff member will be with you shortly.\n\n` +
        "Please describe your issue in detail."
    )
    .addFields(
      { name: "Ticket ID", value: `#${ticketId}`, inline: true },
      { name: "Opened By", value: `<@${user.id}>`, inline: true },
      { name: "Status", value: "🟢 Open", inline: true }
    )
    .setFooter({ text: "Use the buttons below to claim or close this ticket." })
    .setTimestamp();

  await channel.send({
    content: `${rolePings ? rolePings + " " : ""}<@${user.id}>`,
    embeds: [ticketEmbed],
    components: [buildTicketActionRow(ticketId)],
  });

  await interaction.reply({
    embeds: [successEmbed("Ticket Created!", `Your support ticket has been opened: <#${channel.id}>`)],
  });
}
