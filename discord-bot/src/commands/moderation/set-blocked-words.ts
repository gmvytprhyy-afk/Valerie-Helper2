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
import { pool } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("set-blocked-words")
    .setDescription("Configure the blocked words list for AutoMod.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName("mode")
        .setDescription("How to update the list.")
        .setRequired(false)
        .addChoices(
          { name: "Set (replace all)", value: "set" },
          { name: "Add words", value: "add" },
          { name: "Remove words", value: "remove" },
          { name: "Clear list", value: "clear" },
          { name: "View current list", value: "view" },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const mode = interaction.options.getString("mode") ?? "set";
    const guild = interaction.guild!;

    if (mode === "clear") {
      await pool.query(
        `INSERT INTO automod_settings (guild_id, blocked_words)
         VALUES ($1, '{}')
         ON CONFLICT (guild_id) DO UPDATE SET blocked_words = '{}', updated_at = NOW()`,
        [guild.id]
      );
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color.success as ColorResolvable)
            .setTitle("✅ Blocked Words Cleared")
            .setDescription("The blocked words list has been cleared.")
            .setTimestamp(),
        ],
      });
      return;
    }

    if (mode === "view") {
      const { rows } = await pool.query(
        "SELECT blocked_words FROM automod_settings WHERE guild_id = $1",
        [guild.id]
      );
      const words: string[] = rows[0]?.blocked_words ?? [];
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color.primary as ColorResolvable)
            .setTitle("📋 Blocked Words")
            .setDescription(
              words.length === 0
                ? "*No blocked words configured.*"
                : words.map((w) => `\`${w}\``).join(", ")
            )
            .setFooter({ text: `${words.length} word(s)` })
            .setTimestamp(),
        ],
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`blockedwords:${mode}:${guild.id}`)
      .setTitle(mode === "add" ? "Add Blocked Words" : mode === "remove" ? "Remove Words" : "Set Blocked Words")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("words")
            .setLabel("Words (comma-separated)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("spam, badword1, phrase to block, ...")
            .setRequired(true)
            .setMaxLength(2000)
        )
      );

    await interaction.showModal(modal);

    let submit: ModalSubmitInteraction;
    try {
      submit = await interaction.awaitModalSubmit({ time: 120_000, filter: (i) => i.customId.startsWith(`blockedwords:${mode}:${guild.id}`) });
    } catch {
      return;
    }

    const raw = submit.fields.getTextInputValue("words");
    const words = raw.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);

    if (words.length === 0) {
      await submit.reply({ embeds: [errorEmbed("No Words", "No valid words were provided.")] });
      return;
    }

    let query: string;
    let params: any[];

    if (mode === "set") {
      query = `INSERT INTO automod_settings (guild_id, blocked_words) VALUES ($1, $2)
               ON CONFLICT (guild_id) DO UPDATE SET blocked_words = $2, updated_at = NOW()`;
      params = [guild.id, words];
    } else if (mode === "add") {
      query = `INSERT INTO automod_settings (guild_id, blocked_words) VALUES ($1, $2)
               ON CONFLICT (guild_id) DO UPDATE
               SET blocked_words = array(SELECT DISTINCT unnest(automod_settings.blocked_words || $2)), updated_at = NOW()`;
      params = [guild.id, words];
    } else {
      query = `UPDATE automod_settings
               SET blocked_words = array(SELECT unnest(blocked_words) EXCEPT SELECT unnest($2::text[])), updated_at = NOW()
               WHERE guild_id = $1`;
      params = [guild.id, words];
    }

    await pool.query(query, params);

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("✅ Blocked Words Updated")
      .setDescription(
        mode === "set"
          ? `Set **${words.length}** blocked word(s).`
          : mode === "add"
          ? `Added **${words.length}** word(s): ${words.map((w) => `\`${w}\``).join(", ")}`
          : `Removed **${words.length}** word(s): ${words.map((w) => `\`${w}\``).join(", ")}`
      )
      .setTimestamp();

    await submit.reply({ embeds: [embed] });
  },
} satisfies Command;
