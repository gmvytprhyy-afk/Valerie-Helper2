import { Client, Events, GuildMember, Collection, Invite } from "discord.js";
import { inviteCache } from "../utils/invite-cache";
import { queryOne, query } from "../database";
import { addCrystals } from "../utils/crystals";
import { logger } from "../utils/logger";

export function registerGuildMemberAdd(client: Client): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const { guild } = member;
    const guildId = guild.id;
    const inviteeId = member.id;

    try {
      let currentInvites: Collection<string, Invite>;
      try {
        currentInvites = await guild.invites.fetch();
      } catch {
        logger.warn("GuildMemberAdd", `No permission to fetch invites in ${guildId}`);
        return;
      }

      const cached = inviteCache.get(guildId) ?? new Collection<string, Invite>();
      inviteCache.set(guildId, currentInvites);

      let usedCode: string | null = null;
      let inviterId: string | null = null;

      for (const [code, invite] of currentInvites) {
        const old = cached.get(code);
        const oldUses = old?.uses ?? 0;
        const newUses = invite.uses ?? 0;
        if (newUses > oldUses) {
          usedCode = code;
          inviterId = invite.inviterId ?? invite.inviter?.id ?? null;
          break;
        }
      }

      if (!usedCode || !inviterId) {
        logger.debug("GuildMemberAdd", `Could not determine invite for ${inviteeId}`);
        return;
      }

      const hasPreviousJoin = await queryOne<{ id: number }>(
        `SELECT id FROM invite_joins
         WHERE invitee_id = $1 AND guild_id = $2
         LIMIT 1`,
        [inviteeId, guildId]
      );

      const isFarming = hasPreviousJoin !== null;

      await query(
        `INSERT INTO invite_joins
           (guild_id, invitee_id, inviter_id, invite_code, crystal_awarded, is_farming)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [guildId, inviteeId, inviterId, usedCode, !isFarming, isFarming]
      );

      if (!isFarming) {
        await addCrystals(inviterId, guildId, 1n);
        logger.info(
          "GuildMemberAdd",
          `Awarded 1 crystal to ${inviterId} for inviting ${inviteeId}`
        );
      } else {
        logger.info(
          "GuildMemberAdd",
          `Skipped crystal for ${inviterId} — ${inviteeId} has joined before (farming prevention)`
        );
      }
    } catch (err) {
      logger.error("GuildMemberAdd", "Error handling member join:", err);
    }
  });
}
