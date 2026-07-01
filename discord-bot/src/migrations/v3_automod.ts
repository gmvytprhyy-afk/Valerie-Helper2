import { pool } from "../database";
import { logger } from "../utils/logger";

export async function runAutomodMigrations(): Promise<void> {
  logger.info("Migrations", "Running automod migrations...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE automod_settings
        ADD COLUMN IF NOT EXISTS blocked_words    TEXT[]  NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS anti_duplicate   BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS warn_on_trigger  BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS timeout_on_trigger BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS timeout_duration BIGINT  NOT NULL DEFAULT 300000;
    `);

    await client.query("COMMIT");
    logger.info("Migrations", "Automod migrations complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Migrations", "Automod migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
