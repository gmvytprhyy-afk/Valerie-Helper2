import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../../types/index";
import { removeCrystals, getCrystals } from "../../utils/crystals";
import { successEmbed, errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("remove-crystals")
    .setDescription("Remove crystals from a member's balance. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove crystals from.").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Amount of crystals to remove.")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1_000_000)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for removing crystals.").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const guildId = interaction.guildId!;

    if (target.bot) {
      await interaction.reply({ embeds: [errorEmbed("Invalid Target", "Bots cannot hold crystals.")] });
      return;
    }

    const currentBalance = await getCrystals(target.id, guildId);
    if (currentBalance < BigInt(amount)) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Insufficient Balance",
            `${target} only has **${currentBalance.toLocaleString()} 💎**. You tried to remove **${amount.toLocaleString()} 💎**.`
          ),
        ],
      });
      return;
    }

    const eco = await removeCrystals(target.id, guildId, BigInt(amount));

    const embed = successEmbed(
      "Crystals Removed",
      `Removed **${amount.toLocaleString()} 💎** from ${target}'s balance.`
    )
      .addFields(
        { name: "New Balance", value: `${(eco?.balance ?? 0n).toLocaleString()} 💎`, inline: true },
        { name: "Reason", value: reason, inline: true },
        { name: "Moderator", value: `${interaction.user}`, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
