import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { Command } from "../../types/index";
import config from "../../../config.json";

interface Category {
  emoji: string;
  label: string;
  commands: string[];
}

const CATEGORIES: Category[] = [
  {
    emoji: "💎",
    label: "Economy",
    commands: [
      "/balance — View your crystal balance and rank",
      "/donate — Send crystals to another member",
      "/leaderboard — Top crystal holders in the server",
      "/shop — Create a new shop panel",
      "/edit-shop — Edit or delete a shop panel",
      "/add-crystals — Add crystals to a member (staff)",
      "/remove-crystals — Remove crystals from a member (staff)",
      "/set-ping-roles — Set roles pinged on ticket/shop events",
    ],
  },
  {
    emoji: "🎫",
    label: "Tickets",
    commands: [
      "/claim — Claim an open ticket",
      "/close — Close and archive a ticket",
      "/rename-ticket — Rename the ticket channel",
      "/transfer-ticket — Transfer ticket ownership to staff",
      "/add-user — Add a user to a ticket",
      "/remove-user — Remove a user from a ticket",
      "/transcript — Generate a ticket transcript",
      "/support-panel — Post a support ticket panel",
    ],
  },
  {
    emoji: "💰",
    label: "Sell",
    commands: [
      "/sell — Post a sell listing and create a sell panel",
      "/edit-sell-panel — Edit or remove a sell panel",
      "/set-sell-roles — Set roles pinged on sell tickets",
    ],
  },
  {
    emoji: "🛡️",
    label: "Moderation",
    commands: [
      "/ban — Ban a member",
      "/unban — Unban a user by ID",
      "/kick — Kick a member",
      "/mute — Timeout a member",
      "/unmute — Remove a member's timeout",
      "/warn — Issue a warning",
      "/unwarn — Remove a warning",
      "/note — Add a staff note to a member",
      "/un-note — Remove a staff note",
      "/history — View moderation history and notes",
    ],
  },
  {
    emoji: "🤖",
    label: "AutoMod",
    commands: [
      "/enable-automod — Enable AutoMod features",
      "/disable-automod — Disable AutoMod features",
      "/set-blocked-words — Manage the blocked words list",
    ],
  },
  {
    emoji: "🔧",
    label: "Utility",
    commands: [
      "/help — Show this help menu",
      "/ping — Check bot and database latency",
      "/serverinfo — Display server information",
      "/avatar — View a user's avatar",
      "/memberinfo — View detailed member info",
      "/set-welcome — Configure welcome and leave messages",
    ],
  },
];

function buildOverviewEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(config.color.primary as ColorResolvable)
    .setTitle("📖 Valerie Helper — Commands")
    .setDescription(
      "Select a category below to see its commands.\n\n" +
        CATEGORIES.map((c) => `${c.emoji} **${c.label}** — ${c.commands.length} commands`).join("\n")
    )
    .setFooter({ text: `${CATEGORIES.reduce((n, c) => n + c.commands.length, 0)} total commands` })
    .setTimestamp();
}

function buildCategoryEmbed(cat: Category): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(config.color.primary as ColorResolvable)
    .setTitle(`${cat.emoji} ${cat.label} Commands`)
    .setDescription(cat.commands.map((c) => `\`${c.split(" — ")[0]}\` — ${c.split(" — ")[1]}`).join("\n"))
    .setFooter({ text: "Use /help to return to the overview" })
    .setTimestamp();
}

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all available commands, grouped by category."),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("help:category")
      .setPlaceholder("Browse a category…")
      .addOptions(
        CATEGORIES.map((c) => ({
          label: c.label,
          value: c.label,
          emoji: c.emoji,
          description: `${c.commands.length} commands`,
        }))
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const reply = await interaction.reply({
      embeds: [buildOverviewEmbed()],
      components: [row],
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id && i.customId === "help:category",
      time: 120_000,
    });

    collector.on("collect", async (select: StringSelectMenuInteraction) => {
      const cat = CATEGORIES.find((c) => c.label === select.values[0]);
      if (!cat) return;
      await select.update({ embeds: [buildCategoryEmbed(cat)], components: [row] });
    });

    collector.on("end", async () => {
      await interaction.editReply({ components: [] }).catch(() => null);
    });
  },
} satisfies Command;
