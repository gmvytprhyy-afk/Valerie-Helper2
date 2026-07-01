import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { updateGuildSettings, getOrCreateGuildSettings } from "../../utility";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("set-welcome")
    .setDescription("Configure welcome and leave messages.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName("type")
        .setDescription("Which message to configure.")
        .setRequired(true)
        .addChoices(
          { name: "Welcome message", value: "welcome" },
          { name: "Leave message", value: "leave" },
          { name: "Disable welcome", value: "disable_welcome" },
          { name: "Disable leave", value: "disable_leave" },
          { name: "View current settings", value: "view" },
        )
    )
    .addChannelOption((o) =>
      o.setName("channel")
        .setDescription("The channel to send messages in (required for welcome/leave).")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const type = interaction.options.getString("type", true);
    const guild = interaction.guild!;

    if (type === "view") {
      const settings = await getOrCreateGuildSettings(guild.id);
      const embed = new EmbedBuilder()
        .setColor(config.color.primary as ColorResolvable)
        .setTitle("👋 Welcome & Leave Settings")
        .addFields(
          {
            name: "Welcome Channel",
            value: settings.welcome_channel ? `<#${settings.welcome_channel}>` : "_Not set_",
            inline: true,
          },
          {
            name: "Welcome Message",
            value: settings.welcome_message ?? "_Not set_",
            inline: false,
          },
          {
            name: "Leave Channel",
            value: settings.leave_channel ? `<#${settings.leave_channel}>` : "_Not set_",
            inline: true,
          },
          {
            name: "Leave Message",
            value: settings.leave_message ?? "_Not set_",
            inline: false,
          },
        )
        .setFooter({ text: "Variables: {user} {server} {count}" })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (type === "disable_welcome") {
      await updateGuildSettings(guild.id, { welcome_channel: null, welcome_message: null });
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.color.success as ColorResolvable).setTitle("✅ Welcome Disabled").setDescription("Welcome messages have been disabled.").setTimestamp()],
      });
      return;
    }

    if (type === "disable_leave") {
      await updateGuildSettings(guild.id, { leave_channel: null, leave_message: null });
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.color.success as ColorResolvable).setTitle("✅ Leave Disabled").setDescription("Leave messages have been disabled.").setTimestamp()],
      });
      return;
    }

    const channelOption = interaction.options.getChannel("channel");
    if (!channelOption) {
      await interaction.reply({ embeds: [errorEmbed("Channel Required", "Please select a channel for this message type.")] });
      return;
    }

    const isWelcome = type === "welcome";
    const modal = new ModalBuilder()
      .setCustomId(`setwelcome:${type}:${channelOption.id}`)
      .setTitle(isWelcome ? "Welcome Message" : "Leave Message")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Message text")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Welcome {user} to {server}! We now have {count} members.")
            .setRequired(true)
            .setMaxLength(1000)
        )
      );

    await interaction.showModal(modal);

    let submit: ModalSubmitInteraction;
    try {
      submit = await interaction.awaitModalSubmit({
        time: 120_000,
        filter: (i) => i.customId === `setwelcome:${type}:${channelOption.id}` && i.user.id === interaction.user.id,
      });
    } catch {
      return;
    }

    const message = submit.fields.getTextInputValue("message");

    if (isWelcome) {
      await updateGuildSettings(guild.id, {
        welcome_channel: channelOption.id,
        welcome_message: message,
      });
    } else {
      await updateGuildSettings(guild.id, {
        leave_channel: channelOption.id,
        leave_message: message,
      });
    }

    const preview = message
      .replace("{user}", `@${interaction.user.username}`)
      .replace("{server}", guild.name)
      .replace("{count}", String(guild.memberCount));

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle(`✅ ${isWelcome ? "Welcome" : "Leave"} Message Set`)
      .addFields(
        { name: "Channel", value: `<#${channelOption.id}>`, inline: true },
        { name: "Preview", value: preview },
      )
      .setFooter({ text: "Variables: {user} {server} {count}" })
      .setTimestamp();

    await submit.reply({ embeds: [embed] });
  },
} satisfies Command;
