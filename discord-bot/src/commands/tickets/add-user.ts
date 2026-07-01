import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  OverwriteType,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { getTicketByChannel } from "../../tickets";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("add-user")
    .setDescription("Add a user to the current ticket.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to add.").setRequired(true)
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
        embeds: [errorEmbed("No Permission", "Only the ticket owner or staff can add users.")],
      });
      return;
    }

    const target = interaction.options.getUser("user", true);

    if (target.bot) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "You cannot add a bot to a ticket.")],
      });
      return;
    }

    const channel = interaction.channel as any;
    await channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    });

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("✅ User Added")
      .setDescription(`<@${target.id}> has been added to this ticket.`)
      .addFields(
        { name: "Added By", value: `${interaction.user}`, inline: true },
        { name: "Ticket ID", value: `#${ticket.id}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
