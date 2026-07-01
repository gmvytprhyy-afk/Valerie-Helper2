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

const ACTION_EMOJI: Record<string, string> = {
  ban: "🔨", kick: "👢", mute: "🔇", warn: "⚠️",
  unban: "✅", unmute: "🔊", unwarn: "✅", automod: "🤖",
};

export default {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("View moderation history and notes for a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to look up.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("type")
        .setDescription("What to show.")
        .setRequired(false)
        .addChoices(
          { name: "All", value: "all" },
          { name: "Warnings only", value: "warn" },
          { name: "Notes only", value: "notes" },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const type = interaction.options.getString("type") ?? "all";
    const guild = interaction.guild!;

    const [logsResult, notesResult] = await Promise.all([
      type !== "notes"
        ? pool.query(
            `SELECT id, action, reason, created_at FROM moderation_logs
             WHERE guild_id = $1 AND target_id = $2
             ${type === "warn" ? "AND action = 'warn'" : ""}
             ORDER BY created_at DESC LIMIT 20`,
            [guild.id, targetUser.id]
          )
        : Promise.resolve({ rows: [] }),
      type === "all" || type === "notes"
        ? pool.query(
            `SELECT id, content, moderator_id, created_at FROM notes
             WHERE guild_id = $1 AND target_id = $2
             ORDER BY created_at DESC LIMIT 10`,
            [guild.id, targetUser.id]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const logs: any[] = logsResult.rows;
    const notes: any[] = notesResult.rows;

    if (logs.length === 0 && notes.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("No Records", `No moderation history found for <@${targetUser.id}>.`)],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`🛡️ History — ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    if (logs.length > 0) {
      const warnCount = logs.filter((l) => l.action === "warn").length;
      embed.setDescription(
        `**Total cases:** ${logs.length}${warnCount > 0 ? ` • **Warnings:** ${warnCount}` : ""}`
      );
      embed.addFields({
        name: "📋 Cases",
        value: logs.map((l) =>
          `${ACTION_EMOJI[l.action] ?? "🛡️"} **#${l.id}** \`${l.action}\` — ${
            (l.reason ?? "No reason").slice(0, 60)
          } *(${new Date(l.created_at).toLocaleDateString()})*`
        ).join("\n"),
      });
    }

    if (notes.length > 0) {
      embed.addFields({
        name: "📝 Notes",
        value: notes.map((n) =>
          `**#${n.id}** <@${n.moderator_id}> — ${n.content.slice(0, 80)} *(${new Date(n.created_at).toLocaleDateString()})*`
        ).join("\n"),
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
