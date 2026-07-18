const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    UserSelectMenuBuilder
} = require('discord.js');
const { getEmoji } = require('../../../utils/emoji.js');

const POSITIONS = [
    'Admin',
    'Co Admin',
    'Server Moderator',
    'Executive Staff',
    'CWL Staff',
    'Server HR',
    'Welcomer And Assistance Executive'
];

// Position abbreviations for embed display
const POSITION_SHORT = {
    'Admin': 'Admin',
    'Co Admin': 'Co Admin',
    'Server Moderator': 'Moderator',
    'Executive Staff': 'Executive',
    'CWL Staff': 'CWL Staff',
    'Server HR': 'HR',
    'Welcomer And Assistance Executive': 'Welcomer'
};

// Clan limits per position
const POSITION_CLAN_LIMITS = {
    'Admin': Infinity,
    'Co Admin': Infinity,
    'Server Moderator': 3,
    'Executive Staff': 2,
    'CWL Staff': 2,
    'Server HR': 2,
    'Welcomer And Assistance Executive': 2
};

// Positions that have unlimited clans
const UNLIMITED_POSITIONS = ['Co Admin', 'Admin'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff-members')
        .setDescription('Manage staff members for clans')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Choose an action')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Update / Remove', value: 'update_remove' },
                    { name: 'List', value: 'list' }
                )
        ),

    async execute(interaction, context) {
        const { data: dataManager, config } = context;
        const action = interaction.options.getString('action');

        // Permission setup
        const adminRoles = config.ADMIN_ROLE_IDS || [];
        const staffRoles = config.STAFF_ROLE_IDS || [];
        const allStaffRoles = config.ALL_STAFF_ROLE_IDS || [];

        // Manage perms: Admins, Server Moderator (index 0), T-Moderator (index 1)
        const manageRoles = [
            ...adminRoles,
            ...(staffRoles.length > 0 ? [staffRoles[0]] : []),
            ...(staffRoles.length > 1 ? [staffRoles[1]] : [])
        ].filter(Boolean);

        // List perms: Everyone above + all other staff roles + ALL_STAFF_ROLE
        const listRoles = [
            ...adminRoles,
            ...staffRoles,
            ...allStaffRoles
        ].filter(Boolean);

        const canManage = interaction.member.roles.cache.some(r => manageRoles.includes(r.id));
        const canList = interaction.member.roles.cache.some(r => listRoles.includes(r.id));

        if (action === 'add' || action === 'update_remove') {
            if (!canManage) {
                return interaction.reply({
                    content: `${getEmoji('tickred')} You do not have permission to manage staff members. (Requires Admin or Moderator role)`,
                    ephemeral: true
                });
            }
            if (action === 'add') await handleAdd(interaction, context);
            else await handleUpdateRemove(interaction, context);
        } else if (action === 'list') {
            if (!canList) {
                return interaction.reply({
                    content: `${getEmoji('tickred')} You do not have permission to view the staff list.`,
                    ephemeral: true
                });
            }
            await handleList(interaction, context);
        }
    }
};

// ─── ADD FLOW ───────────────────────────────────────────────────────────────

async function handleAdd(interaction, context) {
    const { data: dataManager, config } = context;
    const clanRoles = dataManager.getClanRoles();
    const clanTags = Object.keys(clanRoles);

    if (clanTags.length === 0) {
        return interaction.reply({ content: `${getEmoji('tickred')} No clans configured.`, ephemeral: true });
    }

    // Step 1: Select a clan
    const clanOptions = clanTags.map(tag => {
        const info = clanRoles[tag];
        return {
            label: `${info.nickName || tag} (${tag})`,
            value: tag,
            description: `Type: ${(info.clanType || 'fwa').toUpperCase()}`
        };
    }).slice(0, 25);

    const clanSelect = new StringSelectMenuBuilder()
        .setCustomId(`staff_add_clan_${interaction.user.id}`)
        .setPlaceholder('Select a clan to add staff to')
        .addOptions(clanOptions);

    const row = new ActionRowBuilder().addComponents(clanSelect);

    await interaction.reply({
        content: `${getEmoji('bluedot')} **Step 1/3:** Select the clan you want to add a staff member to.`,
        components: [row],
        ephemeral: true
    });

    // Handle clan selection
    const clientRef = interaction.client;
    const userId = interaction.user.id;

    const handleClanSelect = async (i) => {
        if (!i.isStringSelectMenu()) return;
        if (i.customId !== `staff_add_clan_${userId}`) return;
        if (i.user.id !== userId) return;

        clientRef.removeListener('interactionCreate', handleClanSelect);
        clearTimeout(clanTimeout);

        try { await i.deferUpdate(); } catch (e) { return; }

        const selectedClanTag = i.values[0];
        const clanInfo = clanRoles[selectedClanTag];

        // Step 2: Select position
        const positionOptions = POSITIONS.map(pos => ({
            label: pos,
            value: pos,
            description: POSITION_CLAN_LIMITS[pos] === Infinity ? 'Unlimited clans' : `Max clans: ${POSITION_CLAN_LIMITS[pos]}`
        }));

        const posSelect = new StringSelectMenuBuilder()
            .setCustomId(`staff_add_pos_${userId}`)
            .setPlaceholder('Select the staff position')
            .addOptions(positionOptions);

        const posRow = new ActionRowBuilder().addComponents(posSelect);

        await i.editReply({
            content: `${getEmoji('bluedot')} **Step 2/3:** Selected clan: **${clanInfo.nickName || selectedClanTag}**\n${getEmoji('arrow')} Now select the staff position.`,
            components: [posRow]
        });

        // Handle position selection
        const handlePosSelect = async (pi) => {
            if (!pi.isStringSelectMenu()) return;
            if (pi.customId !== `staff_add_pos_${userId}`) return;
            if (pi.user.id !== userId) return;

            clientRef.removeListener('interactionCreate', handlePosSelect);
            clearTimeout(posTimeout);

            try { await pi.deferUpdate(); } catch (e) { return; }

            const selectedPosition = pi.values[0];

            // Step 3: Select discord member
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId(`staff_add_user_${userId}`)
                .setPlaceholder('Select the Discord member')
                .setMinValues(1)
                .setMaxValues(1);

            const userRow = new ActionRowBuilder().addComponents(userSelect);

            await pi.editReply({
                content: `${getEmoji('bluedot')} **Step 3/3:** Clan: **${clanInfo.nickName || selectedClanTag}** ${getEmoji('chain')} Position: **${selectedPosition}**\n${getEmoji('arrow')} Now select the Discord member.`,
                components: [userRow]
            });

            // Handle user selection
            const handleUserSelect = async (ui) => {
                if (!ui.isUserSelectMenu()) return;
                if (ui.customId !== `staff_add_user_${userId}`) return;
                if (ui.user.id !== userId) return;

                clientRef.removeListener('interactionCreate', handleUserSelect);
                clearTimeout(userTimeout);

                try { await ui.deferUpdate(); } catch (e) { return; }

                const selectedUserId = ui.values[0];
                const selectedUser = await clientRef.users.fetch(selectedUserId).catch(() => null);

                if (!selectedUser) {
                    return ui.editReply({ content: `${getEmoji('tickred')} Could not find that user.`, components: [] });
                }

                // Check clan limit for this user
                const staffData = dataManager.getStaffMembers();

                // Check if member already has this position in this clan
                if (staffData[selectedClanTag]) {
                    const existing = staffData[selectedClanTag].find(
                        s => s.userId === selectedUserId && s.position === selectedPosition
                    );
                    if (existing) {
                        return ui.editReply({
                            content: `${getEmoji('tickred')} **${selectedUser.username}** is already assigned as **${selectedPosition}** in **${clanInfo.nickName || selectedClanTag}**.`,
                            components: []
                        });
                    }
                }

                // Check clan limits (skip for Admin/Co Admin — unlimited)
                if (!UNLIMITED_POSITIONS.includes(selectedPosition)) {
                    const posLimit = POSITION_CLAN_LIMITS[selectedPosition];
                    const positionClanCount = countMemberClansByPosition(staffData, selectedUserId, selectedPosition);
                    
                    if (positionClanCount >= posLimit) {
                        return ui.editReply({
                            content: `${getEmoji('tickred')} **${selectedUser.username}** has reached the maximum limit of **${posLimit} clans** for the **${selectedPosition}** position.`,
                            components: []
                        });
                    }
                }

                // Add staff member
                if (!staffData[selectedClanTag]) {
                    staffData[selectedClanTag] = [];
                }

                staffData[selectedClanTag].push({
                    userId: selectedUserId,
                    position: selectedPosition,
                    addedBy: userId,
                    addedAt: new Date().toISOString()
                });

                dataManager.saveStaffMembers(staffData);

                const successEmbed = new EmbedBuilder()
                    .setTitle(`${getEmoji('gtick')} Staff Member Added`)
                    .setColor('#2ECC71')
                    .setDescription(
                        `${getEmoji('bluedot')} **Member:** <@${selectedUserId}>\n` +
                        `${getEmoji('pinkdot')} **Clan:** ${clanInfo.nickName || selectedClanTag} (${selectedClanTag})\n` +
                        `${getEmoji('orangedot')} **Position:** ${selectedPosition}\n` +
                        `${getEmoji('cyandot')} **Added by:** <@${userId}>`
                    )
                    .setFooter({ text: '✅ Staff Management System' })
                    .setTimestamp();

                await ui.editReply({ content: null, embeds: [successEmbed], components: [] });

                if (config.LOG_CHANNEL_ID) {
                    const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                }
            };

            clientRef.on('interactionCreate', handleUserSelect);
            const userTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleUserSelect);
            }, 300000);
        };

        clientRef.on('interactionCreate', handlePosSelect);
        const posTimeout = setTimeout(() => {
            clientRef.removeListener('interactionCreate', handlePosSelect);
        }, 300000);
    };

    clientRef.on('interactionCreate', handleClanSelect);
    const clanTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleClanSelect);
    }, 300000);
}

// ─── UPDATE / REMOVE FLOW ───────────────────────────────────────────────────

async function handleUpdateRemove(interaction, context) {
    const { data: dataManager, config } = context;
    const clanRoles = dataManager.getClanRoles();
    const staffData = dataManager.getStaffMembers();

    // Find clans that have staff assigned
    const clansWithStaff = Object.keys(staffData).filter(tag => staffData[tag] && staffData[tag].length > 0);

    if (clansWithStaff.length === 0) {
        return interaction.reply({ content: `${getEmoji('tickred')} No staff members have been added yet.`, ephemeral: true });
    }

    // Step 1: Select a clan
    const clanOptions = clansWithStaff.map(tag => {
        const info = clanRoles[tag] || {};
        return {
            label: `${info.nickName || tag} (${tag})`,
            value: tag,
            description: `${staffData[tag].length} staff member(s)`
        };
    }).slice(0, 25);

    const clanSelect = new StringSelectMenuBuilder()
        .setCustomId(`staff_ur_clan_${interaction.user.id}`)
        .setPlaceholder('Select a clan')
        .addOptions(clanOptions);

    const row = new ActionRowBuilder().addComponents(clanSelect);

    await interaction.reply({
        content: `${getEmoji('bluedot')} **Select the clan** to update/remove staff from.`,
        components: [row],
        ephemeral: true
    });

    const clientRef = interaction.client;
    const userId = interaction.user.id;

    const handleClanSelect = async (i) => {
        if (!i.isStringSelectMenu()) return;
        if (i.customId !== `staff_ur_clan_${userId}`) return;
        if (i.user.id !== userId) return;

        clientRef.removeListener('interactionCreate', handleClanSelect);
        clearTimeout(clanTimeout);

        try { await i.deferUpdate(); } catch (e) { return; }

        const selectedClanTag = i.values[0];
        const clanInfo = clanRoles[selectedClanTag] || {};
        const clanStaff = staffData[selectedClanTag] || [];

        if (clanStaff.length === 0) {
            return i.editReply({ content: `${getEmoji('tickred')} No staff members in this clan.`, components: [] });
        }

        // Show staff list with Update and Remove buttons
        await showStaffManageEmbed(i, selectedClanTag, clanInfo, clanStaff, clientRef, userId, context);
    };

    clientRef.on('interactionCreate', handleClanSelect);
    const clanTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleClanSelect);
    }, 300000);
}

async function showStaffManageEmbed(interaction, clanTag, clanInfo, clanStaff, clientRef, userId, context) {
    const { data: dataManager, config } = context;

    // Build staff list with numbered entries
    let staffDesc = '';
    for (let idx = 0; idx < clanStaff.length; idx++) {
        const s = clanStaff[idx];
        const posShort = POSITION_SHORT[s.position] || s.position;
        staffDesc += `${getEmoji('rarroww')} **${idx + 1}.** <@${s.userId}> — ${posShort}\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${getEmoji('sheild')} Staff — ${clanInfo.nickName || clanTag}`)
        .setColor('#3498DB')
        .setDescription(staffDesc || `${getEmoji('orangedot')} No staff members.`)
        .setFooter({ text: '📋 Select a staff member, then choose Update or Remove' })
        .setTimestamp();

    // Staff member select menu
    const staffOptions = clanStaff.map((s, idx) => ({
        label: `${idx + 1}. ${POSITION_SHORT[s.position] || s.position}`,
        value: `${idx}`,
        description: `User ID: ${s.userId}`
    })).slice(0, 25);

    const staffSelect = new StringSelectMenuBuilder()
        .setCustomId(`staff_ur_select_${userId}`)
        .setPlaceholder('Select a staff member')
        .addOptions(staffOptions);

    const selectRow = new ActionRowBuilder().addComponents(staffSelect);

    const updateBtn = new ButtonBuilder()
        .setCustomId(`staff_ur_update_${userId}`)
        .setLabel('Update')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);

    const removeBtn = new ButtonBuilder()
        .setCustomId(`staff_ur_remove_${userId}`)
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

    const btnRow = new ActionRowBuilder().addComponents(updateBtn, removeBtn);

    await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [selectRow, btnRow]
    });

    let selectedStaffIndex = null;

    const handleStaffInteraction = async (si) => {
        if (si.user.id !== userId) return;

        // Handle staff member selection
        if (si.isStringSelectMenu() && si.customId === `staff_ur_select_${userId}`) {
            selectedStaffIndex = parseInt(si.values[0]);

            try { await si.deferUpdate(); } catch (e) { return; }

            // Enable buttons now
            const enabledUpdate = new ButtonBuilder()
                .setCustomId(`staff_ur_update_${userId}`)
                .setLabel('Update')
                .setStyle(ButtonStyle.Primary);

            const enabledRemove = new ButtonBuilder()
                .setCustomId(`staff_ur_remove_${userId}`)
                .setLabel('Remove')
                .setStyle(ButtonStyle.Danger);

            const enabledBtnRow = new ActionRowBuilder().addComponents(enabledUpdate, enabledRemove);

            const selected = clanStaff[selectedStaffIndex];
            const updatedEmbed = EmbedBuilder.from(embed)
                .setFooter({ text: `✏️ Selected: ${POSITION_SHORT[selected.position] || selected.position} — User: ${selected.userId}` });

            await si.editReply({
                embeds: [updatedEmbed],
                components: [selectRow, enabledBtnRow]
            });
            return;
        }

        // Handle Update button
        if (si.isButton() && si.customId === `staff_ur_update_${userId}`) {
            if (selectedStaffIndex === null) return;

            try { await si.deferUpdate(); } catch (e) { return; }

            // Show user select to pick replacement member
            const userSelect = new UserSelectMenuBuilder()
                .setCustomId(`staff_ur_newuser_${userId}`)
                .setPlaceholder('Select the replacement Discord member')
                .setMinValues(1)
                .setMaxValues(1);

            const userRow = new ActionRowBuilder().addComponents(userSelect);

            const selected = clanStaff[selectedStaffIndex];

            await si.editReply({
                content: `${getEmoji('bluedot')} **Updating:** <@${selected.userId}> (${POSITION_SHORT[selected.position] || selected.position})\n${getEmoji('arrow')} Select the **new member** to replace them.`,
                embeds: [],
                components: [userRow]
            });

            const handleNewUser = async (ui) => {
                if (!ui.isUserSelectMenu()) return;
                if (ui.customId !== `staff_ur_newuser_${userId}`) return;
                if (ui.user.id !== userId) return;

                clientRef.removeListener('interactionCreate', handleNewUser);
                clearTimeout(newUserTimeout);

                try { await ui.deferUpdate(); } catch (e) { return; }

                const newUserId = ui.values[0];
                const newUser = await clientRef.users.fetch(newUserId).catch(() => null);

                // Refresh staff data
                const freshStaff = dataManager.getStaffMembers();
                const clanStaffFresh = freshStaff[clanTag] || [];

                if (selectedStaffIndex >= clanStaffFresh.length) {
                    return ui.editReply({ content: `${getEmoji('tickred')} Staff data changed. Please try again.`, components: [] });
                }

                const oldUserId = clanStaffFresh[selectedStaffIndex].userId;
                const position = clanStaffFresh[selectedStaffIndex].position;

                // Check if new user already has this position in this clan
                const alreadyExists = clanStaffFresh.find(
                    (s, idx) => idx !== selectedStaffIndex && s.userId === newUserId && s.position === position
                );
                if (alreadyExists) {
                    return ui.editReply({
                        content: `${getEmoji('tickred')} **${newUser ? newUser.username : newUserId}** already has the **${position}** position in this clan.`,
                        components: []
                    });
                }

                // Check clan limits for new user (skip for Admin/Co Admin — unlimited)
                if (!UNLIMITED_POSITIONS.includes(position)) {
                    const posLimit = POSITION_CLAN_LIMITS[position] || 2;
                    const newUserPosClanCount = countMemberClansByPosition(freshStaff, newUserId, position);
                    if (newUserPosClanCount >= posLimit) {
                        return ui.editReply({
                            content: `${getEmoji('tickred')} **${newUser ? newUser.username : newUserId}** has reached the max limit of **${posLimit} clans** for **${position}**.`,
                            components: []
                        });
                    }
                }

                // Update
                clanStaffFresh[selectedStaffIndex].userId = newUserId;
                clanStaffFresh[selectedStaffIndex].addedBy = userId;
                clanStaffFresh[selectedStaffIndex].addedAt = new Date().toISOString();
                freshStaff[clanTag] = clanStaffFresh;
                dataManager.saveStaffMembers(freshStaff);

                const successEmbed = new EmbedBuilder()
                    .setTitle(`${getEmoji('gtick')} Staff Member Updated`)
                    .setColor('#F39C12')
                    .setDescription(
                        `${getEmoji('pinkdot')} **Clan:** ${clanInfo.nickName || clanTag}\n` +
                        `${getEmoji('bluedot')} **Position:** ${position}\n` +
                        `${getEmoji('orangedot')} **Old Member:** <@${oldUserId}>\n` +
                        `${getEmoji('cyandot')} **New Member:** <@${newUserId}>\n` +
                        `${getEmoji('bluedot')} **Updated by:** <@${userId}>`
                    )
                    .setFooter({ text: '✏️ Staff Management System' })
                    .setTimestamp();

                await ui.editReply({ content: null, embeds: [successEmbed], components: [] });

                if (config.LOG_CHANNEL_ID) {
                    const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                }

                // Cleanup main listener
                clientRef.removeListener('interactionCreate', handleStaffInteraction);
                clearTimeout(staffTimeout);
            };

            clientRef.on('interactionCreate', handleNewUser);
            const newUserTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleNewUser);
            }, 300000);

            return;
        }

        // Handle Remove button
        if (si.isButton() && si.customId === `staff_ur_remove_${userId}`) {
            if (selectedStaffIndex === null) return;

            try { await si.deferUpdate(); } catch (e) { return; }

            // Refresh data
            const freshStaff = dataManager.getStaffMembers();
            const clanStaffFresh = freshStaff[clanTag] || [];

            if (selectedStaffIndex >= clanStaffFresh.length) {
                return si.editReply({ content: `${getEmoji('tickred')} Staff data changed. Please try again.`, components: [] });
            }

            const removed = clanStaffFresh[selectedStaffIndex];
            
            clanStaffFresh.splice(selectedStaffIndex, 1);
            freshStaff[clanTag] = clanStaffFresh;

            // Remove empty clan entries
            if (clanStaffFresh.length === 0) {
                delete freshStaff[clanTag];
            }

            dataManager.saveStaffMembers(freshStaff);

            const removeEmbed = new EmbedBuilder()
                .setTitle(`${getEmoji('gtick')} Staff Member Removed`)
                .setColor('#E74C3C')
                .setDescription(
                    `${getEmoji('bluedot')} **Member:** <@${removed.userId}>\n` +
                    `${getEmoji('pinkdot')} **Clan:** ${clanInfo.nickName || clanTag}\n` +
                    `${getEmoji('orangedot')} **Position:** ${removed.position}\n` +
                    `${getEmoji('cyandot')} **Removed by:** <@${userId}>`
                )
                .setFooter({ text: '🗑️ Staff Management System' })
                .setTimestamp();

            await si.editReply({ content: null, embeds: [removeEmbed], components: [] });

            if (config.LOG_CHANNEL_ID) {
                const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                if (logChannel) {
                    await logChannel.send({ embeds: [removeEmbed] }).catch(() => null);
                }
            }

            // Cleanup
            clientRef.removeListener('interactionCreate', handleStaffInteraction);
            clearTimeout(staffTimeout);
            return;
        }
    };

    clientRef.on('interactionCreate', handleStaffInteraction);
    const staffTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleStaffInteraction);
    }, 300000);
}

// ─── LIST FLOW ──────────────────────────────────────────────────────────────

async function handleList(interaction, context) {
    const { data: dataManager, coc } = context;
    const clanRoles = dataManager.getClanRoles();
    const staffData = dataManager.getStaffMembers();

    try {
        await interaction.deferReply({ ephemeral: false });
    } catch (e) {
        return;
    }

    const clanTags = Object.keys(clanRoles);
    
    if (clanTags.length === 0) {
        return interaction.editReply({ content: `${getEmoji('tickred')} No clans configured.` });
    }

    const embeds = [];
    const noStaffClans = [];

    for (const tag of clanTags) {
        const info = clanRoles[tag];
        const clanStaff = staffData[tag] || [];

        // Try to fetch clan name
        let clanName = info.nickName || tag;
        try {
            const cocData = await coc.getClan(tag);
            if (cocData && cocData.name) clanName = cocData.name;
        } catch (e) { /* ignore */ }

        if (clanStaff.length === 0) {
            noStaffClans.push({ tag, name: clanName, info });
            continue;
        }

        let staffDesc = '';
        
        // Group by position
        const byPosition = {};
        for (const s of clanStaff) {
            if (!byPosition[s.position]) byPosition[s.position] = [];
            byPosition[s.position].push(s);
        }

        for (const [position, members] of Object.entries(byPosition)) {
            const posShort = POSITION_SHORT[position] || position;
            staffDesc += `\n${getEmoji('bluestar')} **${posShort}**\n`;
            for (const m of members) {
                staffDesc += `${getEmoji('rarroww')} <@${m.userId}>\n`;
            }
        }

        const clanType = (info.clanType || 'fwa').toUpperCase();
        const clanNick = (info.nickName || '').toLowerCase();
        const clanBadge = getEmoji(clanNick) || getEmoji('sheild');

        const embed = new EmbedBuilder()
            .setTitle(`${clanBadge} ${clanName} (${tag})`)
            .setColor(info.clanType === 'war' ? '#E74C3C' : '#3498DB')
            .setDescription(
                `${getEmoji('bluedot')} **Type:** ${clanType} ${getEmoji('chain')} **Staff Count:** ${clanStaff.length}\n` +
                staffDesc
            )
            .setFooter({ text: `📋 ${clanName}` })
            .setTimestamp();

        embeds.push(embed);
    }

    // ─── Build Summary Embed(s) — position-wise total member counts ───
    const globalPositionCounts = {};
    for (const pos of POSITIONS) {
        globalPositionCounts[pos] = new Set();
    }

    // Count unique members per position across ALL clans
    for (const clanMembers of Object.values(staffData)) {
        if (!Array.isArray(clanMembers)) continue;
        for (const s of clanMembers) {
            if (globalPositionCounts[s.position]) {
                globalPositionCounts[s.position].add(s.userId);
            }
        }
    }

    let summaryDesc = '';
    for (const pos of POSITIONS) {
        const posShort = POSITION_SHORT[pos] || pos;
        const count = globalPositionCounts[pos] ? globalPositionCounts[pos].size : 0;
        summaryDesc += `${getEmoji('rarroww')} **${posShort}** : ${count} member${count !== 1 ? 's' : ''}\n`;
    }

    // Calculate total unique staff members
    const allUniqueMembers = new Set();
    for (const memberSet of Object.values(globalPositionCounts)) {
        for (const uid of memberSet) {
            allUniqueMembers.add(uid);
        }
    }

    // Split summary into continuation embeds if it exceeds 4096 chars
    const summaryEmbeds = [];
    const summaryHeader = `${getEmoji('mem')} **Total Unique Staff:** ${allUniqueMembers.size}\n\n`;
    const fullSummary = summaryHeader + summaryDesc;

    if (fullSummary.length <= 4096) {
        summaryEmbeds.push(
            new EmbedBuilder()
                .setTitle(`${getEmoji('bluestar')} Staff Summary`)
                .setColor('#9B59B6')
                .setDescription(fullSummary)
                .setFooter({ text: '📊 Staff Members Overview' })
                .setTimestamp()
        );
    } else {
        // Split into chunks of ~3800 chars to stay safe
        const lines = fullSummary.split('\n');
        let chunk = '';
        let partNum = 1;
        for (const line of lines) {
            if ((chunk + line + '\n').length > 3800) {
                summaryEmbeds.push(
                    new EmbedBuilder()
                        .setTitle(`${getEmoji('bluestar')} Staff Summary${partNum > 1 ? ` (Cont. ${partNum})` : ''}`)
                        .setColor('#9B59B6')
                        .setDescription(chunk)
                        .setFooter({ text: `📊 Staff Summary — Part ${partNum}` })
                        .setTimestamp()
                );
                chunk = '';
                partNum++;
            }
            chunk += line + '\n';
        }
        if (chunk.trim()) {
            summaryEmbeds.push(
                new EmbedBuilder()
                    .setTitle(`${getEmoji('bluestar')} Staff Summary${partNum > 1 ? ` (Cont. ${partNum})` : ''}`)
                    .setColor('#9B59B6')
                    .setDescription(chunk)
                    .setFooter({ text: '📊 Staff Members Overview' })
                    .setTimestamp()
            );
        }
    }

    // Combine clan embeds + summary embeds
    const allEmbeds = [...embeds, ...summaryEmbeds];

    // Build No staff clans embed(s)
    if (noStaffClans.length > 0) {
        let noStaffDesc = '';
        for (const clan of noStaffClans) {
            const clanNick = (clan.info.nickName || '').toLowerCase();
            const clanBadge = getEmoji(clanNick) || getEmoji('sheild');
            noStaffDesc += `${clanBadge} **${clan.name}** (${clan.tag})\n`;
        }

        if (noStaffDesc.length <= 4096) {
            allEmbeds.push(
                new EmbedBuilder()
                    .setTitle(`${getEmoji('orangedot')} No Staff Clans`)
                    .setColor('#E67E22')
                    .setDescription(noStaffDesc)
                    .setFooter({ text: '🚫 Clans without staff' })
                    .setTimestamp()
            );
        } else {
            const lines = noStaffDesc.split('\n');
            let chunk = '';
            let partNum = 1;
            for (const line of lines) {
                if ((chunk + line + '\n').length > 3800) {
                    allEmbeds.push(
                        new EmbedBuilder()
                            .setTitle(`${getEmoji('orangedot')} No Staff Clans${partNum > 1 ? ` (Cont. ${partNum})` : ''}`)
                            .setColor('#E67E22')
                            .setDescription(chunk)
                            .setFooter({ text: `🚫 Clans without staff — Part ${partNum}` })
                            .setTimestamp()
                    );
                    chunk = '';
                    partNum++;
                }
                chunk += line + '\n';
            }
            if (chunk.trim()) {
                allEmbeds.push(
                    new EmbedBuilder()
                        .setTitle(`${getEmoji('orangedot')} No Staff Clans${partNum > 1 ? ` (Cont. ${partNum})` : ''}`)
                        .setColor('#E67E22')
                        .setDescription(chunk)
                        .setFooter({ text: '🚫 Clans without staff' })
                        .setTimestamp()
                );
            }
        }
    }

    // Discord allows max 10 embeds per message
    const chunks = [];
    for (let i = 0; i < allEmbeds.length; i += 10) {
        chunks.push(allEmbeds.slice(i, i + 10));
    }

    await interaction.editReply({ embeds: chunks[0] });

    for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ embeds: chunks[i] });
    }
}

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/**
 * Count how many clans a member is staff in for a specific position
 */
function countMemberClansByPosition(staffData, userId, position) {
    let count = 0;
    for (const [clanTag, members] of Object.entries(staffData)) {
        if (!Array.isArray(members)) continue;
        for (const m of members) {
            if (m.userId === userId && m.position === position) {
                count++;
                break; // Only count each clan once per position
            }
        }
    }
    return count;
}
