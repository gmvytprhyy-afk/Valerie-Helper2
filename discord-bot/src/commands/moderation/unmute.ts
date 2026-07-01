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
    .setName("unmute")
    .setDescription("Remove a timeout from a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to unmute.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the unmute.").setRequired(false).setMaxLength(512)
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

    if (!target.isCommunicationDisabled()) {
      await interaction.reply({ embeds: [errorEmbed("Not Muted", "That member is not currently timed out.")] });
      return;
    }

    const check = checkHierarchy(executor, target, bot);
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed("Hierarchy Error", check.reason!)] });
      return;
    }

    try {
      await target.timeout(null, `[${interaction.user.tag}] ${reason}`);
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Unmute Failed", "Could not remove the timeout.")] });
      return;
    }

    const log = await logModAction(guild.id, targetUser.id, interaction.user.id, "unmute", reason);
    const settings = await getOrCreateGuildSettings(guild.id);

    const embed = buildCaseEmbed({
      action: "unmute",
      moderator: executor,
      target: targetUser,
      reason,
      caseId: log.id,
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
