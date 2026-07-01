import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { query, queryOne } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("support-panel")
    .setDescription("Create a support ticket panel. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId("support_panel_modal")
      .setTitle("Create Support Panel");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Panel Title")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Panel Description")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(600)
          .setRequired(false)
      )
    );

    await interaction.showModal(modal);

    const submit = await interaction
      .awaitModalSubmit({
        filter: (i) => i.customId === "support_panel_modal" && i.user.id === interaction.user.id,
        time: 120_000,
      })
      .catch(() => null);

    if (!submit) return;

    const title = submit.fields.getTextInputValue("title");
    const description = submit.fields.getTextInputValue("description") || null;

    const panelRow = await queryOne<{ id: number }>(
      `INSERT INTO support_panels (guild_id, title, description, channel_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [interaction.guildId!, title, description, interaction.channelId]
    );

    if (!panelRow) {
      await submit.reply({
        embeds: [errorEmbed("Database Error", "Failed to save the support panel.")],
      });
      return;
    }

    const panelId = panelRow.id;

    const panelEmbed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`🎫 ${title}`)
      .setDescription(
        (description ? `${description}\n\n` : "") +
          "Click the button below to open a **Support Ticket**."
      )
      .setFooter({ text: "💎 Powered by Valerie Helper · One ticket per member" })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId(`support:create:${panelId}`)
      .setLabel("Open Support Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await submit.reply({ embeds: [panelEmbed], components: [row] });

    const msg = await submit.fetchReply();
    await query(
      `UPDATE support_panels SET message_id = $2 WHERE id = $1`,
      [panelId, msg.id]
    );
  },
} satisfies Command;
