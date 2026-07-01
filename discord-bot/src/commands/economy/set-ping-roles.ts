import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { Command } from "../../types/index";
import { updateGuildSettings, getOrCreateGuildSettings } from "../../utility";
import { successEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("set-ping-roles")
    .setDescription("Set roles to ping when a purchase ticket is created. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role1").setDescription("First role to ping.").setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName("role2").setDescription("Second role to ping.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role3").setDescription("Third role to ping.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role4").setDescription("Fourth role to ping.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role5").setDescription("Fifth role to ping.").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const guildId = interaction.guildId!;

    const roles = [
      interaction.options.getRole("role1"),
      interaction.options.getRole("role2"),
      interaction.options.getRole("role3"),
      interaction.options.getRole("role4"),
      interaction.options.getRole("role5"),
    ]
      .filter(Boolean)
      .map((r) => r!.id);

    await getOrCreateGuildSettings(guildId);
    await updateGuildSettings(guildId, { ping_roles: roles } as never);

    const roleList = roles.map((id) => `<@&${id}>`).join(", ");

    const embed = successEmbed(
      "Ping Roles Updated",
      `The following roles will be pinged when a purchase ticket is created:\n\n${roleList}`
    )
      .addFields({ name: "Roles Set", value: String(roles.length), inline: true })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
