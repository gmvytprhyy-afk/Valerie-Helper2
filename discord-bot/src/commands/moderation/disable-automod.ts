import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { pool } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

const FEATURES: Record<string, string> = {
  all:         "All features",
  anti_spam:   "Spam detection",
  anti_invite: "Invite link blocking",
  anti_link:   "Link blocking",
  anti_caps:   "Caps spam",
  anti_mention_spam: "Mention spam",
  anti_duplicate:    "Duplicate messages",
};

export default {
  data: new SlashCommandBuilder()
    .setName("disable-automod")
    .setDescription("Disable AutoMod or specific AutoMod features.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName("feature")
        .setDescription("Which feature to disable (default: all).")
        .setRequired(false)
        .addChoices(
          { name: "All features", value: "all" },
          { name: "Spam detection", value: "anti_spam" },
          { name: "Invite link blocking", value: "anti_invite" },
          { name: "Link blocking", value: "anti_link" },
          { name: "Caps spam", value: "anti_caps" },
          { name: "Mention spam", value: "anti_mention_spam" },
          { name: "Duplicate messages", value: "anti_duplicate" },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const feature = interaction.options.getString("feature") ?? "all";
    const guild = interaction.guild!;

    const updateParts: string[] = ["updated_at = NOW()"];

    if (feature === "all") {
      updateParts.push(
        "anti_spam = FALSE",
        "anti_invite = FALSE",
        "anti_link = FALSE",
        "anti_caps = FALSE",
        "anti_mention_spam = FALSE",
        "anti_duplicate = FALSE",
      );
    } else {
      updateParts.push(`${feature} = FALSE`);
    }

    try {
      await pool.query(
        `INSERT INTO automod_settings (guild_id) VALUES ($1)
         ON CONFLICT (guild_id) DO UPDATE SET ${updateParts.join(", ")}`,
        [guild.id]
      );
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Database Error", "Failed to update AutoMod settings.")] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.color.error as ColorResolvable)
      .setTitle("🚫 AutoMod Disabled")
      .setDescription(`**${FEATURES[feature] ?? feature}** has been disabled.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
