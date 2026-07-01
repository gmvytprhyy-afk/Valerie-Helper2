import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
  ChannelType,
} from "discord.js";
import { Command } from "../../types/index";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display detailed information about this server."),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const guild = interaction.guild!;

    // Fetch full guild data (owner, counts)
    const fullGuild = await guild.fetch();

    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
    ).size;
    const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount = totalMembers - botCount;

    const boostTier = `Level ${guild.premiumTier}`;
    const boostCount = guild.premiumSubscriptionCount ?? 0;

    const verificationLevels: Record<number, string> = {
      0: "None",
      1: "Low",
      2: "Medium",
      3: "High",
      4: "Very High",
    };

    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "👑 Owner", value: `<@${fullGuild.ownerId}>`, inline: true },
        { name: "🆔 Server ID", value: `\`${guild.id}\``, inline: true },
        { name: "📅 Created", value: `<t:${createdAt}:D> (<t:${createdAt}:R>)`, inline: false },
        { name: "👥 Members", value: `**${totalMembers}** total\n${humanCount} humans · ${botCount} bots`, inline: true },
        {
          name: "📣 Channels",
          value: `💬 ${textChannels} text · 🔊 ${voiceChannels} voice · 📁 ${categories} categories`,
          inline: true,
        },
        { name: "🎭 Roles", value: `${guild.roles.cache.size}`, inline: true },
        { name: "💎 Boosts", value: `${boostCount} boosts (${boostTier})`, inline: true },
        { name: "🔒 Verification", value: verificationLevels[guild.verificationLevel] ?? "Unknown", inline: true },
      )
      .setTimestamp();

    if (guild.description) {
      embed.setDescription(guild.description);
    }

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 })!);
    }

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
