import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { addCrystals } from "../../utils/crystals";
import { successEmbed, errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("add-crystals")
    .setDescription("Add crystals to a member's balance. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to add crystals to.").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Amount of crystals to add.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1_000_000)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for adding crystals.").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const guildId = interaction.guildId!;

    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed("Invalid Target", "You cannot give crystals to a bot.")] });
      return;
    }

    const eco = await addCrystals(target.id, guildId, BigInt(amount));

    const embed = successEmbed(
      "Crystals Added",
      `Added **${amount.toLocaleString()} 💎** to ${target}'s balance.`
    )
      .addFields(
        { name: "New Balance", value: `${eco.balance.toLocaleString()} 💎`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
