import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { pool } from "../../database";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("memberinfo")
    .setDescription("View detailed information about a server member.")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to inspect (defaults to you).").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const guild = interaction.guild!;

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color.error as ColorResolvable)
            .setTitle("❌ Not Found")
            .setDescription("That user is not in this server."),
        ],
      });
      return;
    }

    // Fetch economy + message stats in parallel
    const [econRow, msgRow, inviteRow] = await Promise.all([
      pool.query<{ balance: string }>(
        `SELECT balance::text FROM economy WHERE user_id = $1 AND guild_id = $2`,
        [targetUser.id, guild.id]
      ),
      pool.query<{ count: string }>(
        `SELECT count::text FROM message_counts WHERE user_id = $1 AND guild_id = $2`,
        [targetUser.id, guild.id]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM invite_joins
         WHERE inviter_id = $1 AND guild_id = $2 AND crystal_awarded = TRUE`,
        [targetUser.id, guild.id]
      ),
    ]);

    const crystals = econRow.rows[0]?.balance ?? "0";
    const messages = msgRow.rows[0]?.count ?? "0";
    const invites = inviteRow.rows[0]?.count ?? "0";

    const roles = member.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `<@&${r.id}>`)
      .slice(0, 15);

    const accountCreated = Math.floor(targetUser.createdTimestamp / 1000);
    const joinedAt = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

    const embed = new EmbedBuilder()
      .setColor(member.displayColor || (config.color.primary as number))
      .setTitle(`👤 ${member.displayName}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "🆔 User ID", value: `\`${targetUser.id}\``, inline: true },
        { name: "🤖 Bot", value: targetUser.bot ? "Yes" : "No", inline: true },
        { name: "📅 Account Created", value: `<t:${accountCreated}:D> (<t:${accountCreated}:R>)`, inline: false },
        { name: "📥 Joined Server", value: joinedAt ? `<t:${joinedAt}:D> (<t:${joinedAt}:R>)` : "Unknown", inline: false },
        { name: "💎 Crystals", value: parseInt(crystals, 10).toLocaleString(), inline: true },
        { name: "💬 Messages", value: parseInt(messages, 10).toLocaleString(), inline: true },
        { name: "🔗 Invites", value: invites, inline: true },
      )
      .setTimestamp();

    if (roles.length > 0) {
      embed.addFields({
        name: `🎭 Roles (${member.roles.cache.size - 1})`,
        value: roles.join(" ") + (member.roles.cache.size - 1 > 15 ? " …" : ""),
      });
    }

    if (member.isCommunicationDisabled()) {
      const until = Math.floor(member.communicationDisabledUntilTimestamp! / 1000);
      embed.addFields({ name: "🔇 Timed Out Until", value: `<t:${until}:R>` });
    }

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
