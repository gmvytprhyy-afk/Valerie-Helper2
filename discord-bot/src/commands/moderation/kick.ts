import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { logModAction } from "../../moderation";
import { getOrCreateGuildSettings } from "../../utility";
import { buildCaseEmbed, sendModLog, checkHierarchy } from "../../utils/mod-helpers";
import { errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to kick.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the kick.").setRequired(false).setMaxLength(512)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const guild = interaction.guild!;

    const executor = await guild.members.fetch(interaction.user.id);
    const bot = await guild.members.fetchMe();
    const target = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!target) {
      await interaction.reply({ embeds: [errorEmbed("Not Found", "That user is not in this server.")] });
      return;
    }

    const check = checkHierarchy(executor, target, bot);
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed("Hierarchy Error", check.reason!)] });
      return;
    }

    if (!target.kickable) {
      await interaction.reply({ embeds: [errorEmbed("Cannot Kick", "I cannot kick this member. Check my role position.")] });
      return;
    }

    try {
      await target.kick(`[${interaction.user.tag}] ${reason}`);
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Kick Failed", "Could not kick this member.")] });
      return;
    }

    const log = await logModAction(guild.id, targetUser.id, interaction.user.id, "kick", reason);
    const settings = await getOrCreateGuildSettings(guild.id);

    const embed = buildCaseEmbed({
      action: "kick",
      moderator: executor,
      target: targetUser,
      reason,
      caseId: log.id,
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
