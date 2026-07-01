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
  TextChannel,
} from "discord.js";
import { Command } from "../../types/index";
import { query, queryOne } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("sell")
    .setDescription("Create a sell panel where members can open a sell ticket. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId("sell_panel_modal")
      .setTitle("Create Sell Panel");

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
          .setMaxLength(500)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("looking_for")
          .setLabel("What are we looking for?")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("e.g. Rare skins, high-level accounts, game currency...")
          .setMaxLength(400)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);

    const submit = await interaction
      .awaitModalSubmit({
        filter: (i) => i.customId === "sell_panel_modal" && i.user.id === interaction.user.id,
        time: 120_000,
      })
      .catch(() => null);

    if (!submit) return;

    const title = submit.fields.getTextInputValue("title");
    const description = submit.fields.getTextInputValue("description") || null;
    const lookingFor = submit.fields.getTextInputValue("looking_for");

    const panelRow = await queryOne<{ id: number }>(
      `INSERT INTO sell_panels (guild_id, name, description, looking_for, channel_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [interaction.guildId!, title, description, lookingFor, interaction.channelId]
    );

    if (!panelRow) {
      await submit.reply({ embeds: [errorEmbed("Database Error", "Failed to save the sell panel.")] });
      return;
    }

    const panelId = panelRow.id;

    const panelEmbed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`💰 ${title}`)
      .setDescription(
        (description ? `${description}\n\n` : "") +
          "Click the button below to open a **Sell Ticket** and start the process."
      )
      .addFields({ name: "📋 We Are Looking For", value: lookingFor })
      .setFooter({ text: "💎 Powered by Valerie Helper · One ticket per member" })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId(`sell:create:${panelId}`)
      .setLabel("Open Sell Ticket")
      .setStyle(ButtonStyle.Success)
      .setEmoji("💰");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await submit.reply({ embeds: [panelEmbed], components: [row] });

    const msg = await submit.fetchReply();
    await query(
      `UPDATE sell_panels SET message_id = $2 WHERE id = $1`,
      [panelId, msg.id]
    );
  },
} satisfies Command;
