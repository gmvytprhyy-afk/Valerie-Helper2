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
    .setName("enable-automod")
    .setDescription("Enable AutoMod or specific AutoMod features.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName("feature")
        .setDescription("Which feature to enable (default: all).")
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
    )
    .addBooleanOption((o) =>
      o.setName("warn_on_trigger").setDescription("Warn users when AutoMod triggers (default: true).").setRequired(false)
    )
    .addBooleanOption((o) =>
      o.setName("timeout_on_trigger").setDescription("Timeout users when AutoMod triggers (default: false).").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("timeout_duration").setDescription("Timeout duration on trigger (e.g. 5m, 10m). Default: 5m.").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const feature = interaction.options.getString("feature") ?? "all";
    const warnOnTrigger = interaction.options.getBoolean("warn_on_trigger") ?? true;
    const timeoutOnTrigger = interaction.options.getBoolean("timeout_on_trigger") ?? false;
    const timeoutDurationStr = interaction.options.getString("timeout_duration") ?? "5m";
    const guild = interaction.guild!;

    let timeoutDurationMs = 5 * 60 * 1000;
    const match = timeoutDurationStr.match(/^(\d+)(s|m|h|d)$/i);
    if (match) {
      const val = parseInt(match[1], 10);
      const mult: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      timeoutDurationMs = val * mult[match[2].toLowerCase()];
    }

    const updateParts: string[] = [
      "warn_on_trigger = $1",
      "timeout_on_trigger = $2",
      "timeout_duration = $3",
      "updated_at = NOW()",
    ];

    if (feature === "all") {
      updateParts.push(
        "anti_spam = TRUE",
        "anti_invite = TRUE",
        "anti_link = TRUE",
        "anti_caps = TRUE",
        "anti_mention_spam = TRUE",
        "anti_duplicate = TRUE",
      );
    } else {
      updateParts.push(`${feature} = TRUE`);
    }

    try {
      await pool.query(
        `INSERT INTO automod_settings (guild_id, warn_on_trigger, timeout_on_trigger, timeout_duration)
         VALUES ($4, $1, $2, $3)
         ON CONFLICT (guild_id) DO UPDATE SET ${updateParts.join(", ")}`,
        [warnOnTrigger, timeoutOnTrigger, timeoutDurationMs, guild.id]
      );
    } catch (err) {
      await interaction.reply({ embeds: [errorEmbed("Database Error", "Failed to update AutoMod settings.")] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.color.success as ColorResolvable)
      .setTitle("✅ AutoMod Enabled")
      .setDescription(`**${FEATURES[feature] ?? feature}** has been enabled.`)
      .addFields(
        { name: "Warn on trigger", value: warnOnTrigger ? "Yes" : "No", inline: true },
        { name: "Timeout on trigger", value: timeoutOnTrigger ? "Yes" : "No", inline: true },
      )
      .setTimestamp();

    if (timeoutOnTrigger) {
      embed.addFields({ name: "Timeout duration", value: timeoutDurationStr, inline: true });
    }

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
