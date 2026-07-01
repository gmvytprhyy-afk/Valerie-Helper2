import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { getOrCreateEconomy } from "../../economy";
import {
  getUserRank,
  getUserInviteCount,
} from "../../utils/crystals";
import { queryOne } from "../../database";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your crystal balance and stats.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Check another member's balance.")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;

    const eco = await getOrCreateEconomy(target.id, guildId);
    const rank = await getUserRank(target.id, guildId);
    const invites = await getUserInviteCount(target.id, guildId);
    const msgRow = await queryOne<{ count: string }>(
      `SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2`,
      [target.id, guildId]
    );
    const messages = parseInt(msgRow?.count ?? "0", 10);

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`💎 ${target.username}'s Balance`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        {
          name: "Crystals",
          value: `**${eco.balance.toLocaleString()}** 💎`,
          inline: true,
        },
        {
          name: "Server Rank",
          value: `**#${rank}**`,
          inline: true,
        },
        {
          name: "\u200b",
          value: "\u200b",
          inline: true,
        },
        {
          name: "Messages Sent",
          value: `**${messages.toLocaleString()}** 💬`,
          inline: true,
        },
        {
          name: "Successful Invites",
          value: `**${invites}** 🔗`,
          inline: true,
        },
        {
          name: "Next Crystal",
          value: `**${100 - (messages % 100)}** messages away 📨`,
          inline: true,
        }
      )
      .setFooter({ text: "Every 100 messages = +1 💎 · Every invite = +1 💎" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
