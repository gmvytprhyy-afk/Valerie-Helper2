import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  ChatInputCommandInteraction,
  ActivityType,
} from "discord.js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { initDatabase, testConnection } from "./database";
import { runMigrations } from "./migrations/v1_economy";
import { runTicketMigrations } from "./migrations/v2_tickets";
import { runAutomodMigrations } from "./migrations/v3_automod";
import { runWelcomeMigrations } from "./migrations/v4_welcome";
import { registerAllEvents, populateInviteCache } from "./handlers/events";
import { Command } from "./types/index";
import { logger } from "./utils/logger";
import { errorEmbed } from "./utils/embed";

dotenv.config();

declare module "discord.js" {
  interface Client {
    commands: Collection<string, Command>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  presence: {
    activities: [{ name: "Valerie Helper", type: ActivityType.Watching }],
    status: "online",
  },
});

client.commands = new Collection();

function loadCommands(): void {
  const commandsPath = path.join(__dirname, "commands");
  if (!fs.existsSync(commandsPath)) {
    logger.info("Bot", "No commands directory found, skipping command load.");
    return;
  }

  const categories = fs
    .readdirSync(commandsPath)
    .filter((item) => fs.statSync(path.join(commandsPath, item)).isDirectory());

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const commandFiles = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".js") || f.endsWith(".ts"));

    for (const file of commandFiles) {
      const filePath = path.join(categoryPath, file);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const command: Command = require(filePath).default ?? require(filePath);
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        logger.debug("Bot", `Loaded command: ${command.data.name}`);
      } else {
        logger.warn("Bot", `Skipping malformed command at ${filePath}`);
      }
    }
  }

  logger.info("Bot", `Loaded ${client.commands.size} command(s).`);
}

client.once(Events.ClientReady, async (c) => {
  logger.info("Bot", `Ready! Logged in as ${c.user.tag}`);
  logger.info("Bot", `Serving ${c.guilds.cache.size} guild(s).`);
  for (const [, guild] of c.guilds.cache) {
    await populateInviteCache(guild);
  }
  logger.info("Bot", "Invite cache populated.");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) {
    logger.warn("Bot", `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await cmd.execute(interaction as ChatInputCommandInteraction, client);
  } catch (err) {
    logger.error(
      "Bot",
      `Error executing command "${interaction.commandName}":`,
      err
    );
    const embed = errorEmbed(
      "Something went wrong",
      "An unexpected error occurred while running this command."
    );
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    } catch {
      // Interaction may have expired; ignore
    }
  }
});

client.on(Events.ShardError, (err) => {
  logger.error("Shard", "A websocket connection encountered an error:", err);
});

client.on(Events.ShardReconnecting, () => {
  logger.warn("Shard", "Reconnecting to Discord gateway...");
});

client.on(Events.ShardResume, (_, replayedEvents) => {
  logger.info("Shard", `Resumed gateway connection. Replayed ${replayedEvents} events.`);
});

client.on(Events.ShardDisconnect, (event) => {
  logger.warn("Shard", `Disconnected from gateway. Code: ${event.code}`);
});

process.on("unhandledRejection", (err) => {
  logger.error("Process", "Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  logger.error("Process", "Uncaught exception:", err);
  process.exit(1);
});

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error("Bot", "DISCORD_TOKEN is not set in .env");
    process.exit(1);
  }

  logger.info("Database", "Testing database connection...");
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error("Database", "Could not connect to PostgreSQL. Check DATABASE_URL.");
    process.exit(1);
  }
  logger.info("Database", "Connection successful.");

  await initDatabase();
  await runMigrations();
  await runTicketMigrations();
  await runAutomodMigrations();
  await runWelcomeMigrations();

  registerAllEvents(client);
  loadCommands();

  logger.info("Bot", "Logging in to Discord...");
  await client.login(token);
}

main();
