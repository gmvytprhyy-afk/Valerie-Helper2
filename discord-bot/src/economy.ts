import { query, queryOne } from "./database";
import { Economy } from "./types/index";

export async function getOrCreateEconomy(
  userId: string,
  guildId: string
): Promise<Economy> {
  const existing = await queryOne<Economy>(
    `SELECT * FROM economy WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  if (existing) return existing;

  const created = await queryOne<Economy>(
    `INSERT INTO economy (user_id, guild_id)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, guildId]
  );
  return created!;
}

export async function getBalance(
  userId: string,
  guildId: string
): Promise<{ balance: bigint; bank: bigint }> {
  const row = await queryOne<{ balance: bigint; bank: bigint }>(
    `SELECT balance, bank FROM economy WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return row ?? { balance: 0n, bank: 0n };
}

export async function addBalance(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy> {
  await getOrCreateEconomy(userId, guildId);
  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET balance = balance + $3, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated!;
}

export async function subtractBalance(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy | null> {
  await getOrCreateEconomy(userId, guildId);
  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET balance = balance - $3, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2 AND balance >= $3
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated;
}

export async function depositBank(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy | null> {
  await getOrCreateEconomy(userId, guildId);
  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET balance = balance - $3, bank = bank + $3, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2 AND balance >= $3
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated;
}

export async function withdrawBank(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<Economy | null> {
  await getOrCreateEconomy(userId, guildId);
  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET bank = bank - $3, balance = balance + $3, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2 AND bank >= $3
     RETURNING *`,
    [userId, guildId, amount]
  );
  return updated;
}

export async function setDailyClaimed(
  userId: string,
  guildId: string
): Promise<void> {
  await query(
    `UPDATE economy SET daily_last = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
}

export async function setWorkClaimed(
  userId: string,
  guildId: string
): Promise<void> {
  await query(
    `UPDATE economy SET work_last = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
}

export async function addXp(
  userId: string,
  guildId: string,
  amount: bigint
): Promise<{ economy: Economy; leveledUp: boolean }> {
  const eco = await getOrCreateEconomy(userId, guildId);
  const newXp = eco.xp + amount;
  const newLevel = Math.floor(0.1 * Math.sqrt(Number(newXp)));
  const leveledUp = newLevel > eco.level;

  const updated = await queryOne<Economy>(
    `UPDATE economy
     SET xp = $3, level = $4, updated_at = NOW()
     WHERE user_id = $1 AND guild_id = $2
     RETURNING *`,
    [userId, guildId, newXp, newLevel]
  );

  return { economy: updated!, leveledUp };
}

export async function getLeaderboard(
  guildId: string,
  limit = 10
): Promise<Economy[]> {
  return query<Economy>(
    `SELECT * FROM economy
     WHERE guild_id = $1
     ORDER BY balance + bank DESC
     LIMIT $2`,
    [guildId, limit]
  );
}
