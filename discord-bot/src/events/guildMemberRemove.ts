import { Client, Events, GuildMember, PartialGuildMember } from "discord.js";
import { queryOne, query } from "../database";
import { removeCrystals } from "../utils/crystals";
import { logger } from "../utils/logger";

export function registerGuildMemberRemove(client: Client): void {
  client.on(
    Events.GuildMemberRemove,
    async (member: GuildMember | PartialGuildMember) => {
      const guildId = member.guild.id;
      const inviteeId = member.id;

      try {
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

        await query(
          `UPDATE invite_joins SET left_at = NOW() WHERE id = $1`,
          [joinRecord.id]
        );

        if (joinRecord.crystal_awarded) {
          await removeCrystals(joinRecord.inviter_id, guildId, 1n);
          logger.info(
            "GuildMemberRemove",
            `Removed 1 crystal from ${joinRecord.inviter_id} — invited member ${inviteeId} left`
          );
        }
      } catch (err) {
        logger.error("GuildMemberRemove", "Error handling member leave:", err);
      }
    }
  );
}
