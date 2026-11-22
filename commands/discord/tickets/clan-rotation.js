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
 * Shows rotation statuses: (waiting), (next in the list), (on cooldown) / (just received).
 */
function buildPublicPages(clanRoles, recruitmentsData, trackedTHs, emojiUtils = null, rulesData = null, maxChars = MAX_PAGE_CHARS) {
    const fwaClanTags = Object.keys(clanRoles).filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'fwa');

    // Precalculate status per tracked TH across all FWA clans:
    // - Clans that already received a player in current rotation: on cooldown (most recent is just received)
    // - First waiting clan in list order: next in the list
    // - Other clans: waiting
    const thMeta = {};
    for (const th of trackedTHs) {
        const receivedTags = new Set();
        let justReceivedTag = null;
        let latestTimestamp = -1;

        for (const tag of fwaClanTags) {
            const clanRec = recruitmentsData[tag];
            const rotObj = clanRec?.presentRotation?.[th];
            const players = rotObj?.players || [];
            if (players.length > 0) {
                receivedTags.add(tag);
                const lastPlayer = players[players.length - 1];
                const time = new Date(lastPlayer.dateTime).getTime();
                if (time > latestTimestamp) {
                    latestTimestamp = time;
                    justReceivedTag = tag;
                }
            }
        }

        let nextInListTag = null;
        for (const tag of fwaClanTags) {
            if (!receivedTags.has(tag)) {
                nextInListTag = tag;
                break;
            }
        }

        thMeta[th] = { receivedTags, justReceivedTag, nextInListTag };
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
        const lines = [`${idx + 1}. ${badgeEmoji} **${clanName}** - \`${tag}\``];

        for (const th of trackedTHs) {
            const cleanNum = th.toLowerCase().replace(/^th/, '');
            const thEmoji = resolveThEmojiString(cleanNum, emojiUtils);
            const rotObj = clanRec?.presentRotation?.[th];
            const players = rotObj?.players || [];
            const meta = thMeta[th];

            if (players.length > 0) {
                const lastPlayer = players[players.length - 1];
                const dateStr = formatAssignmentDateStr(lastPlayer.dateTime);
                const statusLabel = tag === meta.justReceivedTag ? "(just received)" : "(on cooldown)";
                lines.push(`${thEmoji} - ${statusLabel} **${lastPlayer.playerName}** \`${lastPlayer.playerTag}\` date: ${dateStr}`);
            } else {
                const statusLabel = tag === meta.nextInListTag ? "(next in the list)" : "(waiting)";
                lines.push(`${thEmoji} - ${statusLabel}`);
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
        .setTitle("FWA CLAN ROTATIONS")
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
 * Buttons use persistent, stateless IDs so they never expire.
 */
function buildComponents(trackedTHs, arg2 = 0, arg3 = 1, arg4 = null) {
    let currentPage = 0;
    let totalPages = 1;
    let emojiUtils = null;

    if (typeof arg2 === 'number') {
        currentPage = arg2;
        totalPages = typeof arg3 === 'number' ? arg3 : 1;
        emojiUtils = arg4;
    } else {
        currentPage = typeof arguments[3] === 'number' ? arguments[3] : 0;
        totalPages = typeof arguments[4] === 'number' ? arguments[4] : 1;
        emojiUtils = arguments[5] || null;
    }

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

    // TH buttons (strictly emojis from emoji.js, NO text names! Stateless persistent customId)
    for (const th of trackedTHs) {
        const clean = th.toLowerCase().replace(/^th/, '');
        const thEmojiObj = resolveThEmojiObj(clean);

        const thBtn = new ButtonBuilder()
            .setCustomId(`rot_th_${th}`)
            .setStyle(ButtonStyle.Secondary);

        if (thEmojiObj) {
            thBtn.setEmoji(thEmojiObj);
        } else {
            thBtn.setEmoji("🏰");
        }

        thAndRefreshButtons.push(thBtn);
    }

    // Refresh button using refresh emoji from emoji.js (stateless persistent customId)
    const refreshEmojiObj = resolveEmojiObj('refresh');

    const refreshBtn = new ButtonBuilder()
        .setCustomId("rot_refresh")
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
            .setCustomId(`rot_prev_${Math.max(0, currentPage - 1)}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0);

        if (lArrowObj) {
            prevBtn.setEmoji(lArrowObj);
        } else {
            prevBtn.setEmoji("◀️");
        }

        const pageIndicator = new ButtonBuilder()
            .setCustomId("rot_page_info")
            .setLabel(`${currentPage + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

        // Next button using arrow / rarrow from emoji.js
        const rArrowObj = resolveEmojiObj('arrow') || resolveEmojiObj('rarrow');
        const nextBtn = new ButtonBuilder()
            .setCustomId(`rot_next_${Math.min(totalPages - 1, currentPage + 1)}`)
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

/**
 * Build persistent action row for private ephemeral TH rotation pagination
 * Buttons never expire and are handled globally via utils/handler.js
 */
function buildEphemeralComponents(selectedTh, currentPage = 0, totalPages = 1, emojiUtils = null) {
    if (totalPages <= 1) return [];

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
        if (rawEmojis[key]) {
            return { id: rawEmojis[key], name: key, animated: false };
        }
        return null;
    };

    const pagRow = new ActionRowBuilder();
    const lArrowObj = resolveEmojiObj('leftarrow') || resolveEmojiObj('larrow');
    const prevBtn = new ButtonBuilder()
        .setCustomId(`rot_ephem_prev_${selectedTh}_${Math.max(0, currentPage - 1)}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0);

    if (lArrowObj) {
        prevBtn.setEmoji(lArrowObj);
    } else {
        prevBtn.setEmoji("◀️");
    }

    const pageIndicator = new ButtonBuilder()
        .setCustomId(`rot_ephem_info_${selectedTh}`)
        .setLabel(`${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    const rArrowObj = resolveEmojiObj('arrow') || resolveEmojiObj('rarrow');
    const nextBtn = new ButtonBuilder()
        .setCustomId(`rot_ephem_next_${selectedTh}_${Math.min(totalPages - 1, currentPage + 1)}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages - 1);

    if (rArrowObj) {
        nextBtn.setEmoji(rArrowObj);
    } else {
        nextBtn.setEmoji("▶️");
    }

    pagRow.addComponents(prevBtn, pageIndicator, nextBtn);
    return [pagRow];
}

module.exports = {
    name: "clan-rotation",
    description: "Display current recruitment rotation status for all FWA clans",
    data: new SlashCommandBuilder()
        .setName("clan-rotation")
        .setDescription("Display current recruitment rotation status for all FWA clans")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Optional: Select an FWA clan to view its rotation and recruitments")
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = (interaction.options.getFocused() || "").toLowerCase().trim();
        const clanRoles = dataManager.getClanRoles();
        const fwaTags = Object.keys(clanRoles).filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'fwa');

        const choices = [];
        for (const tag of fwaTags) {
            const nickname = clanRoles[tag].nickName || "";
            const realName = clanNameCache.get(tag) || clanRoles[tag].name || nickname || tag;
            const displayName = nickname ? `${realName} (${nickname}) [${tag}]` : `${realName} [${tag}]`;
            choices.push({
                name: displayName.substring(0, 100),
                value: tag
            });
        }

        const filtered = choices.filter(choice =>
            choice.name.toLowerCase().includes(focusedValue) ||
            choice.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(filtered).catch(() => {});
    },

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

        // Check if user selected a specific clan
        const selectedClanRaw = interaction.options.getString("clan");
        if (selectedClanRaw) {
            let selectedTag = selectedClanRaw.trim().toUpperCase();
            if (!selectedTag.startsWith("#")) {
                const matchTag = fwaTags.find(t =>
                    t.toUpperCase() === selectedTag ||
                    t.toUpperCase() === "#" + selectedTag ||
                    (clanRoles[t].nickName && clanRoles[t].nickName.toUpperCase() === selectedTag)
                );
                if (matchTag) {
                    selectedTag = matchTag;
                } else {
                    selectedTag = "#" + selectedTag;
                }
            }

            if (!clanRoles[selectedTag]) {
                return interaction.reply({
                    content: `❌ Could not find an active FWA clan with tag or nickname "${selectedClanRaw}".`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const config = clanRoles[selectedTag] || {};
            const nick = config.nickName || "";
            const badgeEmoji = getClanBadge(nick, emojiUtils);
            const clanName = clanNameCache.get(selectedTag) || rulesData?.clans?.[selectedTag]?.name || config.name || nick || selectedTag;
            const clanRec = recruitmentsData[selectedTag] || {};

            // Current rotation counts
            const currentRotLines = [];
            for (const th of trackedTHs) {
                const cleanNum = th.toLowerCase().replace(/^th/, '');
                const thEmoji = resolveThEmojiString(cleanNum, emojiUtils);
                const rotObj = clanRec?.presentRotation?.[th];
                const count = rotObj?.count ?? (rotObj?.players?.length || 0);
                currentRotLines.push(`${thEmoji} ${th} - ${count}`);
            }

            // Recruited from Blood Alliance lifetime counts
            const recruitmentLines = [];
            const lifetimeMap = clanRec?.recruitments || {};
            const thKeys = Array.from(new Set([...trackedTHs, 'TH19', 'TH18', 'TH17', 'TH16', 'TH15', 'TH14', ...Object.keys(lifetimeMap).filter(k => k.startsWith('TH'))]));
            thKeys.sort((a, b) => {
                const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
                const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
                return numB - numA;
            });

            let totalPlayersSent = 0;
            for (const th of thKeys) {
                const cleanNum = th.toLowerCase().replace(/^th/, '');
                const thEmoji = resolveThEmojiString(cleanNum, emojiUtils);
                const count = typeof lifetimeMap[th] === 'number' ? lifetimeMap[th] : 0;
                totalPlayersSent += count;
                recruitmentLines.push(`${thEmoji} ${th} : ${count}`);
            }

            const singleClanEmbed = new EmbedBuilder()
                .setTitle("FWA CLAN ROTATIONS")
                .setColor(0x3498DB)
                .setDescription(
                    `${badgeEmoji} **${clanName}** - \`${selectedTag}\`\n\n` +
                    `**Current Rotation :**\n` +
                    currentRotLines.join('\n') +
                    `\n\n` +
                    `**Recruited From Blood Alliance :**\n` +
                    recruitmentLines.join('\n') +
                    `\n\n` +
                    `**Total Players Sent :** **${totalPlayersSent}**`
                )
                .setFooter({ text: "FWA Clan Recruitment Tracking" })
                .setTimestamp();

            return interaction.reply({
                embeds: [singleClanEmbed]
            });
        }

        let currentPage = 0;
        let publicPages = buildPublicPages(clanRoles, recruitmentsData, trackedTHs, emojiUtils, rulesData);
        let currentEmbed = buildPublicRotationEmbed(publicPages[currentPage], currentPage, publicPages.length);
        let componentRows = buildComponents(trackedTHs, currentPage, publicPages.length, emojiUtils);

        // Public embed in channel
        await interaction.reply({
            embeds: [currentEmbed],
            components: componentRows
        });

        // Register message for real-time automatic updates
        try {
            const replyMsg = await interaction.fetchReply();
            if (replyMsg) {
                clanRecruitments.saveActiveRotationMessage({
                    channelId: interaction.channelId,
                    messageId: replyMsg.id,
                    guildId: interaction.guildId
                });
            }
        } catch (_) {}
    },

    /**
     * Stateless persistent button handler called by utils/handler.js
     * Buttons never expire and will work even after bot restarts.
     */
    async handleRotationButton(interaction, context) {
        const customId = interaction.customId;
        const { emoji: emojiUtils, data: dataMgr } = context || {};
        const clanRoles = dataMgr ? dataMgr.getClanRoles() : dataManager.getClanRoles();
        const rulesData = dataMgr && typeof dataMgr.getClanRules === 'function' ? dataMgr.getClanRules() : dataManager.getClanRules();

        // 1. Town Hall button clicked -> Show private (ephemeral) breakdown for that TH
        if (customId.startsWith("rot_th_")) {
            const selectedTh = customId.replace("rot_th_", "").toUpperCase();
            const freshRec = clanRecruitments.getRecruitmentData();
            const thPages = buildPages(clanRoles, freshRec, selectedTh, emojiUtils, rulesData);
            const thEmbed = buildRotationEmbed(thPages[0], selectedTh, 0, thPages.length);
            const compRows = buildEphemeralComponents(selectedTh, 0, thPages.length, emojiUtils);

            const replyPayload = {
                embeds: [thEmbed],
                flags: [MessageFlags.Ephemeral]
            };
            if (compRows.length > 0) {
                replyPayload.components = compRows;
            }

            return interaction.reply(replyPayload).catch(() => {});
        }

        // Ephemeral private pagination Previous / Next
        if (customId.startsWith("rot_ephem_prev_") || customId.startsWith("rot_ephem_next_")) {
            const parts = customId.split("_");
            const selectedTh = parts[3];
            const targetPage = parseInt(parts[4], 10) || 0;
            const freshRec = clanRecruitments.getRecruitmentData();
            const thPages = buildPages(clanRoles, freshRec, selectedTh, emojiUtils, rulesData);
            const safePage = Math.max(0, Math.min(targetPage, thPages.length - 1));
            const thEmbed = buildRotationEmbed(thPages[safePage], selectedTh, safePage, thPages.length);
            const compRows = buildEphemeralComponents(selectedTh, safePage, thPages.length, emojiUtils);

            return interaction.update({
                embeds: [thEmbed],
                components: compRows
            }).catch(() => {});
        }

        if (customId.startsWith("rot_ephem_info_")) {
            return interaction.deferUpdate().catch(() => {});
        }

        // 2. Refresh button clicked -> Update the public message with latest data
        if (customId === "rot_refresh") {
            const freshRec = clanRecruitments.getRecruitmentData();
            const trackedTHs = clanRecruitments.getTrackedRotationTHs(freshRec);
            const publicPages = buildPublicPages(clanRoles, freshRec, trackedTHs, emojiUtils, rulesData);
            const currentPage = 0;
            const currentEmbed = buildPublicRotationEmbed(publicPages[currentPage], currentPage, publicPages.length);
            const componentRows = buildComponents(trackedTHs, currentPage, publicPages.length, emojiUtils);

            // Re-register / touch this active rotation message
            try {
                if (interaction.message && interaction.message.id) {
                    clanRecruitments.saveActiveRotationMessage({
                        channelId: interaction.channelId,
                        messageId: interaction.message.id,
                        guildId: interaction.guildId
                    });
                }
            } catch (_) {}

            return interaction.update({
                embeds: [currentEmbed],
                components: componentRows
            }).catch(() => {});
        }

        // 3. Pagination Previous / Next
        if (customId.startsWith("rot_prev_") || customId.startsWith("rot_next_")) {
            const targetPage = parseInt(customId.split("_")[2], 10) || 0;
            const freshRec = clanRecruitments.getRecruitmentData();
            const trackedTHs = clanRecruitments.getTrackedRotationTHs(freshRec);
            const publicPages = buildPublicPages(clanRoles, freshRec, trackedTHs, emojiUtils, rulesData);
            const safePage = Math.max(0, Math.min(targetPage, publicPages.length - 1));
            const currentEmbed = buildPublicRotationEmbed(publicPages[safePage], safePage, publicPages.length);
            const componentRows = buildComponents(trackedTHs, safePage, publicPages.length, emojiUtils);

            return interaction.update({
                embeds: [currentEmbed],
                components: componentRows
            }).catch(() => {});
        }

        if (customId === "rot_page_info") {
            return interaction.deferUpdate().catch(() => {});
        }
    },

    buildPublicPages,
    buildPublicRotationEmbed,
    buildPages,
    buildRotationEmbed,
    buildComponents,
    buildEphemeralComponents
};
