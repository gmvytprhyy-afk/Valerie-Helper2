import { pool } from "../database";
import { logger } from "../utils/logger";

export async function runWelcomeMigrations(): Promise<void> {
  logger.info("Migrations", "Running welcome/leave migrations...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE guild_settings
        ADD COLUMN IF NOT EXISTS welcome_message TEXT,
        ADD COLUMN IF NOT EXISTS leave_channel   TEXT,
        ADD COLUMN IF NOT EXISTS leave_message   TEXT;
    `);

    await client.query("COMMIT");
    logger.info("Migrations", "Welcome/leave migrations complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Migrations", "Welcome migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
