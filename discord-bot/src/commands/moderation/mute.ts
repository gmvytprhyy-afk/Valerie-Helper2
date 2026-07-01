import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { logModAction } from "../../moderation";
import { getOrCreateGuildSettings } from "../../utility";
import {
  buildCaseEmbed,
  sendModLog,
  checkHierarchy,
  parseDurationInput,
  formatDurationMs,
  MAX_TIMEOUT_MS,
} from "../../utils/mod-helpers";
import { errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout (mute) a member. Uses Discord's built-in timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to mute.").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("duration")
        .setDescription("Duration: 10m, 1h, 7d (max 28d).")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the mute.").setRequired(false).setMaxLength(512)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user", true);
    const durationStr = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const guild = interaction.guild!;

    const durationMs = parseDurationInput(durationStr);
    if (!durationMs || durationMs < 1000) {
      await interaction.reply({ embeds: [errorEmbed("Invalid Duration", "Use a format like `10m`, `1h`, `7d`. Minimum is 1 second.")] });
      return;
    }
    if (durationMs > MAX_TIMEOUT_MS) {
      await interaction.reply({ embeds: [errorEmbed("Duration Too Long", "Maximum timeout duration is 28 days.")] });
      return;
    }

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

    if (!target.moderatable) {
      await interaction.reply({ embeds: [errorEmbed("Cannot Mute", "I cannot timeout this member. Check my role position.")] });
      return;
    }

    const expiresAt = new Date(Date.now() + durationMs);

    try {
      await target.timeout(durationMs, `[${interaction.user.tag}] ${reason}`);
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Mute Failed", "Could not timeout this member.")] });
      return;
    }

    const log = await logModAction(
      guild.id, targetUser.id, interaction.user.id,
      "mute", reason, BigInt(durationMs), expiresAt
    );
    const settings = await getOrCreateGuildSettings(guild.id);
    const durationLabel = formatDurationMs(durationMs);

    const embed = buildCaseEmbed({
      action: "mute",
      moderator: executor,
      target: targetUser,
      reason,
      duration: durationLabel,
      caseId: log.id,
      extra: { "Expires": `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` },
    });

    await sendModLog(guild, embed, settings);
    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
