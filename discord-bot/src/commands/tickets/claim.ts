import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { getTicketByChannel, claimTicket } from "../../tickets";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim the current ticket and assign it to yourself."),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const ticket = await getTicketByChannel(interaction.channelId);

    if (!ticket) {
      await interaction.reply({
        embeds: [errorEmbed("Not a Ticket", "This command can only be used inside a ticket channel.")],
      });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const hasPerms =
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.Administrator);

    if (!hasPerms) {
      await interaction.reply({
        embeds: [errorEmbed("No Permission", "Only staff members can claim tickets.")],
      });
      return;
    }

    if (ticket.claimed_by) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Already Claimed",
            `This ticket is already claimed by <@${ticket.claimed_by}>.\nUse \`/transfer-ticket\` to reassign it.`
          ),
        ],
      });
      return;
    }

    await claimTicket(interaction.channelId, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("🙋 Ticket Claimed")
      .setDescription(`<@${interaction.user.id}> has claimed this ticket and will be assisting you.`)
      .addFields(
        { name: "Ticket ID", value: `#${ticket.id}`, inline: true },
        { name: "Claimed By", value: `${interaction.user}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
