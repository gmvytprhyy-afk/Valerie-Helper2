import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { pool } from "../../database";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency and database response time."),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const sent = await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.color.info as ColorResolvable)
          .setDescription("📡 Measuring latency…"),
      ],
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = client.ws.ping;

    let dbLatency = -1;
    try {
      const dbStart = Date.now();
      await pool.query("SELECT 1");
      dbLatency = Date.now() - dbStart;
    } catch {
      dbLatency = -1;
    }

    function latencyBar(ms: number): string {
      if (ms < 0) return "🔴 Error";
      if (ms < 80) return "🟢 Excellent";
      if (ms < 200) return "🟡 Good";
      if (ms < 400) return "🟠 Fair";
      return "🔴 Poor";
    }

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle("🏓 Pong!")
      .addFields(
        { name: "⚡ Roundtrip", value: `\`${roundtrip}ms\` ${latencyBar(roundtrip)}`, inline: true },
        { name: "💓 Heartbeat", value: `\`${wsLatency}ms\` ${latencyBar(wsLatency)}`, inline: true },
        {
          name: "🗄️ Database",
          value: dbLatency >= 0 ? `\`${dbLatency}ms\` ${latencyBar(dbLatency)}` : "🔴 Unreachable",
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
} satisfies Command;
