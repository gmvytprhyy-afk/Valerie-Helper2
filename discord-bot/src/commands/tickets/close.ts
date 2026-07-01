import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { Command } from "../../types/index";
import { getTicketByChannel } from "../../tickets";
import { closeTicketWithTranscript } from "../../utils/ticket-helpers";
import { errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close this ticket, generate a transcript, and delete the channel.")
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for closing.").setRequired(false).setMaxLength(500)
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
    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff =
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !isStaff) {
      await interaction.reply({
        embeds: [errorEmbed("No Permission", "Only the ticket owner or staff can close this ticket.")],
      });
      return;
    }

    const reason = interaction.options.getString("reason") ?? undefined;

    await interaction.reply({
      embeds: [
        {
          color: 0xffa500,
          description: "⏳ Generating transcript and closing ticket...",
        } as any,
      ],
    });

    await closeTicketWithTranscript(
      interaction.channel as TextChannel,
      ticket.id,
      interaction.user.id,
      reason
    );
  },
} satisfies Command;
