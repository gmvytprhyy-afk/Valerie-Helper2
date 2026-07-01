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
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("remove-user")
    .setDescription("Remove a user from the current ticket.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to remove.").setRequired(true)
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
    const isStaff =
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isStaff) {
      await interaction.reply({
        embeds: [errorEmbed("No Permission", "Only staff can remove users from tickets.")],
      });
      return;
    }

    const target = interaction.options.getUser("user", true);

    if (target.id === ticket.user_id) {
      await interaction.reply({
        embeds: [errorEmbed("Cannot Remove", "You cannot remove the ticket owner from their own ticket.")],
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        embeds: [errorEmbed("Cannot Remove", "You cannot remove yourself from the ticket.")],
      });
      return;
    }

    const channel = interaction.channel as any;
    const existing = channel.permissionOverwrites.cache.get(target.id);

    if (!existing) {
      await interaction.reply({
        embeds: [errorEmbed("Not in Ticket", `<@${target.id}> does not have access to this ticket.`)],
      });
      return;
    }

    await channel.permissionOverwrites.delete(target.id);

    const embed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("🚫 User Removed")
      .setDescription(`<@${target.id}> has been removed from this ticket.`)
      .addFields(
        { name: "Removed By", value: `${interaction.user}`, inline: true },
        { name: "Ticket ID", value: `#${ticket.id}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
