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
    .setName("un-note")
    .setDescription("Remove a staff note from a member's record.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member whose note to remove.").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const guild = interaction.guild!;

    const { rows } = await pool.query(
      `SELECT id, content, moderator_id, created_at FROM notes
       WHERE guild_id = $1 AND target_id = $2
       ORDER BY created_at DESC LIMIT 25`,
      [guild.id, targetUser.id]
    );

    if (rows.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("No Notes", `<@${targetUser.id}> has no notes on record.`)],
      });
      return;
    }

    const options = rows.map((row: any) => ({
      label: `Note #${row.id}`,
      description: (row.content ?? "").slice(0, 100),
      value: String(row.id),
    }));

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("unnote:select")
        .setPlaceholder("Select a note to remove…")
        .addOptions(options)
    );

    const listEmbed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`📝 Notes — ${targetUser.username}`)
      .setDescription(
        rows.map((r: any) =>
          `**#${r.id}** by <@${r.moderator_id}> — ${r.content.slice(0, 80)} *(${new Date(r.created_at).toLocaleDateString()})*`
        ).join("\n")
      )
      .setFooter({ text: "Select a note below to remove it." });

    const reply = await interaction.reply({ embeds: [listEmbed], components: [selectRow], fetchReply: true });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id && i.customId === "unnote:select",
      time: 30_000,
      max: 1,
    });

    collector.on("collect", async (select: StringSelectMenuInteraction) => {
      const noteId = parseInt(select.values[0], 10);

      await pool.query("DELETE FROM notes WHERE id = $1 AND guild_id = $2", [noteId, guild.id]);

      const successEmbed = new EmbedBuilder()
        .setColor(config.color.success as ColorResolvable)
        .setTitle("🗑️ Note Removed")
        .setDescription(`Note **#${noteId}** has been removed from <@${targetUser.id}>'s record.`)
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
