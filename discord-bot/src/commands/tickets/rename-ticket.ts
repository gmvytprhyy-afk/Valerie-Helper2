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
    .setName("rename-ticket")
    .setDescription("Rename the current ticket channel.")
    .addStringOption((opt) =>
      opt
        .setName("name")
        .setDescription("New name for the ticket channel.")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(80)
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
        embeds: [errorEmbed("No Permission", "Only staff can rename tickets.")],
      });
      return;
    }

    const rawName = interaction.options.getString("name", true);
    const safeName = rawName.toLowerCase().replace(/[^a-z0-9\- ]/g, "").replace(/ /g, "-").slice(0, 100);

    const oldName = (interaction.channel as any).name;
    await (interaction.channel as any).setName(safeName);

    const embed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle("✏️ Ticket Renamed")
      .addFields(
        { name: "Old Name", value: oldName, inline: true },
        { name: "New Name", value: safeName, inline: true },
        { name: "Renamed By", value: `${interaction.user}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
