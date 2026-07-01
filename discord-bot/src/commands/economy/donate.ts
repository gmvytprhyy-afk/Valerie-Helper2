import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
} from "discord.js";
import { Command } from "../../types/index";
import { removeCrystals, addCrystals, getCrystals } from "../../utils/crystals";
import { successEmbed, errorEmbed } from "../../utils/embed";

export default {
  data: new SlashCommandBuilder()
    .setName("donate")
    .setDescription("Donate crystals to another member.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to donate to.").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Amount of crystals to donate.")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const target = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const guildId = interaction.guildId!;
    const senderId = interaction.user.id;

    if (target.id === senderId) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "You cannot donate crystals to yourself.")],
      });
      return;
    }

    if (target.bot) {
      await interaction.reply({
        embeds: [errorEmbed("Invalid Target", "You cannot donate crystals to a bot.")],
      });
      return;
    }

    const balance = await getCrystals(senderId, guildId);
    if (balance < BigInt(amount)) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Insufficient Crystals",
            `You only have **${balance.toLocaleString()} 💎**. You tried to donate **${amount.toLocaleString()} 💎**.`
          ),
        ],
      });
      return;
    }

    const deducted = await removeCrystals(senderId, guildId, BigInt(amount));
    if (!deducted) {
      await interaction.reply({
        embeds: [errorEmbed("Transaction Failed", "Failed to process the donation. Try again.")],
      });
      return;
    }

    const recipientEco = await addCrystals(target.id, guildId, BigInt(amount));

    const embed = successEmbed(
      "Donation Sent!",
      `${interaction.user} donated **${amount.toLocaleString()} 💎** to ${target}.`
    )
      .addFields(
        {
          name: "Your New Balance",
          value: `${(deducted.balance).toLocaleString()} 💎`,
          inline: true,
        },
        {
          name: `${target.username}'s Balance`,
          value: `${(recipientEco.balance).toLocaleString()} 💎`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
} satisfies Command;
