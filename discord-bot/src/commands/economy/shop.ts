import {
  ChatInputCommandInteraction,
  Client,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ColorResolvable,
  ComponentType,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { Command } from "../../types/index";
import { query, queryOne } from "../../database";
import { errorEmbed, successEmbed } from "../../utils/embed";
import config from "../../../config.json";

interface DraftItem {
  name: string;
  price: number;
  stock: number | null;
}

function buildSetupEmbed(
  title: string,
  description: string,
  items: DraftItem[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(config.color.info as ColorResolvable)
    .setTitle(`🛒 Shop Setup — ${title}`)
    .setDescription(description || "_No description_")
    .setFooter({ text: `${items.length}/10 items · Click "Add Item" or "Publish" when ready` });

  if (items.length > 0) {
    embed.addFields({
      name: "Items",
      value: items
        .map(
          (item, i) =>
            `**${i + 1}.** ${item.name} — **${item.price.toLocaleString()} 💎**` +
            (item.stock !== null ? ` (Stock: ${item.stock})` : " (Unlimited)")
        )
        .join("\n"),
    });
  } else {
    embed.addFields({ name: "Items", value: "_No items added yet._" });
  }
  return embed;
}

function buildSetupButtons(itemCount: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_add_item")
      .setLabel("Add Item")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("➕")
      .setDisabled(itemCount >= 10),
    new ButtonBuilder()
      .setCustomId("shop_publish")
      .setLabel("Publish Panel")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(itemCount === 0),
    new ButtonBuilder()
      .setCustomId("shop_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️")
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Create a new shop panel with purchasable items. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const panelModal = new ModalBuilder()
      .setCustomId("shop_panel_modal")
      .setTitle("Create Shop Panel");

    const titleInput = new TextInputBuilder()
      .setCustomId("panel_title")
      .setLabel("Panel Title")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId("panel_description")
      .setLabel("Panel Description")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(400)
      .setRequired(false);

    panelModal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
    );

    await interaction.showModal(panelModal);

    let panelSubmit: ModalSubmitInteraction;
    try {
      panelSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === "shop_panel_modal" && i.user.id === interaction.user.id,
        time: 120_000,
      });
    } catch {
      return;
    }

    const panelTitle = panelSubmit.fields.getTextInputValue("panel_title");
    const panelDesc = panelSubmit.fields.getTextInputValue("panel_description") || "";
    const items: DraftItem[] = [];

    await panelSubmit.reply({
      embeds: [buildSetupEmbed(panelTitle, panelDesc, items)],
      components: [buildSetupButtons(items.length)],
    });

    const setupMsg = await panelSubmit.fetchReply();

    const collector = setupMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 600_000,
    });

    collector.on("collect", async (btn: ButtonInteraction) => {
      if (btn.customId === "shop_cancel") {
        collector.stop("cancelled");
        await btn.update({
          embeds: [errorEmbed("Cancelled", "Shop panel creation was cancelled.")],
          components: [],
        });
        return;
      }

      if (btn.customId === "shop_add_item") {
        const itemModal = new ModalBuilder()
          .setCustomId(`shop_item_modal_${Date.now()}`)
          .setTitle(`Add Item ${items.length + 1}`);

        const nameInput = new TextInputBuilder()
          .setCustomId("item_name")
          .setLabel("Item Name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId("item_price")
          .setLabel("Price (Crystals)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 50")
          .setRequired(true);

        const stockInput = new TextInputBuilder()
          .setCustomId("item_stock")
          .setLabel("Stock (0 = unlimited)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 10 or 0 for unlimited")
          .setRequired(true);

        itemModal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(stockInput)
        );

        await btn.showModal(itemModal);

        let itemSubmit: ModalSubmitInteraction;
        try {
          itemSubmit = await btn.awaitModalSubmit({
            filter: (i) =>
              i.customId.startsWith("shop_item_modal_") && i.user.id === interaction.user.id,
            time: 60_000,
          });
        } catch {
          return;
        }

        const rawPrice = itemSubmit.fields.getTextInputValue("item_price").replace(/[^0-9]/g, "");
        const rawStock = itemSubmit.fields.getTextInputValue("item_stock").replace(/[^0-9]/g, "");
        const price = parseInt(rawPrice, 10);
        const stockRaw = parseInt(rawStock, 10);

        if (isNaN(price) || price < 0) {
          await itemSubmit.reply({ embeds: [errorEmbed("Invalid Price", "Price must be a positive number.")] });
          setTimeout(() => itemSubmit.deleteReply().catch(() => null), 5000);
          return;
        }

        items.push({
          name: itemSubmit.fields.getTextInputValue("item_name"),
          price,
          stock: stockRaw === 0 ? null : stockRaw,
        });

        // ModalSubmitInteraction.update() is typed conditionally in djs;
        // cast to any when modal originates from a button interaction.
        await (itemSubmit as any).update({
          embeds: [buildSetupEmbed(panelTitle, panelDesc, items)],
          components: [buildSetupButtons(items.length)],
        });
        return;
      }

      if (btn.customId === "shop_publish") {
        collector.stop("published");

        const panelRow = await queryOne<{ id: number }>(
          `INSERT INTO shop_panels (guild_id, name, description)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [interaction.guildId!, panelTitle, panelDesc]
        );

        if (!panelRow) {
          await btn.update({
            embeds: [errorEmbed("Database Error", "Failed to save the shop panel.")],
            components: [],
          });
          return;
        }

        const panelId = panelRow.id;

        for (const item of items) {
          await query(
            `INSERT INTO shop_items (panel_id, guild_id, name, price, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [panelId, interaction.guildId!, item.name, item.price, item.stock]
          );
        }

        const savedItems = await query<{ id: number; name: string; price: bigint; quantity: number | null; description: string | null }>(
          `SELECT id, name, price, quantity, description FROM shop_items
           WHERE panel_id = $1 ORDER BY id ASC`,
          [panelId]
        );

        const shopEmbed = new EmbedBuilder()
          .setColor(config.color.primary as ColorResolvable)
          .setTitle(`🛒 ${panelTitle}`)
          .setDescription(
            panelDesc
              ? `${panelDesc}\n\n**Select an item below to purchase.**`
              : "**Select an item below to purchase.**"
          )
          .addFields(
            savedItems.map((item) => ({
              name: item.name,
              value:
                `**Price:** ${item.price.toLocaleString()} 💎\n` +
                `**Stock:** ${item.quantity !== null ? item.quantity : "Unlimited"}`,
              inline: true,
            }))
          )
          .setFooter({ text: "💎 Powered by Valerie Helper" })
          .setTimestamp();

        const options = savedItems.map((item) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(item.name.slice(0, 100))
            .setValue(String(item.id))
            .setDescription(
              `${item.price.toLocaleString()} 💎 · Stock: ${item.quantity !== null ? item.quantity : "Unlimited"}`
            )
        );

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`shop:select:${panelId}`)
          .setPlaceholder("Select an item to purchase...")
          .addOptions(options);

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await btn.update({
          embeds: [successEmbed("Shop Published!", `**${panelTitle}** is now live below.`)],
          components: [],
        });

        await (btn.channel as import("discord.js").TextChannel)!.send({
          embeds: [shopEmbed],
          components: [selectRow],
        });

        await query(
          `UPDATE shop_panels SET channel_id = $2 WHERE id = $1`,
          [panelId, btn.channel!.id]
        );
      }
    });

    collector.on("end", (_collected, reason) => {
      if (reason !== "published" && reason !== "cancelled" && reason !== "time") return;
      if (reason === "time") {
        setupMsg.edit({
          embeds: [errorEmbed("Timed Out", "Shop panel creation timed out.")],
          components: [],
        }).catch(() => null);
      }
    });
  },
} satisfies Command;
