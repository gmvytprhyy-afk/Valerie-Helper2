import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { logModAction } from "../../moderation";
import { getOrCreateGuildSettings } from "../../utility";
import { buildCaseEmbed, sendModLog } from "../../utils/mod-helpers";
import { errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a previously banned user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("user_id").setDescription("The ID of the user to unban.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the unban.").setRequired(false).setMaxLength(512)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const userId = interaction.options.getString("user_id", true).trim();
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const guild = interaction.guild!;

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ embeds: [errorEmbed("Invalid ID", "Please provide a valid Discord user ID (17–20 digits).")] });
      return;
    }

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.reply({ embeds: [errorEmbed("Not Banned", "That user is not currently banned in this server.")] });
      return;
    }

    try {
      await guild.members.unban(userId, `[${interaction.user.tag}] ${reason}`);
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Unban Failed", "Could not unban this user. Check my permissions.")] });
      return;
    }

    const log = await logModAction(guild.id, userId, interaction.user.id, "unban", reason);
    const settings = await getOrCreateGuildSettings(guild.id);
    const executor = await guild.members.fetch(interaction.user.id);

    const embed = buildCaseEmbed({
      action: "unban",
      moderator: executor,
      target: ban.user,
      reason,
      caseId: log.id,
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
