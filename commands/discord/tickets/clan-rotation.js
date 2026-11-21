const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');
const clanRecruitments = require('../../../utils/clanRecruitments');
const dataManager = require('../../../utils/dataManager');
const emojiModule = require('../../../utils/emoji');
const getThEmoji = emojiModule?.getThEmoji;
const getThEmojiObject = emojiModule?.getThEmojiObject;
const getEmojiObject = emojiModule?.getEmojiObject;
const getEmoji = emojiModule?.getEmoji;
const rawEmojis = emojiModule?.emojis || {};

// In-memory cache for clan names to reduce CoC API lookups
const clanNameCache = new Map();

// Maximum characters per page before splitting into pagination
const MAX_PAGE_CHARS = 2800;

/**
 * Get clan badge emoji (matching clan nickname or whitefwa fallback)
 */
function getClanBadge(nickName, emojiUtils) {
    const fallbackEmoji = (emojiUtils && typeof emojiUtils.getEmoji === 'function' ? emojiUtils.getEmoji("whitefwa") : null)
        || (typeof getEmoji === 'function' ? getEmoji("whitefwa") : null)
        || (rawEmojis.whitefwa ? `<:whitefwa:${rawEmojis.whitefwa}>` : "🛡️");
    if (!nickName) return fallbackEmoji;
    const clean = nickName.trim().toLowerCase();
    let e = null;
    if (emojiUtils && typeof emojiUtils.getEmoji === 'function') {
        e = emojiUtils.getEmoji(clean);
    }
    if (!e && typeof getEmoji === 'function') {
        e = getEmoji(clean);
    }
    if (!e && rawEmojis[clean]) {
        e = `<:${clean}:${rawEmojis[clean]}>`;
    }
    return e || fallbackEmoji;
}

/**
 * Format timestamp into Discord markdown <t:unix:d> (<t:unix:R>) or fallback
 */
function formatAssignmentDateStr(isoString) {
    if (!isoString) return "Unknown";
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const unix = Math.floor(d.getTime() / 1000);
        return `<t:${unix}:d> (<t:${unix}:R>)`;
    } catch (_) {
        return isoString;
    }
}

/**
 * Resolve Town Hall emoji string safely with fallbacks
 */
function resolveThEmojiString(cleanNum, emojiUtils) {
    let thEmoji = null;
    if (emojiUtils && typeof emojiUtils.getEmoji === 'function') {
        thEmoji = emojiUtils.getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getEmoji === 'function') {
        thEmoji = getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getThEmoji === 'function') {
        thEmoji = getThEmoji(cleanNum);
    }
    if (!thEmoji && rawEmojis["th" + cleanNum]) {
        thEmoji = `<:th${cleanNum}:${rawEmojis["th" + cleanNum]}>`;
    }
    return thEmoji || "🏰";
}

/**
 * Build pages for the public clan rotation overview embed.
 * Lists all FWA clans and under each clan displays every tracked TH emoji.
 * If a player is assigned in the present rotation: shows player details.
 * If no player is assigned in the present rotation: leaves empty after hyphen ("Th18 emoji - ").
 */
function buildPublicPages(clanRoles, recruitmentsData, trackedTHs, emojiUtils = null, rulesData = null, maxChars = MAX_PAGE_CHARS) {
    const fwaClanTags = Object.keys(clanRoles).filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'fwa');
    const clanBlocks = [];

    fwaClanTags.forEach((tag, idx) => {
        const config = clanRoles[tag];
        const nick = config.nickName || "";
        const badgeEmoji = getClanBadge(nick, emojiUtils);

        // Resolve clan name
        let clanName = clanNameCache.get(tag) || rulesData?.clans?.[tag]?.name;
        if (!clanName || clanName === nick) {
            clanName = config.name || nick || tag;
        }

        const clanRec = recruitmentsData[tag];
        const lines = [`${idx + 1}. ${badgeEmoji} **${clanName}** - \`${tag}\``];

        for (const th of trackedTHs) {
            const cleanNum = th.toLowerCase().replace(/^th/, '');
            const thEmoji = resolveThEmojiString(cleanNum, emojiUtils);
            const rotObj = clanRec?.presentRotation?.[th];
            const players = rotObj?.players || [];

            if (players.length > 0) {
                const lastPlayer = players[players.length - 1];
                const dateStr = formatAssignmentDateStr(lastPlayer.dateTime);
                lines.push(`${thEmoji} - **${lastPlayer.playerName}** \`${lastPlayer.playerTag}\` date: ${dateStr}`);
            } else {
                lines.push(`${thEmoji} - `);
            }
        }

        clanBlocks.push(lines.join('\n'));
    });

    const fullText = clanBlocks.join('\n\n');
    if (fullText.length <= maxChars) {
        return [fullText];
    }

    const pages = [];
    let currentBlocks = [];
    let currentLen = 0;

    for (const block of clanBlocks) {
        const addedLen = (currentLen > 0 ? 2 : 0) + block.length;
        if (currentLen + addedLen > maxChars && currentBlocks.length > 0) {
            pages.push(currentBlocks.join('\n\n'));
            currentBlocks = [block];
            currentLen = block.length;
        } else {
            currentBlocks.push(block);
            currentLen += addedLen;
        }
    }

    if (currentBlocks.length > 0) {
        pages.push(currentBlocks.join('\n\n'));
    }

    return pages;
}

/**
 * Build the public overview embed
 */
function buildPublicRotationEmbed(pageContent, currentPage = 0, totalPages = 1) {
    const embed = new EmbedBuilder()
        .setTitle("🔄 FWA Clan Recruitment Rotations")
        .setColor(0x3498DB)
        .setDescription(pageContent)
        .setTimestamp();

    if (totalPages > 1) {
        embed.setFooter({
            text: `Page ${currentPage + 1}/${totalPages} • Click any TH button below for private rotation breakdown`
        });
    } else {
        embed.setFooter({
            text: "Click any TH button below for private rotation breakdown"
        });
    }

    return embed;
}

/**
 * Build pages for a specific Town Hall rotation queue.
 * If total text exceeds MAX_PAGE_CHARS, splits into multiple pages.
 * @returns {string[]} Array of page description strings
 */
function buildPages(clanRoles, recruitmentsData, activeTh, emojiUtils = null, rulesData = null, maxChars = MAX_PAGE_CHARS) {
    const fwaClanTags = Object.keys(clanRoles).filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'fwa');

    // 1. Identify which clan is "just received", "on cooldown", "next in the list", "waiting"
    let latestTimestamp = -1;
    let justReceivedTag = null;
    const receivedTags = new Set();

    for (const tag of fwaClanTags) {
        const clanRec = recruitmentsData[tag];
        const rotObj = clanRec?.presentRotation?.[activeTh];
        const players = rotObj?.players || [];
        if (players.length > 0) {
            receivedTags.add(tag);
            const latestPlayer = players[players.length - 1];
            const time = new Date(latestPlayer.dateTime).getTime();
            if (time > latestTimestamp) {
                latestTimestamp = time;
                justReceivedTag = tag;
            }
        }
    }

    // Find first waiting clan in list order for "next in the list"
    let nextInListTag = null;
    for (const tag of fwaClanTags) {
        if (!receivedTags.has(tag)) {
            nextInListTag = tag;
            break;
        }
    }

    // 2. Build block for each clan
    const cleanNum = activeTh.toLowerCase().replace(/^th/, '');
    let thEmoji = null;
    if (emojiUtils && typeof emojiUtils.getEmoji === 'function') {
        thEmoji = emojiUtils.getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getEmoji === 'function') {
        thEmoji = getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getThEmoji === 'function') {
        thEmoji = getThEmoji(cleanNum);
    }
    if (!thEmoji && rawEmojis["th" + cleanNum]) {
        thEmoji = `<:th${cleanNum}:${rawEmojis["th" + cleanNum]}>`;
    }
    if (!thEmoji) {
        thEmoji = "🏰";
    }

    const clanBlocks = [];

    fwaClanTags.forEach((tag, idx) => {
        const config = clanRoles[tag];
        const nick = config.nickName || "";
        const badgeEmoji = getClanBadge(nick, emojiUtils);

        // Resolve clan name
        let clanName = clanNameCache.get(tag) || rulesData?.clans?.[tag]?.name;
        if (!clanName || clanName === nick) {
            clanName = config.name || nick || tag;
        }

        const clanRec = recruitmentsData[tag];
        const rotObj = clanRec?.presentRotation?.[activeTh];
        const players = rotObj?.players || [];

        let statusLabel = "";
        let playerSubLine = null;

        if (tag === justReceivedTag) {
            statusLabel = "(just received)";
            const lastPlayer = players[players.length - 1];
            const dateStr = formatAssignmentDateStr(lastPlayer.dateTime);
            playerSubLine = `• ${thEmoji} Last assigned: **${lastPlayer.playerName}** \`${lastPlayer.playerTag}\` date: ${dateStr}`;
        } else if (receivedTags.has(tag)) {
            statusLabel = "(on cooldown)";
            const lastPlayer = players[players.length - 1];
            const dateStr = formatAssignmentDateStr(lastPlayer.dateTime);
            playerSubLine = `• ${thEmoji} Last assigned: **${lastPlayer.playerName}** \`${lastPlayer.playerTag}\` date: ${dateStr}`;
        } else if (tag === nextInListTag) {
            statusLabel = "(next in the list)";
        } else {
            statusLabel = "(waiting)";
        }

        let block = `${idx + 1}. ${badgeEmoji} **${clanName}** - \`${tag}\` ${statusLabel}`;
        if (playerSubLine) {
            block += `\n${playerSubLine}`;
        }
        clanBlocks.push(block);
    });

    const fullText = clanBlocks.join('\n\n');

    // If size does not exceed limit, return 1 page
    if (fullText.length <= maxChars) {
        return [fullText];
    }

    // If size exceeded, paginate dynamically
    const pages = [];
    let currentBlocks = [];
    let currentLen = 0;

    for (const block of clanBlocks) {
        const addedLen = (currentLen > 0 ? 2 : 0) + block.length;
        if (currentLen + addedLen > maxChars && currentBlocks.length > 0) {
            pages.push(currentBlocks.join('\n\n'));
            currentBlocks = [block];
            currentLen = block.length;
        } else {
            currentBlocks.push(block);
            currentLen += addedLen;
        }
    }

    if (currentBlocks.length > 0) {
        pages.push(currentBlocks.join('\n\n'));
    }

    return pages;
}

/**
 * Build the embed for a specific page of a Town Hall rotation
 */
function buildRotationEmbed(pageContent, activeTh, currentPage = 0, totalPages = 1) {
    const embed = new EmbedBuilder()
        .setTitle(`🔄 FWA Clan Rotation — ${activeTh}`)
        .setColor(0x3498DB)
        .setDescription(pageContent)
        .setTimestamp();

    if (totalPages > 1) {
        embed.setFooter({
            text: `Page ${currentPage + 1}/${totalPages} • Independent rotation • Limit: 1 per clan before reset`
        });
    } else {
        embed.setFooter({
            text: "Independent rotation • Limit: 1 per clan before reset"
        });
    }

    return embed;
}

/**
 * Build interactive action row buttons for switching TH rotations, refreshing,
 * and navigating pages when size exceeded.
 * Uses emojis from emoji.js for TH, refresh, and pagination buttons.
 * Guarantees no ActionRow exceeds Discord's 5 components limit.
 */
function buildComponents(trackedTHs, activeTh, interactionId, currentPage = 0, totalPages = 1, emojiUtils = null) {
    const rows = [];
    const thAndRefreshButtons = [];

    const resolveEmojiObj = (name) => {
        if (!name) return null;
        const key = String(name).trim();
        if (emojiUtils && typeof emojiUtils.getEmojiObject === 'function') {
            const obj = emojiUtils.getEmojiObject(key);
            if (obj) return obj;
        }
        if (typeof getEmojiObject === 'function') {
            const obj = getEmojiObject(key);
            if (obj) return obj;
        }
        // Direct dictionary lookup from rawEmojis
        if (rawEmojis[key]) {
            return {
                id: rawEmojis[key],
                name: key,
                animated: false
            };
        }
        return null;
    };

    const resolveThEmojiObj = (cleanNum) => {
        if (!cleanNum) return null;
        const clean = String(cleanNum).toLowerCase().replace(/^th/, '').trim();
        if (emojiUtils && typeof emojiUtils.getThEmojiObject === 'function') {
            const obj = emojiUtils.getThEmojiObject(clean);
            if (obj) return obj;
        }
        if (typeof getThEmojiObject === 'function') {
            const obj = getThEmojiObject(clean);
            if (obj) return obj;
        }
        // Fall back directly to getEmojiObject / rawEmojis with "th" + clean
        return resolveEmojiObj("th" + clean) || resolveEmojiObj(clean);
    };

    // TH buttons (strictly emojis from emoji.js, NO text names!)
    for (const th of trackedTHs) {
        const clean = th.toLowerCase().replace(/^th/, '');
        const thEmojiObj = resolveThEmojiObj(clean);

        const thBtn = new ButtonBuilder()
            .setCustomId(`rot_th_${th}_${interactionId}`)
            .setStyle(th === activeTh ? ButtonStyle.Primary : ButtonStyle.Secondary);

        if (thEmojiObj) {
            thBtn.setEmoji(thEmojiObj);
        } else {
            thBtn.setEmoji("🏰");
        }

        thAndRefreshButtons.push(thBtn);
    }

    // Refresh button using refresh emoji from emoji.js (no text name!)
    const refreshEmojiObj = resolveEmojiObj('refresh');

    const refreshBtn = new ButtonBuilder()
        .setCustomId(`rot_refresh_${interactionId}`)
        .setStyle(ButtonStyle.Success);

    if (refreshEmojiObj) {
        refreshBtn.setEmoji(refreshEmojiObj);
    } else {
        refreshBtn.setEmoji("🔄");
    }

    thAndRefreshButtons.push(refreshBtn);

    // Split buttons into rows with maximum 5 buttons each
    for (let i = 0; i < thAndRefreshButtons.length; i += 5) {
        const row = new ActionRowBuilder().addComponents(thAndRefreshButtons.slice(i, i + 5));
        rows.push(row);
    }

    // Pagination row (ONLY added when totalPages > 1, max 5 rows in Discord message)
    if (totalPages > 1 && rows.length < 5) {
        const pagRow = new ActionRowBuilder();

        // Previous button using leftarrow / larrow from emoji.js
        const lArrowObj = resolveEmojiObj('leftarrow') || resolveEmojiObj('larrow');
        const prevBtn = new ButtonBuilder()
            .setCustomId(`rot_prev_${interactionId}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0);

        if (lArrowObj) {
            prevBtn.setEmoji(lArrowObj);
        } else {
            prevBtn.setEmoji("◀️");
        }

        const pageIndicator = new ButtonBuilder()
            .setCustomId(`rot_page_info_${interactionId}`)
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

        // Next button using arrow / rarrow from emoji.js
        const rArrowObj = resolveEmojiObj('arrow') || resolveEmojiObj('rarrow');
        const nextBtn = new ButtonBuilder()
            .setCustomId(`rot_next_${interactionId}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === totalPages - 1);

        if (rArrowObj) {
            nextBtn.setEmoji(rArrowObj);
        } else {
            nextBtn.setEmoji("▶️");
        }

        pagRow.addComponents(prevBtn, pageIndicator, nextBtn);
        rows.push(pagRow);
    }

    return rows;
}

module.exports = {
    name: "clan-rotation",
    description: "Display current recruitment rotation status for all FWA clans",
    data: new SlashCommandBuilder()
        .setName("clan-rotation")
        .setDescription("Display current recruitment rotation status for all FWA clans")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, context) {
        const { emoji: emojiUtils, coc, data: dataMgr } = context;

        // Permission check
        if (!checkPermission('clan-rotation', interaction) && !checkPermission('assignclan', interaction)) {
            return interaction.reply({
                content: "❌ You do not have permission to view clan rotations.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const clanRoles = dataMgr ? dataMgr.getClanRoles() : dataManager.getClanRoles();
        const fwaTags = Object.keys(clanRoles).filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'fwa');

        // Pre-fetch clan names in background if CoC client is present
        if (coc && typeof coc.getClan === 'function') {
            for (const tag of fwaTags) {
                if (!clanNameCache.has(tag)) {
                    coc.getClan(tag).then(clan => {
                        if (clan && clan.name) {
                            clanNameCache.set(tag, clan.name);
                        }
                    }).catch(() => {});
                }
            }
        }

        const rulesData = dataMgr && typeof dataMgr.getClanRules === 'function' ? dataMgr.getClanRules() : dataManager.getClanRules();
        let recruitmentsData = clanRecruitments.getRecruitmentData();
        let trackedTHs = clanRecruitments.getTrackedRotationTHs(recruitmentsData);

        let currentPage = 0;
        let publicPages = buildPublicPages(clanRoles, recruitmentsData, trackedTHs, emojiUtils, rulesData);
        let currentEmbed = buildPublicRotationEmbed(publicPages[currentPage], currentPage, publicPages.length);
        let componentRows = buildComponents(trackedTHs, null, interaction.id, currentPage, publicPages.length, emojiUtils);

        // Public embed in channel
        const response = await interaction.reply({
            embeds: [currentEmbed],
            components: componentRows
        });

        // 15-minute collector for viewing private TH breakdowns, refreshing, and pagination
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 15 * 60 * 1000
        });

        collector.on('collect', async (btnInteraction) => {
            const customId = btnInteraction.customId;

            // 1. Click on Town Hall button -> SHOW PRIVATE (EPHEMERAL) BREAKDOWN
            if (customId.startsWith(`rot_th_`)) {
                const parts = customId.split('_');
                const selectedTh = parts[2];
                const freshRec = clanRecruitments.getRecruitmentData();
                const thPages = buildPages(clanRoles, freshRec, selectedTh, emojiUtils, rulesData);
                const thEmbed = buildRotationEmbed(thPages[0], selectedTh, 0, thPages.length);

                return btnInteraction.reply({
                    embeds: [thEmbed],
                    flags: [MessageFlags.Ephemeral]
                }).catch(() => {});
            }

            // 2. Pagination Previous
            if (customId === `rot_prev_${interaction.id}`) {
                if (currentPage > 0) {
                    currentPage--;
                }
            }
            // 3. Pagination Next
            else if (customId === `rot_next_${interaction.id}`) {
                if (currentPage < publicPages.length - 1) {
                    currentPage++;
                }
            }
            // 4. Refresh button (rot_refresh_)
            recruitmentsData = clanRecruitments.getRecruitmentData();
            trackedTHs = clanRecruitments.getTrackedRotationTHs(recruitmentsData);
            publicPages = buildPublicPages(clanRoles, recruitmentsData, trackedTHs, emojiUtils, rulesData);
            if (currentPage >= publicPages.length) {
                currentPage = Math.max(0, publicPages.length - 1);
            }

            currentEmbed = buildPublicRotationEmbed(publicPages[currentPage], currentPage, publicPages.length);
            componentRows = buildComponents(trackedTHs, null, interaction.id, currentPage, publicPages.length, emojiUtils);

            await btnInteraction.update({
                embeds: [currentEmbed],
                components: componentRows
            }).catch(() => {});
        });

        collector.on('end', async () => {
            componentRows.forEach(row => {
                row.components.forEach(c => c.setDisabled(true));
            });
            await interaction.editReply({
                components: componentRows
            }).catch(() => {});
        });
    },

    buildPublicPages,
    buildPublicRotationEmbed,
    buildPages,
    buildRotationEmbed,
    buildComponents
};
