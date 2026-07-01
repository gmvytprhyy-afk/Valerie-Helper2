import { query, queryOne } from "../database";
import { Economy } from "../types/index";

export async function getCrystals(userId: string, guildId: string): Promise<bigint> {
  const row = await queryOne<{ balance: bigint }>(
    `SELECT balance FROM economy WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return row?.balance ?? 0n;
}

export async function addCrystals(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy> {
  const updated = await queryOne<Economy>(
    `INSERT INTO economy (user_id, guild_id, balance)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, guild_id) DO UPDATE
     SET balance = economy.balance + $3, updated_at = NOW()
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated!;
}

export async function removeCrystals(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy | null> {
  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET balance = balance - $3, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2 AND balance >= $3
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated;
}

export interface LeaderboardEntry {
  user_id: string;
  crystals: string;
  messages: string;
  invites: string;
}

export async function getFullLeaderboard(
  guildId: string,
  limit = 10
): Promise<LeaderboardEntry[]> {
  return query<LeaderboardEntry>(
    `SELECT
       e.user_id,
       e.balance::text           AS crystals,
       COALESCE(mc.count, 0)::text AS messages,
       COALESCE(ij.invite_count, 0)::text AS invites
     FROM economy e
     LEFT JOIN message_counts mc
       ON mc.user_id = e.user_id AND mc.guild_id = e.guild_id
     LEFT JOIN (
       SELECT inviter_id, guild_id, COUNT(*) AS invite_count
       FROM invite_joins
       WHERE guild_id = $1 AND crystal_awarded = TRUE
       GROUP BY inviter_id, guild_id
     ) ij ON ij.inviter_id = e.user_id AND ij.guild_id = e.guild_id
     WHERE e.guild_id = $1
     ORDER BY e.balance DESC
     LIMIT $2`,
    [guildId, limit]
  );
}

export async function getUserRank(userId: string, guildId: string): Promise<number> {
  const row = await queryOne<{ rank: string }>(
    `SELECT COUNT(*) + 1 AS rank
     FROM economy
     WHERE guild_id = $1 AND balance > (
       SELECT COALESCE(balance, 0) FROM economy
       WHERE user_id = $2 AND guild_id = $1
     )`,
    [guildId, userId]
  );
  return parseInt(row?.rank ?? "1", 10);
}

export async function getUserInviteCount(userId: string, guildId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM invite_joins
     WHERE inviter_id = $1 AND guild_id = $2 AND crystal_awarded = TRUE`,
    [userId, guildId]
  );
  return parseInt(row?.count ?? "0", 10);
}

export async function awardMessageCrystal(
  userId: string,
  guildId: string,
  newMessageCount: bigint,
  currentAwarded: bigint
): Promise<boolean> {
  const milestone = newMessageCount / 100n;
  if (milestone <= currentAwarded) return false;

  const diff = milestone - currentAwarded;
  await queryOne(
    `UPDATE economy
     SET balance = balance + $3,
         message_crystals_awarded = $4,
         updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId, diff, milestone]
  );
  return true;
}

export async function getMessageCrystalsAwarded(
  userId: string,
  guildId: string
): Promise<bigint> {
  const row = await queryOne<{ message_crystals_awarded: bigint }>(
    `SELECT message_crystals_awarded FROM economy WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return row?.message_crystals_awarded ?? 0n;
}
