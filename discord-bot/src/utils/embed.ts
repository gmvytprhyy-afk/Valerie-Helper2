import {
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import config from "../../config.json";

const { color } = config;

export function primaryEmbed(title?: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(color.primary as ColorResolvable);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color.success as ColorResolvable)
    .setTitle(`✅ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color.error as ColorResolvable)
    .setTitle(`❌ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color.warning as ColorResolvable)
    .setTitle(`⚠️ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color.info as ColorResolvable)
    .setTitle(`ℹ️ ${title}`);
  if (description) embed.setDescription(description);
  return embed;
}

export function withTimestamp(embed: EmbedBuilder): EmbedBuilder {
  return embed.setTimestamp();
}

export function withFooter(embed: EmbedBuilder, text: string, iconUrl?: string): EmbedBuilder {
  return embed.setFooter({ text, iconURL: iconUrl });
}
