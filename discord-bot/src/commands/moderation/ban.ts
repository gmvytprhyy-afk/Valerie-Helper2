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
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to ban.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the ban.").setRequired(false).setMaxLength(512)
    )
    .addIntegerOption((o) =>
      o.setName("delete_days").setDescription("Days of messages to delete (0–7).").setMinValue(0).setMaxValue(7).setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const guild = interaction.guild!;

    const executor = await guild.members.fetch(interaction.user.id);
    const bot = await guild.members.fetchMe();

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember) {
      const check = checkHierarchy(executor, targetMember, bot);
      if (!check.ok) {
        await interaction.reply({ embeds: [errorEmbed("Hierarchy Error", check.reason!)] });
        return;
      }
    }

    if (!bot.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ embeds: [errorEmbed("Missing Permission", "I don't have permission to ban members.")] });
      return;
    }

    try {
      await guild.members.ban(targetUser.id, {
        reason: `[${interaction.user.tag}] ${reason}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Ban Failed", "Could not ban this user. Check my permissions and role hierarchy.")] });
      return;
    }

    const log = await logModAction(guild.id, targetUser.id, interaction.user.id, "ban", reason);
    const settings = await getOrCreateGuildSettings(guild.id);

    const embed = buildCaseEmbed({
      action: "ban",
      moderator: executor,
      target: targetUser,
      reason,
      caseId: log.id,
      extra: deleteDays > 0 ? { "Messages Deleted": `${deleteDays} day(s)` } : undefined,
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
