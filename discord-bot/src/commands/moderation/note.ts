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
import { getOrCreateGuildSettings } from "../../utility";
import { sendModLog } from "../../utils/mod-helpers";
import { errorEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a private staff note to a member's record.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to add a note to.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("content").setDescription("The note content.").setRequired(true).setMaxLength(1000)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const content = interaction.options.getString("content", true);
    const guild = interaction.guild!;

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ embeds: [errorEmbed("Invalid Target", "You cannot add a note to yourself.")] });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO notes (guild_id, target_id, moderator_id, content)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [guild.id, targetUser.id, interaction.user.id, content]
    );

    const note = rows[0];
    const settings = await getOrCreateGuildSettings(guild.id);

    const embed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle(`📝 Note Added — #${note.id}`)
      .addFields(
        { name: "Target", value: `<@${targetUser.id}> \`${targetUser.username}\``, inline: true },
        { name: "Moderator", value: `<@${interaction.user.id}> \`${interaction.user.username}\``, inline: true },
        { name: "Note", value: content },
      )
      .setTimestamp(new Date(note.created_at));

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
