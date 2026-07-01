import { query, queryOne } from "./database";
import { GuildSettings, MessageCount, InviteTracking } from "./types/index";

export async function getOrCreateGuildSettings(
  guildId: string
): Promise<GuildSettings> {
  const existing = await queryOne<GuildSettings>(
    `SELECT * FROM guild_settings WHERE guild_id = $1`,
    [guildId]
  );
  if (existing) return existing;

  const created = await queryOne<GuildSettings>(
    `INSERT INTO guild_settings (guild_id)
     VALUES ($1)
     RETURNING *`,
    [guildId]
  );
  return created!;
}

export async function updateGuildSettings(
  guildId: string,
  settings: Partial<Omit<GuildSettings, "guild_id" | "created_at" | "updated_at">>
): Promise<GuildSettings> {
  await getOrCreateGuildSettings(guildId);
  const fields = Object.keys(settings) as (keyof typeof settings)[];
  const values = Object.values(settings);

  const setClause = fields
    .map((f, i) => `${f} = $${i + 2}`)
    .join(", ");

  const updated = await queryOne<GuildSettings>(
    `UPDATE guild_settings
     SET ${setClause}, updated_at = NOW()
     WHERE guild_id = $1
     RETURNING *`,
    [guildId, ...values]
  );
  return updated!;
}

export async function incrementMessageCount(
  userId: string,
  guildId: string
): Promise<void> {
  await query(
    `INSERT INTO message_counts (user_id, guild_id, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, guild_id) DO UPDATE
     SET count = message_counts.count + 1, updated_at = NOW()`,
    [userId, guildId]
  );
}

export async function getMessageCount(
  userId: string,
  guildId: string
): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count FROM message_counts WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId]
  );
  return row ? parseInt(row.count, 10) : 0;
}

export async function getMessageLeaderboard(
  guildId: string,
  limit = 10
): Promise<MessageCount[]> {
  return query<MessageCount>(
    `SELECT * FROM message_counts
     WHERE guild_id = $1
     ORDER BY count DESC
     LIMIT $2`,
    [guildId, limit]
  );
}

export async function upsertInvite(
  inviteCode: string,
  guildId: string,
  inviterId: string,
  uses: number
): Promise<InviteTracking> {
  const row = await queryOne<InviteTracking>(
    `INSERT INTO invite_tracking (invite_code, guild_id, inviter_id, uses)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (invite_code, guild_id) DO UPDATE
     SET uses = $4, updated_at = NOW()
     RETURNING *`,
    [inviteCode, guildId, inviterId, uses]
  );
  return row!;
}

export async function getInvitesByUser(
  inviterId: string,
  guildId: string
): Promise<InviteTracking[]> {
  return query<InviteTracking>(
    `SELECT * FROM invite_tracking
     WHERE inviter_id = $1 AND guild_id = $2
     ORDER BY uses DESC`,
    [inviterId, guildId]
  );
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
