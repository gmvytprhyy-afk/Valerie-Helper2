import {
  Client,
  Events,
  GuildMember,
  PartialGuildMember,
  TextChannel,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { queryOne, query } from "../database";
import { removeCrystals } from "../utils/crystals";
import { getOrCreateGuildSettings } from "../utility";
import { logger } from "../utils/logger";
import config from "../../config.json";

async function sendLeaveMessage(member: GuildMember | PartialGuildMember): Promise<void> {
  const settings = await getOrCreateGuildSettings(member.guild.id);
  if (!settings.leave_channel || !settings.leave_message) return;

  const channel = member.guild.channels.cache.get(settings.leave_channel) as TextChannel | undefined;
  if (!channel) return;

  const username = member.user?.username ?? `User ${member.id}`;

  const text = settings.leave_message
    .replace(/\{user\}/g, `**${username}**`)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));

  const embed = new EmbedBuilder()
    .setColor(config.color.error as ColorResolvable)
    .setTitle(`👋 Goodbye!`)
    .setDescription(text)
    .setThumbnail(member.user?.displayAvatarURL() ?? null)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleInviteLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const guildId = member.guild.id;
  const inviteeId = member.id;

  const joinRecord = await queryOne<{
    id: number;
    inviter_id: string;
    crystal_awarded: boolean;
  }>(
    `SELECT id, inviter_id, crystal_awarded
     FROM invite_joins
     WHERE invitee_id = $1 AND guild_id = $2
       AND left_at IS NULL
     ORDER BY joined_at DESC
     LIMIT 1`,
    [inviteeId, guildId]
  );

  if (!joinRecord) return;

  await query(`UPDATE invite_joins SET left_at = NOW() WHERE id = $1`, [joinRecord.id]);

  if (joinRecord.crystal_awarded) {
    await removeCrystals(joinRecord.inviter_id, guildId, 1n);
    logger.info(
      "GuildMemberRemove",
      `Removed 1 crystal from ${joinRecord.inviter_id} — invited member ${inviteeId} left`
    );
  }
}

export function registerGuildMemberRemove(client: Client): void {
  client.on(
    Events.GuildMemberRemove,
    async (member: GuildMember | PartialGuildMember) => {
      await Promise.allSettled([
        sendLeaveMessage(member).catch((err) =>
          logger.error("GuildMemberRemove", "Failed to send leave message:", err)
        ),
        handleInviteLeave(member).catch((err) =>
          logger.error("GuildMemberRemove", "Invite leave error:", err)
        ),
      ]);
    }
  );
}
