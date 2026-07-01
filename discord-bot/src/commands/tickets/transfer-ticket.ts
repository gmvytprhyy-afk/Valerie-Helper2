import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { getTicketByChannel } from "../../tickets";
import { query } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("transfer-ticket")
    .setDescription("Transfer this ticket's claim to another staff member.")
    .addUserOption((opt) =>
      opt.setName("staff").setDescription("The staff member to transfer this ticket to.").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const ticket = await getTicketByChannel(interaction.channelId);

    if (!ticket) {
      await interaction.reply({
        embeds: [errorEmbed("Not a Ticket", "This command can only be used inside a ticket channel.")],
      });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const isCurrentClaimer = ticket.claimed_by === interaction.user.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isCurrentClaimer && !isAdmin) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "No Permission",
            ticket.claimed_by
              ? `Only the current claimer (<@${ticket.claimed_by}>) or an admin can transfer this ticket.`
              : "Only an admin can transfer an unclaimed ticket."
          ),
        ],
      });
      return;
    }

    const target = interaction.options.getUser("staff", true);

    if (target.bot) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "You cannot transfer a ticket to a bot.")],
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "You cannot transfer a ticket to yourself.")],
      });
      return;
    }

    const targetMember = await interaction.guild!.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({
        embeds: [errorEmbed("Member Not Found", "That user is not in this server.")],
      });
      return;
    }

    const targetIsStaff =
      targetMember.permissions.has(PermissionFlagsBits.ManageChannels) ||
      targetMember.permissions.has(PermissionFlagsBits.Administrator);

    if (!targetIsStaff) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "That member does not have staff permissions.")],
      });
      return;
    }

    await query(
      `UPDATE tickets SET claimed_by = $2, status = 'claimed' WHERE channel_id = $1`,
      [interaction.channelId, target.id]
    );

    const embed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle("🔄 Ticket Transferred")
      .setDescription(`This ticket has been transferred to <@${target.id}>.`)
      .addFields(
        { name: "Ticket ID", value: `#${ticket.id}`, inline: true },
        { name: "Transferred From", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Transferred To", value: `<@${target.id}>`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
