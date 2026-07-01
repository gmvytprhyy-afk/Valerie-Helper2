import {
  REST,
  Routes,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { Command } from "./types/index";
import { logger } from "./utils/logger";

dotenv.config();

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf-8")
) as { clientId: string; guildId: string };

async function deployCommands(global = false): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    logger.error("Deploy", "DISCORD_TOKEN is not set in .env");
    process.exit(1);
  }

  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];
  const commandsPath = path.join(__dirname, "commands");

  if (!fs.existsSync(commandsPath)) {
    logger.info("Deploy", "No commands directory found. Nothing to deploy.");
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
        commands.push(command.data.toJSON());
        logger.info("Deploy", `Queued: ${command.data.name}`);
      }
    }
  }

  const rest = new REST({ version: "10" }).setToken(token);

  logger.info("Deploy", `Registering ${commands.length} command(s)...`);

  if (global) {
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: commands,
    });
    logger.info("Deploy", "Successfully registered commands globally.");
  } else {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    logger.info(
      "Deploy",
      `Successfully registered commands to guild ${config.guildId}.`
    );
  }
}

const isGlobal = process.argv.includes("--global");
deployCommands(isGlobal).catch((err) => {
  logger.error("Deploy", "Failed to deploy commands:", err);
  process.exit(1);
});
