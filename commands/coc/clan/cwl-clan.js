const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, "../../../data/cwlclans.json");

// In-memory store: userId -> array of selected clan tags
const pendingSelections = new Map();
const pendingSearch = new Map();

function loadData() {
    try {
        if (!fs.existsSync(dataPath)) {
            const dataDir = path.dirname(dataPath);
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            return {};
        }
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4), 'utf8');
    } catch (e) {
        console.error("Error writing cwlclans.json:", e);
    }
}

function buildEditMessage(data, userId) {
    const selectedTags = userId ? (pendingSelections.get(userId) || []) : [];
    const searchQuery = userId ? (pendingSearch.get(userId) || "") : "";
    const entries = Object.entries(data);

    const embed = new EmbedBuilder()
        .setTitle("📋 CWL Clans — Edit Panel")
        .setColor(0x5865F2);

    if (entries.length === 0) {
        embed.setDescription("No CWL clans are stored yet. Use `/cwl-clan` with action `Add` to add one.");
        return { embed, components: [] };
    }

    let filteredEntries = entries;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredEntries = entries.filter(([tag, v]) => tag.toLowerCase().includes(q) || v.name.toLowerCase().includes(q));
    }

    const selectedEntries = entries.filter(([tag]) => selectedTags.includes(tag));
    const finalEntriesMap = new Map();
    selectedEntries.forEach(([tag, v]) => finalEntriesMap.set(tag, v));
    filteredEntries.forEach(([tag, v]) => finalEntriesMap.set(tag, v));
    
    let finalEntries = Array.from(finalEntriesMap.entries());
    if (finalEntries.length > 25) {
        finalEntries = finalEntries.slice(0, 25);
    }

    const serious = entries.filter(([, v]) => v.style === 'serious');
    const lazy = entries.filter(([, v]) => v.style !== 'serious');

    let desc = "";
    if (searchQuery) {
        desc += `🔍 **Search Filter:** \`${searchQuery}\`\n\n`;
    }

    if (selectedTags.length > 0) {
        desc += `**✅ Selected Clans (${selectedTags.length}):**\n`;
        selectedTags.forEach(tag => {
            const c = data[tag];
            if (c) desc += `• **${c.name}** \`${tag}\`\n`;
        });
        desc += "\n";
    }

    if (serious.length > 0) {
        desc += "**🏆 Serious CWL Clans**\n";
        serious.forEach(([tag, v]) => { desc += `• **${v.name}** \`${tag}\`\n`; });
    }
    if (lazy.length > 0) {
        desc += "\n**😴 Lazy CWL Clans**\n";
        lazy.forEach(([tag, v]) => { desc += `• **${v.name}** \`${tag}\`\n`; });
    }
    
    if (finalEntries.length === 0) {
        desc += "\n*No clans match your search.*";
    } else {
        desc += "\n*Select clans below, then click **Delete** or **Update**.*";
    }
    
    if (desc.length > 4096) desc = desc.slice(0, 4093) + "...";
    embed.setDescription(desc);

    const options = finalEntries.map(([tag, v]) => ({
        label: v.name.slice(0, 100),
        description: `${tag} — ${v.style === 'serious' ? '🏆 Serious' : '😴 Lazy'}`,
        value: tag,
        default: selectedTags.includes(tag)
    }));

    const selectRow = new ActionRowBuilder();
    if (options.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("cwl_clan_edit_sel")
            .setPlaceholder("Select one or more clans…")
            .setMinValues(0)
            .setMaxValues(options.length)
            .addOptions(options);
        selectRow.addComponents(selectMenu);
    }

    const btnSearch = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_search_btn")
        .setLabel("🔍 Search Clan")
        .setStyle(ButtonStyle.Secondary);

    const btnDelete = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_delete")
        .setLabel("🗑️ Delete Selected")
        .setStyle(ButtonStyle.Danger);

    const btnUpdate = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_update")
        .setLabel("✏️ Update Selected")
        .setStyle(ButtonStyle.Primary);

    const btnRow = new ActionRowBuilder().addComponents(btnSearch, btnDelete, btnUpdate);

    return { embed, components: options.length > 0 ? [selectRow, btnRow] : [btnRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cwl-clan')
        .setDescription('Manage CWL clans')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Select an action')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Edit / Remove', value: 'edit' },
                )),

    async execute(interaction, context) {
        try {
            const action = interaction.options.getString('action');

            if (action === 'add') {
                const modal = new ModalBuilder()
                    .setCustomId('cwl_clan_modal_add')
                    .setTitle('Add CWL Clan');

                const tagInput = new TextInputBuilder()
                    .setCustomId('clan_tag')
                    .setLabel('Clan Tag')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g., #2RYYL0Y0R')
                    .setRequired(true);

                const typeInput = new TextInputBuilder()
                    .setCustomId('clan_type')
                    .setLabel('Clan Type (Lazy / Serious)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Type Lazy or Serious')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(tagInput),
                    new ActionRowBuilder().addComponents(typeInput)
                );

                await interaction.showModal(modal);

            } else if (action === 'edit') {
                await interaction.deferReply({ ephemeral: true });
                const data = loadData();
                pendingSelections.delete(interaction.user.id);
                pendingSearch.delete(interaction.user.id);
                const { embed, components } = buildEditMessage(data, interaction.user.id);

                if (components.length === 0) {
                    return interaction.editReply({ embeds: [embed] });
                }

                await interaction.editReply({ embeds: [embed], components });
            }
        } catch (error) {
            console.error("Error in /cwl-clan execute:", error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Failed to open the panel.", ephemeral: true }).catch(() => {});
            } else {
                await interaction.editReply({ content: "❌ Failed to open the panel." }).catch(() => {});
            }
        }
    },

    // Called by handler.js when customId === "cwl_clan_edit_sel"
    async handleSelectMenu(interaction, context) {
        try {
            const selected = interaction.values || []; 
            pendingSelections.set(interaction.user.id, selected);

            const data = loadData();
            const { embed, components } = buildEditMessage(data, interaction.user.id);

            await interaction.update({
                embeds: [embed],
                components,
                content: ""
            });
        } catch (error) {
            console.error("Error in cwl_clan_edit_sel select menu:", error);
            await interaction.reply({ content: "❌ Error processing selection.", ephemeral: true }).catch(() => {});
        }
    },

    // Called by handler.js when customId starts with "cwl_clan_edit_"
    async handleButton(interaction, context) {
        try {
            const id = interaction.customId;
            const userId = interaction.user.id;
            if (id === "cwl_clan_edit_search_btn") {
                const modal = new ModalBuilder()
                    .setCustomId('cwl_clan_modal_search')
                    .setTitle('Search CWL Clans');

                const searchInput = new TextInputBuilder()
                    .setCustomId('search_query')
                    .setLabel('Clan Name or Tag')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter text to filter clans...')
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
                return interaction.showModal(modal);
            }

            const selected = pendingSelections.get(userId);

            if (!selected || selected.length === 0) {
                return interaction.reply({
                    content: "⚠️ Please select at least one clan from the dropdown first.",
                    ephemeral: true
                });
            }

            const data = loadData();

            // ── DELETE ────────────────────────────────────────────────────────
            if (id === "cwl_clan_edit_delete") {
                await interaction.deferUpdate();

                const removed = [];
                const notFound = [];
                for (const tag of selected) {
                    if (data[tag]) {
                        removed.push(`**${data[tag].name}** \`${tag}\``);
                        delete data[tag];
                    } else {
                        notFound.push(`\`${tag}\``);
                    }
                }
                saveData(data);
                pendingSelections.delete(userId);
                pendingSearch.delete(userId);

                const embed = new EmbedBuilder()
                    .setTitle("✅ Clans Deleted")
                    .setColor(0xE74C3C)
                    .setDescription(
                        (removed.length > 0 ? `Removed:\n${removed.join("\n")}` : "") +
                        (notFound.length > 0 ? `\n\nNot found:\n${notFound.join(", ")}` : "")
                    );

                await interaction.editReply({ content: null, embeds: [embed], components: [] });

            // ── UPDATE ────────────────────────────────────────────────────────
            } else if (id === "cwl_clan_edit_update") {
                if (selected.length > 1) {
                    return interaction.reply({
                        content: "⚠️ Please select **only one clan** to update. Deselect extras from the dropdown first.",
                        ephemeral: true
                    });
                }

                const tag = selected[0];
                const clanName = data[tag]?.name || tag;

                const modal = new ModalBuilder()
                    .setCustomId(`cwl_clan_modal_update:${tag}`)
                    .setTitle(`Update: ${clanName.slice(0, 40)}`);

                const typeInput = new TextInputBuilder()
                    .setCustomId('clan_type')
                    .setLabel('New Clan Type (Lazy / Serious)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Type Lazy or Serious')
                    .setValue(data[tag]?.style || '')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(typeInput));

                await interaction.showModal(modal);
            }
        } catch (error) {
            console.error("Error in cwl-clan button handler:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ An error occurred.", embeds: [], components: [] }).catch(() => {});
            } else {
                await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            }
        }
    },

    async handleModalSubmit(interaction, context) {
        try {
            const id = interaction.customId;

            // ── SEARCH MODAL ──────────────────────────────────────────────────
            if (id === 'cwl_clan_modal_search') {
                const query = interaction.fields.getTextInputValue('search_query').trim();
                pendingSearch.set(interaction.user.id, query);
                
                const data = loadData();
                const { embed, components } = buildEditMessage(data, interaction.user.id);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            // ── UPDATE MODAL ──────────────────────────────────────────────────
            if (id.startsWith('cwl_clan_modal_update:')) {
                const clanTag = id.split(':')[1];
                const typeInput = interaction.fields.getTextInputValue('clan_type').toLowerCase().trim();

                if (typeInput !== 'lazy' && typeInput !== 'serious') {
                    return interaction.reply({
                        embeds: [new EmbedBuilder()
                            .setTitle("❌ Invalid Type")
                            .setDescription(`Clan type must be **Lazy** or **Serious**. You entered \`${typeInput}\`.`)
                            .setColor(0xE74C3C)],
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });
                const data = loadData();

                if (!data[clanTag]) {
                    return interaction.editReply({ content: `❌ Clan \`${clanTag}\` not found in the list.` });
                }

                const oldStyle = data[clanTag].style;
                data[clanTag].style = typeInput;
                saveData(data);
                pendingSelections.delete(interaction.user.id);
                pendingSearch.delete(interaction.user.id);

                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("✅ Clan Updated")
                        .setDescription(`**${data[clanTag].name}** (\`${clanTag}\`) changed from **${oldStyle.toUpperCase()}** → **${typeInput.toUpperCase()}**.`)
                        .setColor(0x2ECC71)]
                });
            }

            // ── ADD MODAL ─────────────────────────────────────────────────────
            if (id === 'cwl_clan_modal_add') {
                const rawTag = interaction.fields.getTextInputValue('clan_tag').trim();
                const typeInput = interaction.fields.getTextInputValue('clan_type').toLowerCase().trim();

                let clanTag = rawTag.startsWith("#") ? rawTag.toUpperCase() : "#" + rawTag.toUpperCase();
                const coc = context?.coc;
                if (coc && coc.formatTag) clanTag = coc.formatTag(rawTag);

                if (typeInput !== 'lazy' && typeInput !== 'serious') {
                    return interaction.reply({
                        embeds: [new EmbedBuilder()
                            .setTitle("❌ Invalid Type")
                            .setDescription(`Clan type must be **Lazy** or **Serious**. You entered \`${typeInput}\`.`)
                            .setColor(0xE74C3C)],
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });
                const data = loadData();

                if (data[clanTag]) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle("❌ Clan Already Exists")
                            .setDescription(`\`${clanTag}\` is already in the list. Use **Edit / Remove** to update it.`)
                            .setColor(0xE74C3C)]
                    });
                }

                let clanName = "Unknown Clan";
                if (coc) {
                    try {
                        const clan = await coc.getClan(clanTag);
                        if (clan) clanName = clan.name;
                    } catch {
                        return interaction.editReply({
                            embeds: [new EmbedBuilder()
                                .setTitle("❌ Clan Not Found")
                                .setDescription(`Could not find clan with tag \`${clanTag}\`. Check the tag and try again.`)
                                .setColor(0xE74C3C)]
                        });
                    }
                }

                data[clanTag] = { name: clanName, style: typeInput };
                saveData(data);

                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle("✅ CWL Clan Added")
                        .setDescription(`**${clanName}** (\`${clanTag}\`) added as a **${typeInput.toUpperCase()}** CWL clan.`)
                        .setColor(0x2ECC71)]
                });
            }
        } catch (error) {
            console.error("Error in cwl-clan modal submit:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ An error occurred.", embeds: [] }).catch(() => {});
            } else {
                await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
