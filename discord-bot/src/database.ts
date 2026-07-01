import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[Database] Unexpected error on idle client:", err);
});

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`[Database] Slow query (${duration}ms):`, text);
  }
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function initDatabase(): Promise<void> {
  console.log("[Database] Initializing tables...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id        TEXT PRIMARY KEY,
        prefix          TEXT NOT NULL DEFAULT '!',
        log_channel     TEXT,
        mod_channel     TEXT,
        welcome_channel TEXT,
        mute_role       TEXT,
        ticket_category TEXT,
        ticket_log      TEXT,
        automod_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS economy (
        user_id    TEXT NOT NULL,
        guild_id   TEXT NOT NULL,
        balance    BIGINT NOT NULL DEFAULT 0,
        bank       BIGINT NOT NULL DEFAULT 0,
        xp         BIGINT NOT NULL DEFAULT 0,
        level      INT NOT NULL DEFAULT 0,
        daily_last TIMESTAMPTZ,
        work_last  TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, guild_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_counts (
        user_id    TEXT NOT NULL,
        guild_id   TEXT NOT NULL,
        count      BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, guild_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_tracking (
        invite_code TEXT NOT NULL,
        guild_id    TEXT NOT NULL,
        inviter_id  TEXT NOT NULL,
        uses        INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (invite_code, guild_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shop_panels (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        channel_id  TEXT,
        message_id  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_shop_panels_guild
        ON shop_panels (guild_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shop_items (
        id          SERIAL PRIMARY KEY,
        panel_id    INT NOT NULL REFERENCES shop_panels(id) ON DELETE CASCADE,
        guild_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        price       BIGINT NOT NULL DEFAULT 0,
        role_id     TEXT,
        quantity    INT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_shop_items_panel
        ON shop_items (panel_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sell_panels (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        channel_id  TEXT,
        message_id  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sell_panels_guild
        ON sell_panels (guild_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sell_items (
        id          SERIAL PRIMARY KEY,
        panel_id    INT NOT NULL REFERENCES sell_panels(id) ON DELETE CASCADE,
        guild_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        price       BIGINT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sell_items_panel
        ON sell_items (panel_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        channel_id  TEXT NOT NULL UNIQUE,
        user_id     TEXT NOT NULL,
        subject     TEXT,
        status      TEXT NOT NULL DEFAULT 'open',
        claimed_by  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at   TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_guild
        ON tickets (guild_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user
        ON tickets (user_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id         SERIAL PRIMARY KEY,
        ticket_id  INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
        ON ticket_messages (ticket_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS moderation_logs (
        id          SERIAL PRIMARY KEY,
        guild_id    TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        action      TEXT NOT NULL,
        reason      TEXT,
        duration    BIGINT,
        expires_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mod_logs_guild
        ON moderation_logs (guild_id);
      CREATE INDEX IF NOT EXISTS idx_mod_logs_target
        ON moderation_logs (target_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id           SERIAL PRIMARY KEY,
        guild_id     TEXT NOT NULL,
        target_id    TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        content      TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_notes_guild_target
        ON notes (guild_id, target_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS automod_settings (
        guild_id             TEXT PRIMARY KEY,
        anti_spam            BOOLEAN NOT NULL DEFAULT FALSE,
        anti_invite          BOOLEAN NOT NULL DEFAULT FALSE,
        anti_link            BOOLEAN NOT NULL DEFAULT FALSE,
        anti_caps            BOOLEAN NOT NULL DEFAULT FALSE,
        anti_mention_spam    BOOLEAN NOT NULL DEFAULT FALSE,
        max_mentions         INT NOT NULL DEFAULT 5,
        caps_threshold       INT NOT NULL DEFAULT 70,
        spam_threshold       INT NOT NULL DEFAULT 5,
        spam_window_seconds  INT NOT NULL DEFAULT 5,
        log_channel          TEXT,
        exempt_roles         TEXT[] NOT NULL DEFAULT '{}',
        exempt_channels      TEXT[] NOT NULL DEFAULT '{}',
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query("COMMIT");
    console.log("[Database] All tables initialized successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Database] Failed to initialize tables:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export { pool };
