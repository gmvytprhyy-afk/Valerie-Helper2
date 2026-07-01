import { Client, Events, Message } from "discord.js";
import { query, queryOne } from "../database";
import {
  awardMessageCrystal,
  getMessageCrystalsAwarded,
} from "../utils/crystals";
import { logger } from "../utils/logger";

export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    try {
      const row = await queryOne<{ count: string }>(
        `INSERT INTO message_counts (user_id, guild_id, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, guild_id) DO UPDATE
         SET count = message_counts.count + 1, updated_at = NOW()
         RETURNING count`,
        [userId, guildId]
      );

      const newCount = BigInt(row?.count ?? "1");

      await queryOne(
        `INSERT INTO economy (user_id, guild_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, guild_id) DO NOTHING`,
        [userId, guildId]
      );

      const currentAwarded = await getMessageCrystalsAwarded(userId, guildId);
      await awardMessageCrystal(userId, guildId, newCount, currentAwarded);
    } catch (err) {
      logger.error("MessageCreate", "Error handling message crystal:", err);
    }
  });
}
