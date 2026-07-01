import { pool } from "../database";
import { logger } from "../utils/logger";

export async function runTicketMigrations(): Promise<void> {
  logger.info("Migrations", "Running ticket/sell migrations...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE guild_settings
        ADD COLUMN IF NOT EXISTS sell_roles TEXT[] NOT NULL DEFAULT '{}';
    `);

    await client.query(`
      ALTER TABLE sell_panels
        ADD COLUMN IF NOT EXISTS looking_for TEXT;
    `);

    await client.query(`
      ALTER TABLE tickets
        ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'support',
        ADD COLUMN IF NOT EXISTS panel_id INT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_panels (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        channel_id  TEXT,
        message_id  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_support_panels_guild ON support_panels (guild_id);
    `);

    await client.query("COMMIT");
    logger.info("Migrations", "Ticket/sell migrations complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Migrations", "Ticket migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
