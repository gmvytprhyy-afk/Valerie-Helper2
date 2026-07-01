import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { getFullLeaderboard } from "../../utils/crystals";
import config from "../../../config.json";

const MEDALS = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the crystal leaderboard for this server.")
    .addIntegerOption((opt) =>
      opt
        .setName("limit")
        .setDescription("Number of entries to show (default 10, max 25).")
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(25)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const limit = interaction.options.getInteger("limit") ?? 10;
    const guildId = interaction.guildId!;

    await interaction.deferReply();

    const entries = await getFullLeaderboard(guildId, limit);

    if (entries.length === 0) {
      const empty = new EmbedBuilder()
        .setColor(config.color.primary as ColorResolvable)
        .setTitle("💎 Crystal Leaderboard")
        .setDescription("No one has earned any crystals yet. Start chatting and inviting!")
        .setTimestamp();
      await interaction.editReply({ embeds: [empty] });
      return;
    }

    const rows: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const rank = i < 3 ? MEDALS[i] : `\`${String(i + 1).padStart(2, " ")}\``;
      let username: string;
      try {
        const member = await interaction.guild!.members.fetch(e.user_id).catch(() => null);
        username = member?.user.username ?? `User ${e.user_id.slice(0, 6)}`;
      } catch {
        username = `User ${e.user_id.slice(0, 6)}`;
      }

      const crystals = BigInt(e.crystals).toLocaleString();
      const messages = parseInt(e.messages, 10).toLocaleString();
      const invites = e.invites;

      rows.push(
        `${rank} **${username}** — **${crystals}** 💎 · ${messages} 💬 · ${invites} 🔗`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`💎 Crystal Leaderboard — ${interaction.guild!.name}`)
      .setDescription(rows.join("\n"))
      .setFooter({
        text: `💎 Crystals · 💬 Messages · 🔗 Invites`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
} satisfies Command;
