const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder , MessageFlags } = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, "../../../data/cwlclans.json");
const cwlFuturePath = path.join(__dirname, "../../../data/cwlfuture.json");

// In-memory store: userId -> array of selected clan tags
const pendingSelections = new Map();
const pendingSearch = new Map();
const pendingActivePage = new Map();
const pendingInactivePage = new Map();
const pendingActiveSearch = new Map();

function loadData() {
    try {
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            if (Object.keys(data).length > 0) return data;
        }
    } catch (e) {}
    try {
        if (fs.existsSync(cwlFuturePath)) {
            const data = JSON.parse(fs.readFileSync(cwlFuturePath, 'utf8'));
            if (Object.keys(data).length > 0) {
                saveData(data);
                return data;
            }
        }
    } catch (e) {}
    return {};
}

function saveData(data) {
    try {
        const dataDir = path.dirname(dataPath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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
    const activeCount = entries.filter(([, v]) => v.active === true).length;
    const inactiveCount = entries.length - activeCount;

    let desc = "";
    desc += `🟢 **Active for /cwl-compo:** ${activeCount} clan(s) | ⚪ **Inactive:** ${inactiveCount} clan(s)\n\n`;

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
        description: `${tag} — ${v.style === 'serious' ? '🏆 Serious' : '😴 Lazy'} ${v.active ? '🟢' : '⚪'}`,
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
        .setLabel("🔍 Search")
        .setStyle(ButtonStyle.Secondary);

    const btnUpdate = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_update")
        .setLabel("✏️ Update")
        .setStyle(ButtonStyle.Primary);

    const btnDelete = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_delete")
        .setLabel("🗑️ Delete")
        .setStyle(ButtonStyle.Danger);

    const btnActive = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_active_btn")
        .setLabel("🟢 Active")
        .setStyle(ButtonStyle.Success);

    const btnInactive = new ButtonBuilder()
        .setCustomId("cwl_clan_edit_inactive_btn")
        .setLabel("🔴 Inactive")
        .setStyle(ButtonStyle.Secondary);

    const btnRow = new ActionRowBuilder().addComponents(btnSearch, btnUpdate, btnDelete, btnActive, btnInactive);

    return { embed, components: options.length > 0 ? [selectRow, btnRow] : [btnRow] };
}

function buildActiveMessage(data, userId) {
    const entries = Object.entries(data);
    const activeClans = entries.filter(([, v]) => v.active === true);
    let inactiveClans = entries.filter(([, v]) => v.active !== true);

    const searchQuery = userId ? (pendingActiveSearch.get(userId) || "") : "";
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        inactiveClans = inactiveClans.filter(([tag, v]) => tag.toLowerCase().includes(q) || v.name.toLowerCase().includes(q));
    }

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(inactiveClans.length / pageSize));
    let page = userId ? (pendingActivePage.get(userId) || 0) : 0;
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    if (userId) pendingActivePage.set(userId, page);

    const pagedInactive = inactiveClans.slice(page * pageSize, (page + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setTitle("🟢 CWL Clans — Add to Active List")
        .setColor(0x2ECC71);

    let desc = "";
    if (searchQuery) {
        desc += `🔍 **Search Filter:** \`${searchQuery}\`\n\n`;
    }

    if (activeClans.length > 0) {
        desc += `**🟢 Currently Active Clans (${activeClans.length}):**\n`;
        const preview = activeClans.slice(0, 10);
        preview.forEach(([tag, v]) => {
            desc += `• **${v.name}** \`${tag}\` (${v.style === 'serious' ? '🏆 Serious' : '😴 Lazy'})\n`;
        });
        if (activeClans.length > 10) {
            desc += `*...and ${activeClans.length - 10} more active clans.*\n`;
        }
        desc += "\n";
    } else {
        desc += "⚠️ **No clans are currently active!**\n*(Only active clans will appear in `/cwl-compo` All Clans)*\n\n";
    }

    if (inactiveClans.length > 0) {
        desc += `👉 **Select clans below to ADD them to Active:**\n*(Page ${page + 1}/${totalPages} — ${inactiveClans.length} available to add)*`;
    } else {
        desc += searchQuery ? "❌ *No inactive clans match your search.*" : "✅ *All stored clans are already Active!*";
    }

    if (desc.length > 4096) desc = desc.slice(0, 4093) + "...";
    embed.setDescription(desc);

    const components = [];

    // Select menu for inactive clans to make active
    if (pagedInactive.length > 0) {
        const options = pagedInactive.map(([tag, v]) => ({
            label: v.name.slice(0, 100),
            description: `${tag} — ${v.style === 'serious' ? '🏆 Serious' : '😴 Lazy'}`,
            value: tag
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("cwl_clan_active_add_sel")
            .setPlaceholder(`Select clans to make Active... (Page ${page + 1}/${totalPages})`)
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options);

        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    // Navigation buttons row
    const btnBack = new ButtonBuilder()
        .setCustomId("cwl_clan_active_back")
        .setLabel("🔙 Back")
        .setStyle(ButtonStyle.Secondary);

    const btnPrev = new ButtonBuilder()
        .setCustomId("cwl_clan_active_prev")
        .setLabel("◀️ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

    const btnNext = new ButtonBuilder()
        .setCustomId("cwl_clan_active_next")
        .setLabel("Next ▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1);

    const btnSearch = new ButtonBuilder()
        .setCustomId("cwl_clan_active_search_btn")
        .setLabel(searchQuery ? "❌ Clear Search" : "🔍 Search")
        .setStyle(searchQuery ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const btnAll = new ButtonBuilder()
        .setCustomId("cwl_clan_active_all")
        .setLabel("✅ Add All Active")
        .setStyle(ButtonStyle.Success);

    const navRow = new ActionRowBuilder().addComponents(btnBack, btnPrev, btnNext, btnSearch, btnAll);
    components.push(navRow);

    return { embed, components };
}

function buildInactiveMessage(data, userId) {
    const entries = Object.entries(data);
    const activeClans = entries.filter(([, v]) => v.active === true);

    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(activeClans.length / pageSize));
    let page = userId ? (pendingInactivePage.get(userId) || 0) : 0;
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    if (userId) pendingInactivePage.set(userId, page);

    const pagedActive = activeClans.slice(page * pageSize, (page + 1) * pageSize);

    const embed = new EmbedBuilder()
        .setTitle("🔴 CWL Clans — Remove from Active List")
        .setColor(0xE74C3C);

    let desc = "";
    if (activeClans.length > 0) {
        desc += `**🟢 Currently Active Clans (${activeClans.length}):**\n`;
        const preview = activeClans.slice(0, 12);
        preview.forEach(([tag, v]) => {
            desc += `• **${v.name}** \`${tag}\` (${v.style === 'serious' ? '🏆 Serious' : '😴 Lazy'})\n`;
        });
        if (activeClans.length > 12) {
            desc += `*...and ${activeClans.length - 12} more active clans.*\n`;
        }
        desc += "\n";
        desc += `👉 **Select clans from the dropdown below to make them Inactive:**\n*(Page ${page + 1}/${totalPages})*`;
    } else {
        desc += "ℹ️ **No clans are currently active!**\n*All clans are already Inactive. None will show in `/cwl-compo` All Clans.*";
    }

    if (desc.length > 4096) desc = desc.slice(0, 4093) + "...";
    embed.setDescription(desc);

    const components = [];

    // Select menu with active clans to deactivate
    if (pagedActive.length > 0) {
        const options = pagedActive.map(([tag, v]) => ({
            label: v.name.slice(0, 100),
            description: `${tag} — Click to make Inactive`,
            value: tag
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("cwl_clan_inactive_remove_sel")
            .setPlaceholder(`Select active clans to make Inactive... (Page ${page + 1}/${totalPages})`)
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options);

        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    // Buttons
    const btnBack = new ButtonBuilder()
        .setCustomId("cwl_clan_inactive_back")
        .setLabel("🔙 Back")
        .setStyle(ButtonStyle.Secondary);

    const btnClearAll = new ButtonBuilder()
        .setCustomId("cwl_clan_inactive_all")
        .setLabel("❌ Clear All Active")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(activeClans.length === 0);

    const btnList = [btnBack];

    if (totalPages > 1) {
        const btnPrev = new ButtonBuilder()
            .setCustomId("cwl_clan_inactive_prev")
            .setLabel("◀️ Prev")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0);

        const btnNext = new ButtonBuilder()
            .setCustomId("cwl_clan_inactive_next")
            .setLabel("Next ▶️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1);

        btnList.push(btnPrev, btnNext);
    }

    btnList.push(btnClearAll);

    components.push(new ActionRowBuilder().addComponents(btnList));

    return { embed, components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cwl-clan')
        .setDescription('Manage CWL clans')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
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
            const { config } = context;
            const member = interaction.member;

            if (!checkPermission('cwl-clan', interaction)) {
                return interaction.reply({ content: "❌ You do not have permission to use this command.", flags: [MessageFlags.Ephemeral] });
            }

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
                try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }
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
                await interaction.reply({ content: "❌ Failed to open the panel.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
            } else {
                await interaction.editReply({ content: "❌ Failed to open the panel." }).catch(() => {});
            }
        }
    },

    // Called by handler.js when customId === "cwl_clan_edit_sel" or starts with "cwl_clan_active_" or "cwl_clan_inactive_"
    async handleSelectMenu(interaction, context) {
        try {
            const id = interaction.customId;
            const data = loadData();

            if (id === "cwl_clan_edit_sel") {
                const selected = interaction.values || []; 
                pendingSelections.set(interaction.user.id, selected);

                const { embed, components } = buildEditMessage(data, interaction.user.id);

                await interaction.update({
                    embeds: [embed],
                    components,
                    content: ""
                });
            } else if (id === "cwl_clan_active_add_sel" || id === "cwl_clan_active_sel") {
                const selected = interaction.values || [];
                for (const tag of selected) {
                    if (data[tag]) data[tag].active = true;
                }
                saveData(data);

                const { embed, components } = buildActiveMessage(data, interaction.user.id);

                await interaction.update({
                    embeds: [embed],
                    components,
                    content: ""
                });
            } else if (id === "cwl_clan_inactive_remove_sel") {
                const selected = interaction.values || [];
                for (const tag of selected) {
                    if (data[tag]) data[tag].active = false;
                }
                saveData(data);

                const { embed, components } = buildInactiveMessage(data, interaction.user.id);

                await interaction.update({
                    embeds: [embed],
                    components,
                    content: ""
                });
            }
        } catch (error) {
            console.error("Error in cwl-clan select menu:", error);
            await interaction.reply({ content: "❌ Error processing selection.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
        }
    },

    // Called by handler.js when customId starts with "cwl_clan_edit_", "cwl_clan_active_", or "cwl_clan_inactive_"
    async handleButton(interaction, context) {
        try {
            const id = interaction.customId;
            const userId = interaction.user.id;
            const data = loadData();

            // ── ACTIVE & INACTIVE PANEL BUTTONS ───────────────────────────────
            if (id === "cwl_clan_edit_active_btn") {
                pendingActivePage.set(userId, 0);
                pendingActiveSearch.delete(userId);
                const { embed, components } = buildActiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_edit_inactive_btn") {
                pendingInactivePage.set(userId, 0);
                const { embed, components } = buildInactiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_active_back" || id === "cwl_clan_inactive_back") {
                pendingActiveSearch.delete(userId);
                const { embed, components } = buildEditMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_active_prev") {
                const cur = pendingActivePage.get(userId) || 0;
                pendingActivePage.set(userId, Math.max(0, cur - 1));
                const { embed, components } = buildActiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_active_next") {
                const cur = pendingActivePage.get(userId) || 0;
                pendingActivePage.set(userId, cur + 1);
                const { embed, components } = buildActiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_inactive_prev") {
                const cur = pendingInactivePage.get(userId) || 0;
                pendingInactivePage.set(userId, Math.max(0, cur - 1));
                const { embed, components } = buildInactiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_inactive_next") {
                const cur = pendingInactivePage.get(userId) || 0;
                pendingInactivePage.set(userId, cur + 1);
                const { embed, components } = buildInactiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_active_all") {
                for (const tag of Object.keys(data)) {
                    data[tag].active = true;
                }
                saveData(data);
                const { embed, components } = buildActiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_inactive_all" || id === "cwl_clan_active_none") {
                for (const tag of Object.keys(data)) {
                    data[tag].active = false;
                }
                saveData(data);
                const { embed, components } = buildInactiveMessage(data, userId);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            if (id === "cwl_clan_active_search_btn") {
                const cur = pendingActiveSearch.get(userId);
                if (cur) {
                    pendingActiveSearch.delete(userId);
                    pendingActivePage.set(userId, 0);
                    const { embed, components } = buildActiveMessage(data, userId);
                    return interaction.update({ embeds: [embed], components, content: "" });
                }

                const modal = new ModalBuilder()
                    .setCustomId('cwl_clan_modal_active_search')
                    .setTitle('Search Inactive CWL Clans');

                const searchInput = new TextInputBuilder()
                    .setCustomId('search_query')
                    .setLabel('Clan Name or Tag')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter text to filter clans...')
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
                return interaction.showModal(modal);
            }

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
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // ── DELETE ────────────────────────────────────────────────────────
            if (id === "cwl_clan_edit_delete") {
                try { await interaction.deferUpdate(); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

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
                        flags: [MessageFlags.Ephemeral]
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
                await interaction.reply({ content: "❌ An error occurred.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    },

    async handleModalSubmit(interaction, context) {
        try {
            const id = interaction.customId;

            // ── SEARCH MODAL (EDIT PANEL) ────────────────────────────────────
            if (id === 'cwl_clan_modal_search') {
                const query = interaction.fields.getTextInputValue('search_query').trim();
                pendingSearch.set(interaction.user.id, query);
                
                const data = loadData();
                const { embed, components } = buildEditMessage(data, interaction.user.id);
                return interaction.update({ embeds: [embed], components, content: "" });
            }

            // ── SEARCH MODAL (ACTIVE PANEL) ──────────────────────────────────
            if (id === 'cwl_clan_modal_active_search') {
                const query = interaction.fields.getTextInputValue('search_query').trim();
                if (query) {
                    pendingActiveSearch.set(interaction.user.id, query);
                } else {
                    pendingActiveSearch.delete(interaction.user.id);
                }
                pendingActivePage.set(interaction.user.id, 0);

                const data = loadData();
                const { embed, components } = buildActiveMessage(data, interaction.user.id);
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
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }
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
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }
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

                data[clanTag] = { name: clanName, style: typeInput, active: true };
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
                await interaction.reply({ content: "❌ An error occurred.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    }
};
