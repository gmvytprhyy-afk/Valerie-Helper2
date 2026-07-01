import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ColorResolvable,
  ComponentType,
} from "discord.js";
import { Command } from "../../types/index";
import { pool } from "../../database";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Remove a warning from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member whose warning to remove.").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const guild = interaction.guild!;

    const { rows } = await pool.query(
      `SELECT id, reason, created_at FROM moderation_logs
       WHERE guild_id = $1 AND target_id = $2 AND action = 'warn'
       ORDER BY created_at DESC LIMIT 25`,
      [guild.id, targetUser.id]
    );

    if (rows.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("No Warnings", `<@${targetUser.id}> has no active warnings.`)],
      });
      return;
    }

    const options = rows.map((row: any) => ({
      label: `Warning #${row.id}`,
      description: (row.reason ?? "No reason").slice(0, 100),
      value: String(row.id),
    }));

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("unwarn:select")
        .setPlaceholder("Select a warning to remove…")
        .addOptions(options)
    );

    const listEmbed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`⚠️ Warnings — ${targetUser.username}`)
      .setDescription(
        rows.map((r: any) =>
          `**#${r.id}** — ${(r.reason ?? "No reason").slice(0, 80)} *(${new Date(r.created_at).toLocaleDateString()})*`
        ).join("\n")
      )
      .setFooter({ text: "Select a warning below to remove it." });

    const reply = await interaction.reply({ embeds: [listEmbed], components: [row], fetchReply: true });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id && i.customId === "unwarn:select",
      time: 30_000,
      max: 1,
    });

    collector.on("collect", async (select: StringSelectMenuInteraction) => {
      const warningId = parseInt(select.values[0], 10);

      await pool.query("DELETE FROM moderation_logs WHERE id = $1 AND guild_id = $2", [warningId, guild.id]);

      const successEmbed = new EmbedBuilder()
        .setColor(config.color.success as ColorResolvable)
        .setTitle("✅ Warning Removed")
        .setDescription(`Warning **#${warningId}** has been removed from <@${targetUser.id}>.`)
        .setTimestamp();

      await select.update({ embeds: [successEmbed], components: [] });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({ components: [] }).catch(() => null);
      }
    });
  },
} satisfies Command;
