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
  ButtonInteraction,
  ButtonStyle as BS,
} from "discord.js";
import { Command } from "../../types/index";
import { query, queryOne } from "../../database";
import { errorEmbed, successEmbed } from "../../utils/embed";
import config from "../../../config.json";

interface SellPanelRow {
  id: number;
  name: string;
  description: string | null;
  looking_for: string | null;
  channel_id: string | null;
  created_at: Date;
}

export default {
  data: new SlashCommandBuilder()
    .setName("edit-sell-panel")
    .setDescription("Edit an existing sell panel. (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, _client: Client): Promise<void> {
    const guildId = interaction.guildId!;

    const panels = await query<SellPanelRow>(
      `SELECT id, name, description, looking_for, channel_id, created_at
       FROM sell_panels WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 25`,
      [guildId]
    );

    if (panels.length === 0) {
      await interaction.reply({
        embeds: [errorEmbed("No Panels Found", "Use `/sell` to create a sell panel first.")],
      });
      return;
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("editsell_select")
      .setPlaceholder("Select a sell panel to edit...")
      .addOptions(
        panels.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.name.slice(0, 100))
            .setValue(String(p.id))
            .setDescription(`ID: ${p.id} · Created: ${new Date(p.created_at).toLocaleDateString()}`)
        )
      );

    const listEmbed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle("✏️ Edit Sell Panel")
      .setDescription("Select a panel to edit.");

    await interaction.reply({
      embeds: [listEmbed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
    });

    const msg = await interaction.fetchReply();

    const selectInt = await msg
      .awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.customId === "editsell_select" && i.user.id === interaction.user.id,
        time: 60_000,
      })
      .catch(() => null);

    if (!selectInt) {
      await msg.edit({ embeds: [errorEmbed("Timed Out", "Edit cancelled.")], components: [] });
      return;
    }

    const panelId = parseInt(selectInt.values[0], 10);
    const panel = panels.find((p) => p.id === panelId)!;

    const actionsEmbed = new EmbedBuilder()
      .setColor(config.color.info as ColorResolvable)
      .setTitle(`✏️ Editing: ${panel.name}`)
      .addFields(
        { name: "Description", value: panel.description ?? "_None_", inline: false },
        { name: "Looking For", value: panel.looking_for ?? "_None_", inline: false }
      );

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("editsell_update")
        .setLabel("Update Info")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId("editsell_set_roles")
        .setLabel("Set Sell Roles")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔔"),
      new ButtonBuilder()
        .setCustomId("editsell_delete")
        .setLabel("Delete Panel")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    );

    await selectInt.update({ embeds: [actionsEmbed], components: [actionRow] });

    const actionMsg = await interaction.fetchReply();
    const btnInt = await actionMsg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 60_000,
      })
      .catch(() => null) as ButtonInteraction | null;

    if (!btnInt) {
      await actionMsg.edit({ embeds: [errorEmbed("Timed Out", "Edit cancelled.")], components: [] });
      return;
    }

    if (btnInt.customId === "editsell_delete") {
      await query(`DELETE FROM sell_panels WHERE id = $1 AND guild_id = $2`, [panelId, guildId]);
      await btnInt.update({
        embeds: [successEmbed("Panel Deleted", `**${panel.name}** has been deleted.`)],
        components: [],
      });
      return;
    }

    if (btnInt.customId === "editsell_set_roles") {
      await btnInt.update({
        embeds: [
          new EmbedBuilder()
            .setColor(config.color.info as ColorResolvable)
            .setTitle("Set Sell Roles")
            .setDescription(
              "Use `/set-sell-roles` to configure which roles are pinged when a sell ticket is created."
            ),
        ],
        components: [],
      });
      return;
    }

    if (btnInt.customId === "editsell_update") {
      const infoModal = new ModalBuilder()
        .setCustomId("editsell_info_modal")
        .setTitle("Update Sell Panel");

      infoModal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("title")
            .setLabel("Title")
            .setStyle(TextInputStyle.Short)
            .setValue(panel.name)
            .setMaxLength(100)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Description")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(panel.description ?? "")
            .setMaxLength(500)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("looking_for")
            .setLabel("What are we looking for?")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(panel.looking_for ?? "")
            .setMaxLength(400)
            .setRequired(true)
        )
      );

      await btnInt.showModal(infoModal);

      const infoSubmit = await btnInt
        .awaitModalSubmit({
          filter: (i) => i.customId === "editsell_info_modal" && i.user.id === interaction.user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!infoSubmit) return;

      const newTitle = infoSubmit.fields.getTextInputValue("title");
      const newDesc = infoSubmit.fields.getTextInputValue("description") || null;
      const newLookingFor = infoSubmit.fields.getTextInputValue("looking_for");

      await query(
        `UPDATE sell_panels SET name = $2, description = $3, looking_for = $4 WHERE id = $1`,
        [panelId, newTitle, newDesc, newLookingFor]
      );

      await (infoSubmit as any).update({
        embeds: [successEmbed("Panel Updated", `**${newTitle}** has been updated.`)],
        components: [],
      });
    }
  },
} satisfies Command;
