const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getEmoji } = require('../../../utils/emoji');
const ticketDataStore = require('../../../utils/ticketDataStore');

// In-memory cache for clan names to speed up autocomplete
const clanNameCache = new Map();

const DEFAULT_CLAN_RULES = [
    "Be active daily and participate in wars and CWL.",
    "Always use both war attacks — missing attacks may lead to demotion.",
    "Donate correct troops only as requested.",
    "Respect all members — teamwork builds victory.",
    "No rushed bases allowed in main clan — use feeder clans if needed.",
    "Maintain a healthy competitive spirit, no toxicity."
];

/**
 * Safely load clan rules configuration from dataManager or filesystem
 */
function loadClanRules(dataManager) {
    if (dataManager && typeof dataManager.getClanRules === 'function') {
        try {
            const rules = dataManager.getClanRules();
            if (rules && typeof rules === 'object') return rules;
        } catch (err) {
            console.error('[AssignClan] Error loading rules via dataManager:', err.message);
        }
    }

    const possiblePaths = [
        path.join(__dirname, '../../../data/clanrules.json'),
        path.join(__dirname, '../../../clanrules.json'),
        path.resolve(process.cwd(), 'data/clanrules.json'),
        path.resolve(process.cwd(), 'clanrules.json')
    ];

    for (const filePath of possiblePaths) {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                if (raw && raw.trim()) {
                    return JSON.parse(raw);
                }
            }
        } catch (err) {
            console.error(`[AssignClan] Error loading rules from ${filePath}:`, err.message);
        }
    }

    return {
        default: {
            title: '{clanName} Rules',
            rules: DEFAULT_CLAN_RULES,
            color: '#E74C3C'
        },
        clans: {}
    };
}

/**
 * Resolve clan rules configuration for a specific clan, falling back to default
 */
function resolveClanRulesConfig(allRules, clanTag, clanData, clanConfig) {
    const defaultFallback = {
        title: '{clanName} Rules',
        rules: DEFAULT_CLAN_RULES,
        image: '',
        thumbnail: '',
        footerText: '',
        footerIcon: '',
        color: '#E74C3C'
    };

    if (!allRules || typeof allRules !== 'object') {
        return defaultFallback;
    }

    const tagWithHash = (clanTag || clanData?.tag || '').toUpperCase();
    const cleanTag = tagWithHash.replace(/^#/, '');
    const nick = (clanConfig?.nickName || '').toUpperCase();

    const defaultConf = allRules.default || (Array.isArray(allRules.rules) ? allRules : null);
    const clansMap = (allRules.clans && typeof allRules.clans === 'object') ? allRules.clans : allRules;

    let specificConf = null;
    if (tagWithHash && clansMap[tagWithHash]) {
        specificConf = clansMap[tagWithHash];
    } else if (cleanTag && clansMap[cleanTag]) {
        specificConf = clansMap[cleanTag];
    } else if (nick && clansMap[nick]) {
        specificConf = clansMap[nick];
    } else if (tagWithHash && clansMap['#' + cleanTag]) {
        specificConf = clansMap['#' + cleanTag];
    }

    let rules = (specificConf && Array.isArray(specificConf.rules) && specificConf.rules.length > 0)
        ? specificConf.rules
        : (defaultConf && Array.isArray(defaultConf.rules) && defaultConf.rules.length > 0 ? defaultConf.rules : DEFAULT_CLAN_RULES);

    if (!Array.isArray(rules) || rules.length === 0) {
        rules = DEFAULT_CLAN_RULES;
    }

    const imageBanner = (specificConf && (specificConf.image || specificConf.banner || specificConf.footerImage))
        || (defaultConf && (defaultConf.image || defaultConf.banner || defaultConf.footerImage))
        || '';

    const thumbnail = (specificConf && specificConf.thumbnail)
        || (defaultConf && defaultConf.thumbnail)
        || '';

    const title = (specificConf && specificConf.title)
        || (defaultConf && defaultConf.title)
        || '{clanName} Rules';

    const color = (specificConf && specificConf.color)
        || (defaultConf && defaultConf.color)
        || '#E74C3C';

    const rawFooterText = (specificConf && ((typeof specificConf.footer === 'string' ? specificConf.footer : specificConf.footer?.text) || specificConf.footerText))
        || (defaultConf && ((typeof defaultConf.footer === 'string' ? defaultConf.footer : defaultConf.footer?.text) || defaultConf.footerText))
        || '';

    const footerIcon = (specificConf && ((typeof specificConf.footer === 'object' ? (specificConf.footer?.iconURL || specificConf.footer?.icon_url) : null) || specificConf.footerIcon))
        || (defaultConf && ((typeof defaultConf.footer === 'object' ? (defaultConf.footer?.iconURL || defaultConf.footer?.icon_url) : null) || defaultConf.footerIcon))
        || '';

    return {
        title,
        rules,
        image: imageBanner,
        thumbnail,
        footerText: rawFooterText,
        footerIcon,
        color
    };
}

/**
 * Build the Clan Rules Embed using rules from clanrules.json
 * and the blackdot emoji from emoji.js as bullet point.
 * Accurately determines rules and image for the specific clan being assigned.
 */
function buildClanRulesEmbed(clanTagOrClanData, clanDataOrContext, maybeClanConfig, maybeContext) {
    try {
        let clanTag = null;
        let clanData = null;
        let clanConfig = null;
        let context = null;

        if (typeof clanTagOrClanData === 'string') {
            clanTag = clanTagOrClanData;
            clanData = clanDataOrContext;
            clanConfig = maybeClanConfig;
            context = maybeContext;
        } else {
            clanData = clanTagOrClanData;
            context = clanDataOrContext;
            clanTag = clanData?.tag;
            clanConfig = maybeClanConfig;
        }

        const rawRulesData = loadClanRules(context?.data);
        const rulesData = resolveClanRulesConfig(rawRulesData, clanTag, clanData, clanConfig);

        // Automatically ensure official clan name is synced to clanrules.json
        if (rawRulesData && rawRulesData.clans && clanTag && clanData?.name) {
            const tagWithHash = (clanTag.startsWith('#') ? clanTag : '#' + clanTag).toUpperCase();
            const targetEntry = rawRulesData.clans[tagWithHash];
            if (targetEntry && targetEntry.name !== clanData.name) {
                targetEntry.name = clanData.name;
                try {
                    if (context?.data && typeof context.data.saveClanRules === 'function') {
                        context.data.saveClanRules(rawRulesData);
                    }
                } catch (_) {}
            }
        }

        const effectiveRules = (rulesData && Array.isArray(rulesData.rules) && rulesData.rules.length > 0)
            ? rulesData.rules
            : DEFAULT_CLAN_RULES;

        // Retrieve blackdot emoji using existing emoji utils / import
        const emojiUtils = context?.emoji;
        let blackdot = emojiUtils ? emojiUtils.getEmoji('blackdot') : '';
        if (!blackdot) {
            blackdot = getEmoji('blackdot') || '•';
        }

        // Title format: {Clanname} Rules or customized title template
        const clanName = clanData?.name || 'Clan';
        let rawTitle = rulesData?.title || '{clanName} Rules';
        let title = rawTitle.replace(/\{clan(name)?\}/gi, clanName);
        if (title.trim().toLowerCase() === 'clan rules') {
            title = `${clanName} Rules`;
        }
        if (title.length > 256) {
            title = title.slice(0, 253) + '...';
        }

        let validRules = effectiveRules
            .filter(r => typeof r === 'string' && r.trim().length > 0)
            .map(r => `${blackdot} ${r.trim()}`);

        if (validRules.length === 0) {
            validRules = DEFAULT_CLAN_RULES.map(r => `${blackdot} ${r}`);
        }

        let description = validRules.join('\n\n');
        if (description.length > 4096) {
            description = validRules.join('\n');
            if (description.length > 4096) {
                description = description.slice(0, 4093) + '...';
            }
        }

        let embedColor = 0xE74C3C;
        if (rulesData?.color) {
            if (typeof rulesData.color === 'number') {
                embedColor = rulesData.color;
            } else if (typeof rulesData.color === 'string') {
                const cleaned = rulesData.color.startsWith('#') ? rulesData.color : `#${rulesData.color}`;
                if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
                    embedColor = cleaned;
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor);

        // Picture / bottom image: only show if a picture is added (e.g. from clanrules.json or dashboard)
        const pictureUrl = rulesData?.image || rulesData?.banner || rulesData?.bannerUrl;
        if (pictureUrl && typeof pictureUrl === 'string' && pictureUrl.trim().startsWith('http')) {
            embed.setImage(pictureUrl.trim());
        }

        // Footer support: allows website dashboard to set footer text and/or icon
        const rawFooterText = rulesData?.footerText;
        const footerIcon = rulesData?.footerIcon;

        if (rawFooterText || footerIcon) {
            const footerText = (rawFooterText || `${clanName} Rules`).replace(/\{clan(name)?\}/gi, clanName);
            embed.setFooter({
                text: footerText.slice(0, 2048),
                iconURL: (footerIcon && typeof footerIcon === 'string' && footerIcon.trim().startsWith('http')) ? footerIcon.trim() : undefined
            });
        }

        return embed;
    } catch (err) {
        console.error('[AssignClan] Error building clan rules embed:', err);
        return null;
    }
}

/**
 * Build the public clan announcement embed matching ;clan <nickname> layout
 * while strictly excluding clan leaders and co-leaders.
 */
function buildPublicClanEmbed(clanTag, clanType, clanData, context) {
    const emojiUtils = context.emoji;
    const getEmoji = (name) => emojiUtils.getEmoji(name);

    if (clanType === 'war') {
        const totalWars = clanData.warWins + (clanData.warLosses || 0);
        const winRatio = totalWars > 0 ? (clanData.warWins / totalWars).toFixed(2) : "0.00";
        const link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clanData.tag.replace("#", "");
        const locationStr = clanData.location && clanData.location.name ? "🌐 " + clanData.location.name : "N/A";

        const joinTypeMap = {
            open: getEmoji("gtick") + " Anyone Can Join",
            inviteOnly: getEmoji("question") + " Invite Only",
            closed: getEmoji("bluex") + " Closed"
        };
        const joinType = joinTypeMap[clanData.type] || clanData.type || "Unknown";

        const familyFriendly = clanData.isFamilyFriendly === true
            ? getEmoji("heart") + " Yes"
            : getEmoji("bluex") + " No";

        const embed = new EmbedBuilder()
            .setTitle(clanData.name)
            .setThumbnail(clanData.badgeUrls ? clanData.badgeUrls.medium : null)
            .setColor(0xE74C3C)
            .setDescription(
                "Tag: [" + clanData.tag + "](" + link + ")\n" +
                "Trophies: " + getEmoji("throphy") + " " + clanData.clanPoints + " | " + getEmoji("clancastle") + " " + (clanData.clanCapitalPoints || 0) + "\n" +
                "Required Trophies: " + getEmoji("throphy") + " " + clanData.requiredTrophies + "\n" +
                "Location: " + locationStr + "\n\n" +
                "Level: " + clanData.clanLevel + "\n" +
                "Members: " + getEmoji("mem") + " " + clanData.members + "/50\n" +
                "Join Type: " + joinType + "\n" +
                "Family Friendly: " + familyFriendly + "\n\n" +
                "CWL: " + (clanData.warLeague ? clanData.warLeague.name : "N/A") + "\n" +
                "Wars Won: " + getEmoji("uparrow") + " " + clanData.warWins + "\n" +
                "Wars Lost: " + getEmoji("downarrow") + " " + (clanData.warLosses || 0) + "\n" +
                "War Streak: " + getEmoji("graph") + " " + clanData.warWinStreak + "\n" +
                "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
                "Description: " + (clanData.description || "No description provided.")
            )
            .setTimestamp();
        return embed;
    } else {
        const tagNoHash = clanTag.replace("#", "");
        const tagWithHash = encodeURIComponent("#" + tagNoHash);

        const diamondEmoji = getEmoji("whitefwa");
        const leaderEmoji = getEmoji("fwalead");
        const th18Emoji = getEmoji("th18");
        const th17Emoji = getEmoji("th17");
        const th16Emoji = getEmoji("th16");
        const th15Emoji = getEmoji("th15");
        const th14Emoji = getEmoji("th14");
        const capitalEmoji = getEmoji("ccw");
        const castleEmoji = getEmoji("clancastle");
        const leagueEmoji = getEmoji("cwl");
        const arrowEmoji = getEmoji("arrow");
        const clashEmoji = getEmoji("coc");
        const memEmoji = getEmoji("mem");

        const joinTypeMap = {
            open: getEmoji("gtick") + " Anyone Can Join",
            inviteOnly: getEmoji("question") + " Invite Only",
            closed: getEmoji("bluex") + " Closed"
        };
        const joinType = joinTypeMap[clanData.type] || clanData.type || "Unknown";

        const familyFriendly = clanData.isFamilyFriendly === true
            ? getEmoji("heart") + " Yes"
            : getEmoji("bluex") + " No";

        let description =
            diamondEmoji + " **FWA** " + diamondEmoji + "\n" +
            leaderEmoji + " **Accepting:** " + th18Emoji + " " + th17Emoji + " " + th16Emoji + " " + th15Emoji + " " + th14Emoji + "\n" +
            capitalEmoji + " **Clan Capital:** " + (clanData.clanCapital ? clanData.clanCapital.capitalHallLevel : "?") + "\n" +
            castleEmoji + " **Clan Level:** " + clanData.clanLevel + "\n" +
            leagueEmoji + " **CWL:** Lazy Cwl\n" +
            memEmoji + " **Members:** " + clanData.members + "/50\n" +
            getEmoji("cyandot") + " **Join Type:** " + joinType + "\n" +
            getEmoji("pinkdot") + " **Family Friendly:** " + familyFriendly + "\n\n" +
            arrowEmoji + " **Open in Game:** [Click Here](https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + tagNoHash + ")\n" +
            clashEmoji + " **Clash of Stats:** [Click Here](https://www.clashofstats.com/clans/" + tagNoHash + ")\n" +
            arrowEmoji + " **CC Link:** [Click Here](https://cc.fwafarm.com/cc_n/clan.php?tag=" + tagWithHash + ")\n";

        if (description.length > 4096) {
            description = description.slice(0, 4093) + "...";
        }

        return new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(clanData.name + " (" + clanTag + ")")
            .setThumbnail(clanData.badgeUrls ? clanData.badgeUrls.large : null)
            .setDescription(description);
    }
}

/**
 * Locate active ticket channel for user
 */
function findUserTicketChannel(guild, userId, config) {
    if (!guild || !userId) return null;
    const categoryId = config.TICKET_CATEGORY_ID;

    // Check by topic (stores user.id)
    let channel = guild.channels.cache.find(c =>
        c.parentId === categoryId && c.topic === userId
    );

    // Fallback: check channel name containing username / id
    if (!channel) {
        channel = guild.channels.cache.find(c =>
            c.parentId === categoryId && (
                c.name.toLowerCase().endsWith(userId.toLowerCase())
            )
        );
    }

    return channel || null;
}

module.exports = {
    name: "assignclan",
    description: "Assign a clan to an active ticket application",
    data: new SlashCommandBuilder()
        .setName("assignclan")
        .setDescription("Assign a clan to an active ticket application")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option.setName("user")
                .setDescription("Select the ticket owner whose active ticket needs a clan assignment")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Select a clan to assign")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager, coc, config } = context;
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const targetUserId = interaction.options.getUser("user")?.id || interaction.options.get("user")?.value;

        const clanRoles = dataManager.getClanRoles();
        const tags = Object.keys(clanRoles);

        // Pre-fetch clan names in background for cache
        for (const tag of tags) {
            if (!clanNameCache.has(tag)) {
                clanNameCache.set(tag, clanRoles[tag].nickName || tag);
                coc.getClan(tag).then(clan => {
                    if (clan && clan.name) {
                        clanNameCache.set(tag, clan.name);
                    }
                }).catch(() => { });
            }
        }

        // Determine ticket category from current channel or selected user
        let filterCategory = null; // 'fwa' | 'war' | null

        if (interaction.channel && interaction.channel.parentId === config.TICKET_CATEGORY_ID) {
            let resolved = ticketDataStore.resolveCategory(interaction.channel.name);
            if (!resolved) {
                const rec = ticketDataStore.findByChannelId(interaction.channel.id);
                if (rec && rec.category) resolved = rec.category;
            }
            if (resolved === 'fwa') filterCategory = 'fwa';
            else if (resolved === 'warEntry') filterCategory = 'war';
        }

        if (!filterCategory && targetUserId && interaction.guild) {
            const ticketChannel = findUserTicketChannel(interaction.guild, targetUserId, config);
            if (ticketChannel) {
                let resolved = ticketDataStore.resolveCategory(ticketChannel.name);
                if (!resolved) {
                    const rec = ticketDataStore.findByChannelId(ticketChannel.id);
                    if (rec && rec.category) resolved = rec.category;
                }
                if (resolved === 'fwa') filterCategory = 'fwa';
                else if (resolved === 'warEntry') filterCategory = 'war';
            }
        }

        let filteredTags = tags;
        if (filterCategory === 'fwa') {
            filteredTags = tags.filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() !== 'war');
        } else if (filterCategory === 'war') {
            filteredTags = tags.filter(tag => (clanRoles[tag].clanType || 'fwa').toLowerCase() === 'war');
        }

        const choices = [];
        for (const tag of filteredTags) {
            const realName = clanNameCache.get(tag) || clanRoles[tag].nickName || tag;
            const nickname = clanRoles[tag].nickName;
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

        await interaction.respond(filtered).catch(() => { });
    },

    async execute(interaction, context) {
        const { data: dataManager, coc, emoji: emojiUtils, config, client } = context;
        const { member, guild, channel } = interaction;
        const CATEGORY_ID = config.TICKET_CATEGORY_ID;

        // 1. Channel Location Validation - Must only be used inside a ticket channel
        if (!channel || !channel.parentId || channel.parentId !== CATEGORY_ID) {
            return interaction.reply({
                content: "❌ This command can only be used inside a ticket channel.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 2. Permission Validation - Only all staff roles can use
        const ALL_STAFF_ROLE_IDS = (config.ALL_STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
        const STAFF_ROLE_IDS = (config.STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
        const fallbackAllStaff = ["1466103376642314445", "1511650426343133274"];
        const fallbackStaff = ["1513940638909988874", "1513942017196167389", "1154276716982833154"];

        const allStaffRoles = [
            ...(ALL_STAFF_ROLE_IDS.length > 0 ? ALL_STAFF_ROLE_IDS : fallbackAllStaff),
            ...(STAFF_ROLE_IDS.length > 0 ? STAFF_ROLE_IDS : fallbackStaff),
            ...(config.ADMIN_ROLE_IDS || []).map(id => id.trim()).filter(Boolean),
            config.TRAINEE_ROLE_ID,
            config.WEL_EXE_STAFF_ID,
            config.CWL_STAFF_ROLE_ID,
            '1514535148119392377',
            '1514536928412827758'
        ].filter(Boolean);

        const hasStaffId = allStaffRoles.some(id => member.roles.cache.has(id));
        const hasStaffName = member.roles.cache.values
            ? Array.from(member.roles.cache.values()).some(r => r.name && r.name.toLowerCase().includes("staff"))
            : false;
        const isStaff = hasStaffId || hasStaffName;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild);

        if (!isAdmin && !isStaff) {
            return interaction.reply({
                content: "❌ Only Staff can use this command.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const targetUser = interaction.options.getUser("user", true);
        const clanInput = interaction.options.getString("clan", true).trim().toUpperCase();

        // 3. Ensure the selected user matches the owner of this ticket channel
        if (channel.topic && channel.topic !== targetUser.id) {
            return interaction.reply({
                content: `❌ The selected user does not match the owner of this ticket (<@${channel.topic}>).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const ticketChannel = channel;

        // 4. Validate Ticket Category
        let ticketCategory = ticketDataStore.resolveCategory(ticketChannel.name);
        if (!ticketCategory) {
            const rec = ticketDataStore.findByChannelId(ticketChannel.id);
            if (rec && rec.category) {
                ticketCategory = rec.category;
            }
        }
        if (!ticketCategory || (ticketCategory !== 'fwa' && ticketCategory !== 'warEntry')) {
            return interaction.reply({
                content: `❌ Active ticket channel ${ticketChannel} is not an FWA Entry or War Entry ticket.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 5. Validate Clan from Database
        const clanRoles = dataManager.getClanRoles();
        let clanTag = clanInput.startsWith('#') ? clanInput : '#' + clanInput;
        let clanConfig = clanRoles[clanTag];

        if (!clanConfig) {
            // Check by nickname
            for (const [tag, info] of Object.entries(clanRoles)) {
                if (info.nickName && info.nickName.toUpperCase() === clanInput) {
                    clanTag = tag;
                    clanConfig = info;
                    break;
                }
            }
        }

        if (!clanConfig) {
            return interaction.reply({
                content: `❌ Clan "${clanInput}" was not found in registered clans.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 6. Validate Category Match
        const clanType = (clanConfig.clanType || 'fwa').toLowerCase();
        const expectedType = ticketCategory === 'warEntry' ? 'war' : 'fwa';
        if (clanType !== expectedType) {
            const label = expectedType === 'war' ? 'War' : 'FWA';
            return interaction.reply({
                content: `❌ Category mismatch: This ticket is for ${label} Entry, but the selected clan is not a ${label} clan.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 7. Validate Player Information
        let playerTag = null;
        const ticketRecord = ticketDataStore.findByChannelId(ticketChannel.id);
        if (ticketRecord && ticketRecord.record && ticketRecord.record.appliedTag) {
            playerTag = ticketRecord.record.appliedTag;
        } else {
            const userData = dataManager.getUserData();
            const accounts = userData[targetUser.id];
            if (accounts && accounts.length > 0 && accounts[0].tag) {
                playerTag = accounts[0].tag;
            }
        }

        if (!playerTag) {
            return interaction.reply({
                content: `❌ No applied or linked Clash of Clans player account found for <@${targetUser.id}>.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 8. Fetch live Player and Clan data from CoC API
        let player;
        try {
            player = await coc.getPlayer(playerTag);
        } catch (err) {
            return interaction.reply({
                content: `❌ Could not fetch player data for tag \`${playerTag}\`: ${err.message || "Unknown error"}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        let clanData;
        try {
            clanData = await coc.getClan(clanTag);
        } catch (err) {
            return interaction.reply({
                content: `❌ Could not fetch clan data for \`${clanTag}\`: ${err.message || "Unknown error"}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 9. Build Ephemeral Confirmation Embed
        const thEmoji = emojiUtils.getEmoji(`th${player.townHallLevel}`) || "🏰";
        const dot = emojiUtils.getEmoji("cyandot") || "•";
        const playerCocLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(player.tag)}`;
        const playerCcLink = `https://cc.fwafarm.com/cc_n/member.php?tag=${encodeURIComponent(player.tag)}`;
        const clanCocLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clanData.tag.replace('#', '')}`;

        const confirmationEmbed = new EmbedBuilder()
            .setTitle("Clan Assignment Confirmation")
            .setColor(0x3498DB)
            .setDescription(
                `Please confirm that you are assigning this player to **${clanData.name}**.\n\n` +
                `${thEmoji} [${player.name}](${playerCocLink}) ${dot} [${player.tag}](${playerCcLink})\n` +
                `**Assigned Clan:** [${clanData.name}](${clanCocLink})`
            )
            .setTimestamp();

        const confirmButtonId = `confirm_assign_${interaction.id}`;
        const cancelButtonId = `cancel_assign_${interaction.id}`;

        const confirmBtn = new ButtonBuilder()
            .setCustomId(confirmButtonId)
            .setLabel("Confirm Assignment")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅");

        const cancelBtn = new ButtonBuilder()
            .setCustomId(cancelButtonId)
            .setLabel("Cancel Assignment")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌");

        const actionRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        const response = await interaction.reply({
            content: `<@${interaction.user.id}>`,
            embeds: [confirmationEmbed],
            components: [actionRow],
            flags: [MessageFlags.Ephemeral]
        });

        // 10. Confirmation Collector with 60s timeout
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        let isActionCompleted = false;

        collector.on('collect', async (btnInteraction) => {
            // Only command executor can use buttons
            if (btnInteraction.user.id !== interaction.user.id) {
                return btnInteraction.reply({
                    content: `❌ Only <@${interaction.user.id}> who executed the command can confirm or cancel this assignment.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (isActionCompleted) {
                return btnInteraction.reply({
                    content: "❌ This assignment action has already been processed.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (btnInteraction.customId === cancelButtonId) {
                isActionCompleted = true;
                collector.stop('cancelled');

                confirmBtn.setDisabled(true);
                cancelBtn.setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                const cancelledEmbed = EmbedBuilder.from(confirmationEmbed)
                    .setColor(0x95A5A6)
                    .setDescription("Clan assignment cancelled.");

                return await btnInteraction.update({
                    content: `<@${interaction.user.id}>`,
                    embeds: [cancelledEmbed],
                    components: [disabledRow]
                });
            }

            if (btnInteraction.customId === confirmButtonId) {
                isActionCompleted = true;
                collector.stop('confirmed');

                // Step A: Save assignment persistently
                const saved = ticketDataStore.setAssignedClan(
                    ticketChannel.id,
                    clanTag,
                    clanData.name,
                    interaction.user.id,
                    ticketCategory,
                    targetUser.id,
                    {
                        playerName: player.name,
                        playerTh: player.townHallLevel,
                        appliedTag: player.tag
                    }
                );

                if (!saved) {
                    confirmBtn.setDisabled(true);
                    cancelBtn.setDisabled(true);
                    const disabledRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                    const errorEmbed = EmbedBuilder.from(confirmationEmbed)
                        .setColor(0xE74C3C)
                        .setDescription("❌ Failed to save clan assignment to database. Public announcement was aborted.");

                    return await btnInteraction.update({
                        content: `<@${interaction.user.id}>`,
                        embeds: [errorEmbed],
                        components: [disabledRow]
                    });
                }

                // Step B: Add configured clan leader role permissions
                let leaderRoleAdded = false;
                let leaderRoleError = null;
                const leaderRoleId = clanConfig.leaderRoleId;

                if (leaderRoleId) {
                    const leaderRole = guild.roles.cache.get(leaderRoleId) || await guild.roles.fetch(leaderRoleId).catch(() => null);
                    if (leaderRole) {
                        try {
                            await ticketChannel.permissionOverwrites.edit(leaderRoleId, {
                                ViewChannel: true,
                                SendMessages: true,
                                ReadMessageHistory: true,
                                AttachFiles: true
                            }, { reason: `Assigned clan leader role access for ${clanData.name}` });
                            leaderRoleAdded = true;
                        } catch (err) {
                            console.error('[AssignClan] Leader role permission update failed:', err);
                            leaderRoleError = `Failed to grant permissions to clan leader role (<@&${leaderRoleId}>): ${err.message}`;
                        }
                    } else {
                        leaderRoleError = `Configured clan leader role ID \`${leaderRoleId}\` not found in this server.`;
                    }
                } else {
                    leaderRoleError = `No clan leader role configured for clan ${clanTag}.`;
                }

                // Step C: Send public assignment announcement inside ticket channel
                let announcementSent = false;
                let announcementError = null;

                try {
                    const publicClanEmbed = buildPublicClanEmbed(clanTag, clanType, clanData, context);
                    const clanRulesEmbed = buildClanRulesEmbed(clanTag, clanData, clanConfig, context);

                    const embedsToSend = [publicClanEmbed];
                    if (clanRulesEmbed) {
                        embedsToSend.push(clanRulesEmbed);
                    }

                    try {
                        await ticketChannel.send({
                            content: `<@${targetUser.id}>`,
                            embeds: embedsToSend
                        });
                    } catch (sendErr) {
                        // Fallback: If sending with rules embed failed, attempt sending public embed alone
                        if (embedsToSend.length > 1) {
                            console.warn('[AssignClan] Failed sending with rules embed, retrying with public embed only:', sendErr.message);
                            await ticketChannel.send({
                                content: `<@${targetUser.id}>`,
                                embeds: [publicClanEmbed]
                            });
                        } else {
                            throw sendErr;
                        }
                    }
                    announcementSent = true;
                } catch (err) {
                    console.error('[AssignClan] Public announcement send failed:', err);
                    announcementError = `Failed to send public announcement in ticket channel: ${err.message}`;
                }

                // Step D: Update ephemeral confirmation message (no separate ephemeral success message!)
                confirmBtn.setDisabled(true);
                cancelBtn.setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                const statusNotes = [];
                if (leaderRoleAdded) {
                    statusNotes.push(`✅ Leader role access granted (<@&${leaderRoleId}>).`);
                } else if (leaderRoleError) {
                    statusNotes.push(`⚠️ ${leaderRoleError}`);
                }

                if (!announcementSent && announcementError) {
                    statusNotes.push(`⚠️ ${announcementError}`);
                }

                const updatedDescription =
                    `✅ **Clan assignment confirmed.**\n\n` +
                    `${thEmoji} [${player.name}](${playerCocLink}) ${dot} [${player.tag}](${playerCcLink})\n` +
                    `**Assigned Clan:** [${clanData.name}](${clanCocLink})\n\n` +
                    statusNotes.join('\n');

                const confirmedEmbed = EmbedBuilder.from(confirmationEmbed)
                    .setColor(leaderRoleError || announcementError ? 0xE67E22 : 0x2ECC71)
                    .setDescription(updatedDescription);

                return await btnInteraction.update({
                    content: `<@${interaction.user.id}>`,
                    embeds: [confirmedEmbed],
                    components: [disabledRow]
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (!isActionCompleted) {
                isActionCompleted = true;
                confirmBtn.setDisabled(true);
                cancelBtn.setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                const expiredEmbed = EmbedBuilder.from(confirmationEmbed)
                    .setColor(0xE67E22)
                    .setDescription(
                        `⏰ **Confirmation expired.**\n\n` +
                        `The 60-second confirmation window has elapsed and the clan assignment was not completed.`
                    );

                await interaction.editReply({
                    content: `<@${interaction.user.id}>`,
                    embeds: [expiredEmbed],
                    components: [disabledRow]
                }).catch(() => { });
            }
        });
    },

    buildClanRulesEmbed,
    loadClanRules,
    resolveClanRulesConfig,
    DEFAULT_CLAN_RULES
};

