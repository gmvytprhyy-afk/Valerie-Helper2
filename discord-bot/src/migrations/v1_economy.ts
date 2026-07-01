import { pool } from "../database";
import { logger } from "../utils/logger";

export async function runMigrations(): Promise<void> {
  logger.info("Migrations", "Running economy migrations...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE economy
        ADD COLUMN IF NOT EXISTS message_crystals_awarded BIGINT NOT NULL DEFAULT 0;
    `);

    await client.query(`
      ALTER TABLE guild_settings
        ADD COLUMN IF NOT EXISTS ping_roles TEXT[] NOT NULL DEFAULT '{}';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_joins (
        id              SERIAL PRIMARY KEY,
        guild_id        TEXT NOT NULL,
        invitee_id      TEXT NOT NULL,
        inviter_id      TEXT NOT NULL,
        invite_code     TEXT NOT NULL,
        crystal_awarded BOOLEAN NOT NULL DEFAULT FALSE,
        is_farming      BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_at         TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_invite_joins_guild    ON invite_joins (guild_id);
      CREATE INDEX IF NOT EXISTS idx_invite_joins_invitee  ON invite_joins (invitee_id, guild_id);
      CREATE INDEX IF NOT EXISTS idx_invite_joins_inviter  ON invite_joins (inviter_id, guild_id);
    `);

    await client.query("COMMIT");
    logger.info("Migrations", "Economy migrations complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Migrations", "Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
