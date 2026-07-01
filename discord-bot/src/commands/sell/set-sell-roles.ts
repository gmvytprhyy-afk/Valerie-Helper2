import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { getOrCreateGuildSettings } from "../../utility";
import { query } from "../../database";
import { successEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("set-sell-roles")
    .setDescription("Set roles to ping when a sell ticket is created. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role1").setDescription("First role to ping.").setRequired(true)
    )
    .addRoleOption((opt) =>
      opt.setName("role2").setDescription("Second role.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role3").setDescription("Third role.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role4").setDescription("Fourth role.").setRequired(false)
    )
    .addRoleOption((opt) =>
      opt.setName("role5").setDescription("Fifth role.").setRequired(false)
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
    await query(
      `UPDATE guild_settings SET sell_roles = $2 WHERE guild_id = $1`,
      [guildId, roles]
    );

    const roleList = roles.map((id) => `<@&${id}>`).join(", ");

    const embed = successEmbed(
      "Sell Roles Updated",
      `These roles will be pinged when a sell ticket is opened:\n\n${roleList}`
    )
      .addFields({ name: "Roles Set", value: String(roles.length), inline: true })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
