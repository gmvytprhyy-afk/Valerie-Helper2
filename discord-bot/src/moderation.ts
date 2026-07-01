import { query, queryOne } from "./database";
import { ModerationLog, Note, AutoModSettings } from "./types/index";

export async function logModAction(
  guildId: string,
  targetId: string,
  moderatorId: string,
  action: string,
  reason?: string,
  duration?: bigint,
  expiresAt?: Date
): Promise<ModerationLog> {
  const log = await queryOne<ModerationLog>(
    `INSERT INTO moderation_logs
       (guild_id, target_id, moderator_id, action, reason, duration, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      guildId,
      targetId,
      moderatorId,
      action,
      reason ?? null,
      duration ?? null,
      expiresAt ?? null,
    ]
  );
  return log!;
}

export async function getUserModLogs(
  targetId: string,
  guildId: string
): Promise<ModerationLog[]> {
  return query<ModerationLog>(
    `SELECT * FROM moderation_logs
     WHERE target_id = $1 AND guild_id = $2
     ORDER BY created_at DESC`,
    [targetId, guildId]
  );
}

export async function getModLog(id: number): Promise<ModerationLog | null> {
  return queryOne<ModerationLog>(
    `SELECT * FROM moderation_logs WHERE id = $1`,
    [id]
  );
}

export async function deleteModLog(id: number, guildId: string): Promise<boolean> {
  const res = await queryOne<{ id: number }>(
    `DELETE FROM moderation_logs WHERE id = $1 AND guild_id = $2 RETURNING id`,
    [id, guildId]
  );
  return res !== null;
}

export async function getActiveInfractions(guildId: string): Promise<ModerationLog[]> {
  return query<ModerationLog>(
    `SELECT * FROM moderation_logs
     WHERE guild_id = $1 AND expires_at IS NOT NULL AND expires_at > NOW()
     ORDER BY expires_at ASC`,
    [guildId]
  );
}

export async function addNote(
  guildId: string,
  targetId: string,
  moderatorId: string,
  content: string
): Promise<Note> {
  const note = await queryOne<Note>(
    `INSERT INTO notes (guild_id, target_id, moderator_id, content)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [guildId, targetId, moderatorId, content]
  );
  return note!;
}

export async function getUserNotes(
  targetId: string,
  guildId: string
): Promise<Note[]> {
  return query<Note>(
    `SELECT * FROM notes
     WHERE target_id = $1 AND guild_id = $2
     ORDER BY created_at DESC`,
    [targetId, guildId]
  );
}

export async function deleteNote(id: number, guildId: string): Promise<boolean> {
  const res = await queryOne<{ id: number }>(
    `DELETE FROM notes WHERE id = $1 AND guild_id = $2 RETURNING id`,
    [id, guildId]
  );
  return res !== null;
}

export async function getAutoModSettings(
  guildId: string
): Promise<AutoModSettings | null> {
  return queryOne<AutoModSettings>(
    `SELECT * FROM automod_settings WHERE guild_id = $1`,
    [guildId]
  );
}

export async function upsertAutoModSettings(
  guildId: string,
  settings: Partial<Omit<AutoModSettings, "guild_id" | "updated_at">>
): Promise<AutoModSettings> {
  const fields = Object.keys(settings) as (keyof typeof settings)[];
  const values = Object.values(settings);

  const setClause = fields
    .map((f, i) => `${f} = $${i + 2}`)
    .join(", ");

  const updated = await queryOne<AutoModSettings>(
    `INSERT INTO automod_settings (guild_id)
     VALUES ($1)
     ON CONFLICT (guild_id) DO UPDATE
     SET ${setClause}, updated_at = NOW()
     RETURNING *`,
    [guildId, ...values]
  );
  return updated!;
}
