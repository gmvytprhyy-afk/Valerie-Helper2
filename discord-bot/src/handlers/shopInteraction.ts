import {
  Client,
  Events,
  StringSelectMenuInteraction,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ColorResolvable,
} from "discord.js";
import { queryOne, query } from "../database";
import { ShopItem } from "../types/index";
import { removeCrystals } from "../utils/crystals";
import { createTicket } from "../tickets";
import { getOrCreateGuildSettings } from "../utility";
import { successEmbed, errorEmbed } from "../utils/embed";
import { logger } from "../utils/logger";
import config from "../../config.json";

export function registerShopInteraction(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith("shop:select:")) return;
    if (!interaction.guild) return;

    const panelId = parseInt(interaction.customId.split(":")[2], 10);
    const itemId = parseInt(interaction.values[0], 10);
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      const item = await queryOne<ShopItem>(
        `SELECT * FROM shop_items WHERE id = $1 AND panel_id = $2 AND guild_id = $3`,
        [itemId, panelId, guildId]
      );

      if (!item) {
        await interaction.reply({
          embeds: [errorEmbed("Item Not Found", "That item no longer exists.")],
        });
        return;
      }

      if (item.quantity !== null && item.quantity <= 0) {
        await interaction.reply({
          embeds: [errorEmbed("Out of Stock", `**${item.name}** is currently out of stock.`)],
        });
        return;
      }

      const deducted = await removeCrystals(userId, guildId, item.price);
      if (!deducted) {
        await interaction.reply({
          embeds: [
            errorEmbed(
              "Insufficient Crystals",
              `You need **${item.price.toLocaleString()} 💎** to purchase **${item.name}**.`
            ),
          ],
        });
        return;
      }

      if (item.quantity !== null) {
        await query(
          `UPDATE shop_items SET quantity = quantity - 1 WHERE id = $1`,
          [item.id]
        );
      }

      const settings = await getOrCreateGuildSettings(guildId);
      const guild = interaction.guild;

      let ticketChannel = null;
      try {
        const category = settings.ticket_category
          ? guild.channels.cache.get(settings.ticket_category)
          : null;

        const overwrites = [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          ...(settings.ping_roles ?? []).map((roleId: string) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          })),
        ];

        ticketChannel = await guild.channels.create({
          name: `purchase-${interaction.user.username}`.slice(0, 100),
          type: ChannelType.GuildText,
          parent: category && category.type === ChannelType.GuildCategory
            ? category.id
            : undefined,
          permissionOverwrites: overwrites,
        });

        const ticketRecord = await createTicket(
          guildId,
          ticketChannel.id,
          userId,
          `Purchase: ${item.name}`
        );

        // Mark ticket as purchase type
        await query(
          `UPDATE tickets SET ticket_type = 'purchase' WHERE id = $1`,
          [ticketRecord.id]
        );

        const purchaseEmbed = new EmbedBuilder()
          .setColor(config.color.primary as ColorResolvable)
          .setTitle("🛒 New Purchase")
          .addFields(
            { name: "Item", value: item.name, inline: true },
            { name: "Price Paid", value: `${item.price.toLocaleString()} 💎`, inline: true },
            { name: "Buyer", value: `<@${userId}>`, inline: true },
            { name: "Ticket ID", value: `#${ticketRecord.id}`, inline: true }
          )
          .setTimestamp();

        if (item.description) {
          purchaseEmbed.setDescription(item.description);
        }

        const rolePings =
          settings.ping_roles && settings.ping_roles.length > 0
            ? settings.ping_roles.map((r: string) => `<@&${r}>`).join(" ")
            : "";

        await ticketChannel.send({
          content: `${rolePings ? rolePings + " " : ""}<@${userId}>`,
          embeds: [purchaseEmbed],
        });
      } catch (channelErr) {
        logger.error("ShopInteraction", "Failed to create ticket channel:", channelErr);
      }

      const confirmEmbed = successEmbed(
        "Purchase Complete!",
        `You purchased **${item.name}** for **${item.price.toLocaleString()} 💎**.`
      );
      if (ticketChannel) {
        confirmEmbed.addFields({
          name: "Your Ticket",
          value: `<#${ticketChannel.id}>`,
        });
      }

      await interaction.reply({ embeds: [confirmEmbed] });

      if (item.quantity !== null) {
        const refreshedItem = await queryOne<{ quantity: number | null }>(
          `SELECT quantity FROM shop_items WHERE id = $1`,
          [item.id]
        );
        if (refreshedItem?.quantity === 0) {
          const allItems = await query<ShopItem>(
            `SELECT * FROM shop_items WHERE panel_id = $1 AND guild_id = $2 ORDER BY id ASC`,
            [panelId, guildId]
          );
          const hasStock = allItems.some(
            (i) => i.quantity === null || i.quantity > 0
          );
          if (!hasStock) {
            await interaction.message.edit({
              embeds: interaction.message.embeds,
              components: [],
            });
          }
        }
      }
    } catch (err) {
      logger.error("ShopInteraction", "Error processing purchase:", err);
      try {
        const embed = errorEmbed(
          "Purchase Failed",
          "Something went wrong. Please try again or contact a moderator."
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed] });
        } else {
          await interaction.reply({ embeds: [embed] });
        }
      } catch {
        // expired
      }
    }
  });
}
