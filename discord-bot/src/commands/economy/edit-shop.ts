import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ColorResolvable,
  ComponentType,
} from "discord.js";
import { Command } from "../../types/index";
import { query, queryOne } from "../../database";
import { ShopPanel, ShopItem } from "../../types/index";
import { errorEmbed, successEmbed, primaryEmbed } from "../../utils/embed";
import config from "../../../config.json";

export default {
  data: new SlashCommandBuilder()
    .setName("edit-shop")
    .setDescription("Edit an existing shop panel. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const guildId = interaction.guildId!;
    const panels = await query<ShopPanel>(
      `SELECT * FROM shop_panels WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 25`,
      [guildId]
    );

    if (panels.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("No Panels Found", "Use `/shop` to create a shop panel first.")],
      });
      return;
    }

    const panelSelect = new StringSelectMenuBuilder()
      .setCustomId("editshop_select_panel")
      .setPlaceholder("Select a shop panel to edit...")
      .addOptions(
        panels.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.name.slice(0, 100))
            .setValue(String(p.id))
            .setDescription(`ID: ${p.id} · Created: ${p.created_at.toLocaleDateString()}`)
        )
      );

    const listEmbed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle("✏️ Edit Shop Panel")
      .setDescription("Select a panel below to edit it.");

    await interaction.reply({
      embeds: [listEmbed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(panelSelect)],
    });

    const msg = await interaction.fetchReply();

    const panelSelectInt = await msg
      .awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.customId === "editshop_select_panel" && i.user.id === interaction.user.id,
        time: 60_000,
      })
      .catch(() => null);

    if (!panelSelectInt) {
      await msg.edit({ embeds: [errorEmbed("Timed Out", "Edit cancelled.")], components: [] });
      return;
    }

    const selectedPanelId = parseInt(panelSelectInt.values[0], 10);
    const panel = panels.find((p) => p.id === selectedPanelId)!;
    const items = await query<ShopItem>(
      `SELECT * FROM shop_items WHERE panel_id = $1 ORDER BY id ASC`,
      [selectedPanelId]
    );

    const actionsEmbed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle(`✏️ Editing: ${panel.name}`)
      .setDescription(panel.description ?? "_No description_")
      .addFields({
        name: `Items (${items.length}/10)`,
        value:
          items.length > 0
            ? items
                .map(
                  (it) =>
                    `**${it.name}** — ${it.price.toLocaleString()} 💎 · Stock: ${it.quantity !== null ? it.quantity : "Unlimited"}`
                )
                .join("\n")
            : "_None_",
      });

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("editshop_add_item")
        .setLabel("Add Item")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("➕")
        .setDisabled(items.length >= 10),
      new ButtonBuilder()
        .setCustomId("editshop_update_info")
        .setLabel("Update Title/Desc")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId("editshop_delete_panel")
        .setLabel("Delete Panel")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    );

    await panelSelectInt.update({
      embeds: [actionsEmbed],
      components: [actionRow],
    });

    const actionMsg = await interaction.fetchReply();

    const btnInt = await actionMsg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      })
      .catch(() => null);

    if (!btnInt) {
      await actionMsg.edit({ embeds: [errorEmbed("Timed Out", "Edit cancelled.")], components: [] });
      return;
    }

    if (btnInt.customId === "editshop_delete_panel") {
      await query(`DELETE FROM shop_panels WHERE id = $1 AND guild_id = $2`, [selectedPanelId, guildId]);
      await btnInt.update({
        embeds: [successEmbed("Panel Deleted", `**${panel.name}** has been deleted.`)],
        components: [],
      });
      return;
    }

    if (btnInt.customId === "editshop_update_info") {
      const infoModal = new ModalBuilder()
        .setCustomId("editshop_info_modal")
        .setTitle("Update Panel Info");

      infoModal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("new_title")
            .setLabel("New Title")
            .setStyle(TextInputStyle.Short)
            .setValue(panel.name)
            .setMaxLength(100)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("new_description")
            .setLabel("New Description")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(panel.description ?? "")
            .setMaxLength(400)
            .setRequired(false)
        )
      );

      await btnInt.showModal(infoModal);

      const infoSubmit = await btnInt
        .awaitModalSubmit({
          filter: (i) => i.customId === "editshop_info_modal" && i.user.id === interaction.user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!infoSubmit) return;

      const newTitle = infoSubmit.fields.getTextInputValue("new_title");
      const newDesc = infoSubmit.fields.getTextInputValue("new_description");

      await query(
        `UPDATE shop_panels SET name = $2, description = $3 WHERE id = $1`,
        [selectedPanelId, newTitle, newDesc]
      );

      await (infoSubmit as any).update({
        embeds: [successEmbed("Panel Updated", `**${newTitle}** info has been updated.`)],
        components: [],
      });
      return;
    }

    if (btnInt.customId === "editshop_add_item") {
      const itemModal = new ModalBuilder()
        .setCustomId("editshop_item_modal")
        .setTitle("Add New Item");

      itemModal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("item_name")
            .setLabel("Item Name")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("item_price")
            .setLabel("Price (Crystals)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. 50")
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("item_stock")
            .setLabel("Stock (0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. 10 or 0 for unlimited")
            .setRequired(true)
        )
      );

      await btnInt.showModal(itemModal);

      const itemSubmit = await btnInt
        .awaitModalSubmit({
          filter: (i) => i.customId === "editshop_item_modal" && i.user.id === interaction.user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!itemSubmit) return;

      const rawPrice = itemSubmit.fields.getTextInputValue("item_price").replace(/[^0-9]/g, "");
      const rawStock = itemSubmit.fields.getTextInputValue("item_stock").replace(/[^0-9]/g, "");
      const price = parseInt(rawPrice, 10);
      const stockRaw = parseInt(rawStock, 10);

      if (isNaN(price) || price < 0) {
        await itemSubmit.reply({ embeds: [errorEmbed("Invalid Price", "Price must be a positive number.")] });
        return;
      }

      await query(
        `INSERT INTO shop_items (panel_id, guild_id, name, price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [selectedPanelId, guildId, itemSubmit.fields.getTextInputValue("item_name"), price, stockRaw === 0 ? null : stockRaw]
      );

      const updatedItems = await query<ShopItem>(
        `SELECT * FROM shop_items WHERE panel_id = $1 ORDER BY id ASC`,
        [selectedPanelId]
      );

      const updatedEmbed = primaryEmbed(
        `✏️ Item Added — ${panel.name}`,
        `The panel now has **${updatedItems.length}** item(s).`
      ).addFields({
        name: "Items",
        value: updatedItems
          .map(
            (it) =>
              `**${it.name}** — ${it.price.toLocaleString()} 💎 · Stock: ${it.quantity !== null ? it.quantity : "Unlimited"}`
          )
          .join("\n"),
      });

      await (itemSubmit as any).update({ embeds: [updatedEmbed], components: [] });
    }
  },
} satisfies Command;
