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
    .setName("warn")
    .setDescription("Issue a warning to a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to warn.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the warning.").setRequired(true).setMaxLength(512)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true);
    const guild = interaction.guild!;

    const executor = await guild.members.fetch(interaction.user.id);
    const target = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!target) {
      await interaction.reply({ embeds: [errorEmbed("Not Found", "That user is not in this server.")] });
      return;
    }

    const check = checkHierarchy(executor, target);
    if (!check.ok) {
      await interaction.reply({ embeds: [errorEmbed("Hierarchy Error", check.reason!)] });
      return;
    }

    const log = await logModAction(guild.id, targetUser.id, interaction.user.id, "warn", reason);
    const settings = await getOrCreateGuildSettings(guild.id);

    const embed = buildCaseEmbed({
      action: "warn",
      moderator: executor,
      target: targetUser,
      reason,
      caseId: log.id,
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });

    try {
      const dm = await targetUser.createDM();
      await dm.send({
        embeds: [buildCaseEmbed({
          action: "warn",
          moderator: executor,
          target: targetUser,
          reason,
          extra: { "Server": guild.name },
        })],
      });
    } catch {
      // DMs may be disabled; fail silently
    }
  },
} satisfies Command;
