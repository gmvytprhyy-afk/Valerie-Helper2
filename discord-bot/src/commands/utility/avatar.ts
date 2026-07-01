import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar in full size.")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to view (defaults to you).").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("type")
        .setDescription("Which avatar to show.")
        .setRequired(false)
        .addChoices(
          { name: "Global avatar", value: "global" },
          { name: "Server avatar (if set)", value: "server" },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const type = interaction.options.getString("type") ?? "global";

    const member = interaction.guild
      ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
      : null;

    const avatarUrl =
      type === "server" && member?.avatar
        ? member.displayAvatarURL({ size: 4096, forceStatic: false })
        : targetUser.displayAvatarURL({ size: 4096, forceStatic: false });

    const pngUrl = avatarUrl.replace(/\.(gif|webp)(\?.*)?$/, ".png$2");
    const isAnimated = avatarUrl.includes(".gif");

    const embed = new EmbedBuilder()
      .setColor(config.color.primary as ColorResolvable)
      .setTitle(`🖼️ ${targetUser.username}'s ${type === "server" ? "Server " : ""}Avatar`)
      .setImage(avatarUrl)
      .setDescription(
        `[PNG](${pngUrl})` +
          (isAnimated ? ` · [GIF](${avatarUrl})` : "") +
          (member?.avatar && type === "global"
            ? `\n*This user has a server-specific avatar. Use \`type: Server avatar\` to see it.*`
            : "")
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
