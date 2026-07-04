const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const dataManager = require('../../../utils/dataManager.js');

/**
 * Build the war roster embeds for a clan's current war.
 * Splits members into linked vs unlinked, grouped by role (like /clancc).
 * Also stores the war snapshot into scanwar.json.
 *
 * @param {string} clanTag
 * @param {object} coc
 * @param {object} dataManager
 * @param {object} emoji
 * @returns {object|null} { embeds, warFound }
 */
async function buildScanClanEmbeds(clanTag, coc, dataManager, emoji) {
    const clanRoles = dataManager.getClanRoles();
    const roleInfo = clanRoles[clanTag] || {};
    const clan = {
        name: roleInfo.nickName || clanTag,
        badgeUrls: {}
    };

    // 2. Get the latest war snapshot from scanwar.json
    const scanData = dataManager.getScanWar();
    const wars = scanData[clanTag] || [];
    const latestWar = wars[0];

    // 3. If no war exists in JSON, return no war embed
    if (!latestWar) {
        return { embeds: [noWarEmbed(clan, emoji)], warFound: false };
    }

    // Fetch live clan data for roles
    let liveRoles = {};
    try {
        const liveClan = await coc.getClan(clanTag);
        if (liveClan && liveClan.memberList) {
            for (const m of liveClan.memberList) {
                liveRoles[m.tag] = m.role || "member";
            }
        }
    } catch (e) {
        console.error(`[scan-clan] Could not fetch live roles for ${clanTag}: ${e.message}`);
    }

    // Get linked tags from userdata
    const userData = dataManager.getUserData();
    const linkedTags = new Set();
    for (const userId in userData) {
        const accounts = userData[userId];
        for (const acc of accounts) {
            linkedTags.add(acc.tag);
        }
    }

    // Build roster lines
    const roleWeights = { "leader": 1, "coLeader": 2, "admin": 3, "member": 4 };
    const members = (latestWar.members || []).map(m => ({
        tag: m.tag || "",
        name: m.name || "Unknown",
        townhallLevel: m.townhallLevel || m.townHallLevel || 0,
        mapPosition: m.mapPosition || 0,
        role: liveRoles[m.tag || ""] || "member"
    })).sort((a, b) => {
        const wA = roleWeights[a.role] || 4;
        const wB = roleWeights[b.role] || 4;
        if (wA !== wB) return wA - wB;
        return a.mapPosition - b.mapPosition;
    });

    const linkedMembers = members.filter(m => linkedTags.has(m.tag));
    const unlinkedMembers = members.filter(m => !linkedTags.has(m.tag));

    const roleOrder = ["leader", "coLeader", "admin", "member"];
    const roleNames = {
        "leader": `${emoji.getEmoji("crown") || "👑"} Leaders`,
        "coLeader": `${emoji.getEmoji("sheild") || "🛡️"} Co-Leaders`,
        "admin": `${emoji.getEmoji("bluestar") || "⚔️"} Elders`,
        "member": `${emoji.getEmoji("mem") || "🔰"} Members`
    };

    const linkedEmoji = emoji.getEmoji("gtick") || "✅";
    const unlinkedEmoji = emoji.getEmoji("bluex") || "❌";

    function buildLinesByRole(membersArray, isLinked) {
        const lines = [];
        const emojiToUse = isLinked ? linkedEmoji : unlinkedEmoji;
        let sno = 1;

        for (const role of roleOrder) {
            const roleMembers = membersArray.filter(m => m.role === role);
            if (roleMembers.length > 0) {
                lines.push(`\n**${roleNames[role]}**`);
                for (const m of roleMembers) {
                    const cleanName = (m.name || "Unknown").replace(/`/g, "'");
                    const thEmoji = emoji.getEmoji("th" + m.townhallLevel) || `TH${m.townhallLevel}`;
                    const tagUrl = (m.tag || "").replace("#", "");
                    lines.push(`${emojiToUse} \`${String(sno).padStart(2, ' ')}.\` ${thEmoji} **${cleanName}** \`#${tagUrl}\``);
                    sno++;
                }
            }
        }
        return lines;
    }

    const linkedLines = buildLinesByRole(linkedMembers, true);
    const unlinkedLines = buildLinesByRole(unlinkedMembers, false);

    // Build embeds with chunking (same pattern as /clancc)
    const allEmbeds = [];
    const titleColor = Math.floor(Math.random() * 0xFFFFFF);

    const opponentName = latestWar.opponentName || "Unknown";
    const opponentTag = latestWar.opponentTag || "";
    
    // Determine war state from endTime
    let date;
    const endTime = latestWar.endTime || "";
    if (/^\d{8}T\d{6}/.test(endTime)) {
        const formatted = endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
        date = new Date(formatted);
    } else {
        date = new Date(endTime);
    }

    let warState = "War Ended";
    if (!isNaN(date.getTime())) {
        const hoursRemaining = (date.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursRemaining > 0) {
            if (hoursRemaining > 24) {
                warState = "Preparation";
            } else {
                warState = "In War";
            }
        }
    }

    // Header text for the war info
    const warHeader = `⚔️ **War vs ${opponentName}** (\`${opponentTag}\`)\n${emoji.getEmoji("graph") || "📊"} **State:** ${warState} | **Size:** ${latestWar.teamSize}v${latestWar.teamSize}\n\n`;

    // Linked embeds
    const linkedChunks = [];
    let currentChunk = warHeader + `**War Roster — Linked Members (${linkedMembers.length})**\n`;
    if (linkedLines.length === 0) currentChunk += "No linked players in this war.\n";
    for (const line of linkedLines) {
        if (currentChunk.length + line.length + 1 > 2500) {
            linkedChunks.push(currentChunk);
            currentChunk = line + "\n";
        } else {
            currentChunk += line + "\n";
        }
    }
    if (currentChunk.trim()) linkedChunks.push(currentChunk);


    const badgeUrl = clan.badgeUrls?.large || clan.badgeUrls?.medium;
    for (let i = 0; i < linkedChunks.length; i++) {
        const titleSuffix = linkedChunks.length > 1 ? ` (Part ${i + 1}/${linkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`${clan.name} — War Roster (Linked)${titleSuffix}`)
            .setColor(titleColor)
            .setDescription(linkedChunks[i])
            .setFooter({ text: "FWA War Scanner" })
            .setTimestamp();
        if (i === 0 && badgeUrl) {
            embed.setThumbnail(badgeUrl);
        }
        allEmbeds.push(embed);
    }

    // Unlinked embeds
    const unlinkedChunks = [];
    let currentUnlinked = `**Non-Linked Players (${unlinkedMembers.length})**\n`;
    if (unlinkedLines.length === 0) currentUnlinked += "No unlinked players in this war.\n";
    for (const line of unlinkedLines) {
        if (currentUnlinked.length + line.length + 1 > 2500) {
            unlinkedChunks.push(currentUnlinked);
            currentUnlinked = line + "\n";
        } else {
            currentUnlinked += line + "\n";
        }
    }
    if (currentUnlinked.trim()) unlinkedChunks.push(currentUnlinked);

    for (let i = 0; i < unlinkedChunks.length; i++) {
        const titleSuffix = unlinkedChunks.length > 1 ? ` (Part ${i + 1}/${unlinkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`Non-Linked Players${titleSuffix}`)
            .setColor(0xE74C3C)
            .setDescription(unlinkedChunks[i])
            .setFooter({ text: "FWA War Scanner" })
            .setTimestamp();
        allEmbeds.push(embed);
    }

    // Comparison Logic
    const pastWar = wars[1];
    const comparisonEmbed = buildComparisonEmbed(latestWar, pastWar, liveRoles, emoji);
    if (comparisonEmbed) allEmbeds.push(comparisonEmbed);

    return { embeds: allEmbeds, warFound: true };
}

function buildComparisonEmbed(currentWar, pastWar, liveRoles, emoji) {
    if (!pastWar) {
        return new EmbedBuilder()
            .setTitle("Roster Comparison (vs Previous War)")
            .setColor(0x3498DB)
            .setDescription("Sorry chief, I don't have data of past war.")
            .setFooter({ text: "FWA War Scanner" })
            .setTimestamp();
    }
    if (!currentWar) return null;

    const currentTags = new Set((currentWar.members || []).map(m => m.tag));
    const pastTags = new Set((pastWar.members || []).map(m => m.tag));

    const roleWeights = { "leader": 1, "coLeader": 2, "admin": 3, "member": 4 };

    // Joined: In current, but not in past
    const joined = (currentWar.members || []).filter(m => !pastTags.has(m.tag)).map(m => ({
        tag: m.tag,
        name: m.name || "Unknown",
        role: liveRoles[m.tag] || "member"
    })).sort((a, b) => (roleWeights[a.role] || 4) - (roleWeights[b.role] || 4));

    // Left: In past, but not in current
    const left = (pastWar.members || []).filter(m => !currentTags.has(m.tag)).map(m => ({
        tag: m.tag,
        name: m.name || "Unknown",
        role: liveRoles[m.tag] || "member"
    })).sort((a, b) => (roleWeights[a.role] || 4) - (roleWeights[b.role] || 4));

    if (joined.length === 0 && left.length === 0) return null;

    const embed = new EmbedBuilder()
        .setTitle("Roster Comparison (vs Previous War)")
        .setColor(0x3498DB)
        .setFooter({ text: "FWA War Scanner" })
        .setTimestamp();

    const roleNames = {
        "leader": `${emoji.getEmoji("crown") || "👑"} Leaders`,
        "coLeader": `${emoji.getEmoji("sheild") || "🛡️"} Co-Leaders`,
        "admin": `${emoji.getEmoji("bluestar") || "⚔️"} Elders`,
        "member": `${emoji.getEmoji("mem") || "🔰"} Members`
    };

    let joinedText = "";
    if (joined.length > 0) {
        let lastRole = "";
        for (const m of joined) {
            if (m.role !== lastRole) {
                joinedText += `\n**${roleNames[m.role]}**\n`;
                lastRole = m.role;
            }
            joinedText += `+ **${m.name}** \`#${m.tag.replace("#", "")}\`\n`;
        }
    } else {
        joinedText = "No new members joined.";
    }
    const greenDot = emoji.getEmoji("greendot") || "🟢";
    embed.addFields({ name: `${greenDot} Joined this War`, value: joinedText.trim().substring(0, 1024), inline: false });

    let leftText = "";
    if (left.length > 0) {
        let lastRole = "";
        for (const m of left) {
            if (m.role !== lastRole) {
                leftText += `\n**${roleNames[m.role]}**\n`;
                lastRole = m.role;
            }
            leftText += `- **${m.name}** \`#${m.tag.replace("#", "")}\`\n`;
        }
    } else {
        leftText = "No members left.";
    }
    const redDot = emoji.getEmoji("reddot") || "🔴";
    embed.addFields({ name: `${redDot} Left this War`, value: leftText.trim().substring(0, 1024), inline: false });

    return embed;
}

/**
 * Build embeds from a stored war snapshot (for "Last Wars" feature)
 */
async function buildStoredWarEmbeds(clanTag, clanName, clanBadgeUrl, storedWar, pastWar, liveClan, dataManagerRef, emoji) {
    const userData = dataManagerRef.getUserData();
    const linkedTags = new Set();
    for (const userId in userData) {
        const accounts = userData[userId];
        for (const acc of accounts) {
            linkedTags.add(acc.tag);
        }
    }

    let liveRoles = {};
    if (liveClan && liveClan.memberList) {
        for (const m of liveClan.memberList) {
            liveRoles[m.tag] = m.role || "member";
        }
    }

    const roleWeights = { "leader": 1, "coLeader": 2, "admin": 3, "member": 4 };
    const members = (storedWar.members || []).map(m => ({
        tag: m.tag || "",
        name: m.name || "Unknown",
        townhallLevel: m.townhallLevel || m.townHallLevel || 0,
        mapPosition: m.mapPosition || 0,
        role: liveRoles[m.tag || ""] || "member"
    })).sort((a, b) => {
        const wA = roleWeights[a.role] || 4;
        const wB = roleWeights[b.role] || 4;
        if (wA !== wB) return wA - wB;
        return a.mapPosition - b.mapPosition;
    });
    const linkedMembers = members.filter(m => linkedTags.has(m.tag));
    const unlinkedMembers = members.filter(m => !linkedTags.has(m.tag));

    const linkedEmoji = emoji.getEmoji("gtick") || "✅";
    const unlinkedEmoji = emoji.getEmoji("bluex") || "❌";

    function buildLinesByRole(membersArray, isLinked) {
        const lines = [];
        const emojiToUse = isLinked ? linkedEmoji : unlinkedEmoji;
        let sno = 1;

        const roleOrder = ["leader", "coLeader", "admin", "member"];
        const roleNames = {
            "leader": `${emoji.getEmoji("crown") || "👑"} Leaders`,
            "coLeader": `${emoji.getEmoji("sheild") || "🛡️"} Co-Leaders`,
            "admin": `${emoji.getEmoji("bluestar") || "⚔️"} Elders`,
            "member": `${emoji.getEmoji("mem") || "🔰"} Members`
        };

        for (const role of roleOrder) {
            const roleMembers = membersArray.filter(m => m.role === role);
            if (roleMembers.length > 0) {
                lines.push(`\n**${roleNames[role]}**`);
                for (const m of roleMembers) {
                    const cleanName = (m.name || "Unknown").replace(/`/g, "'");
                    const thEmoji = emoji.getEmoji("th" + m.townhallLevel) || `TH${m.townhallLevel}`;
                    const tagUrl = (m.tag || "").replace("#", "");
                    lines.push(`${emojiToUse} \`${String(sno).padStart(2, ' ')}.\` ${thEmoji} **${cleanName}** \`#${tagUrl}\``);
                    sno++;
                }
            }
        }
        return lines;
    }

    const linkedLines = buildLinesByRole(linkedMembers, true);
    const unlinkedLines = buildLinesByRole(unlinkedMembers, false);

    const allEmbeds = [];
    const titleColor = Math.floor(Math.random() * 0xFFFFFF);

    const timeAgo = getTimeAgo(storedWar.endTime);
    const warHeader = `⚔️ **War vs ${storedWar.opponentName}** (\`${storedWar.opponentTag}\`)\n${emoji.getEmoji("graph") || "📊"} **Ended:** ${timeAgo} | **Size:** ${storedWar.teamSize}v${storedWar.teamSize}\n\n`;

    // Linked embeds
    const linkedChunks = [];
    let currentChunk = warHeader + `**War Roster — Linked Members (${linkedMembers.length})**\n`;
    if (linkedLines.length === 0) currentChunk += "No linked players in this war.\n";
    for (const line of linkedLines) {
        if (currentChunk.length + line.length + 1 > 2500) {
            linkedChunks.push(currentChunk);
            currentChunk = line + "\n";
        } else {
            currentChunk += line + "\n";
        }
    }
    if (currentChunk.trim()) linkedChunks.push(currentChunk);

    for (let i = 0; i < linkedChunks.length; i++) {
        const titleSuffix = linkedChunks.length > 1 ? ` (Part ${i + 1}/${linkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`${clanName} — Past War Roster (Linked)${titleSuffix}`)
            .setColor(titleColor)
            .setDescription(linkedChunks[i])
            .setFooter({ text: "FWA War Scanner — Historical" })
            .setTimestamp();
        if (i === 0 && clanBadgeUrl) {
            embed.setThumbnail(clanBadgeUrl);
        }
        allEmbeds.push(embed);
    }

    // Unlinked embeds
    const unlinkedChunks = [];
    let currentUnlinked = `**Non-Linked Players (${unlinkedMembers.length})**\n`;
    if (unlinkedLines.length === 0) currentUnlinked += "No unlinked players in this war.\n";
    for (const line of unlinkedLines) {
        if (currentUnlinked.length + line.length + 1 > 2500) {
            unlinkedChunks.push(currentUnlinked);
            currentUnlinked = line + "\n";
        } else {
            currentUnlinked += line + "\n";
        }
    }
    if (currentUnlinked.trim()) unlinkedChunks.push(currentUnlinked);

    for (let i = 0; i < unlinkedChunks.length; i++) {
        const titleSuffix = unlinkedChunks.length > 1 ? ` (Part ${i + 1}/${unlinkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`Non-Linked Players${titleSuffix}`)
            .setColor(0xE74C3C)
            .setDescription(unlinkedChunks[i])
            .setFooter({ text: "FWA War Scanner — Historical" })
            .setTimestamp();
        allEmbeds.push(embed);
    }

    // Comparison Logic for stored wars
    const comparisonEmbed = buildComparisonEmbed(storedWar, pastWar, liveRoles, emoji);
    if (comparisonEmbed) allEmbeds.push(comparisonEmbed);

    return { embeds: allEmbeds };
}

/**
 * Store a war snapshot into scanwar.json, keeping max 10 per clan
 */
function storeWarSnapshot(clanTag, war, warMembers) {
    try {
        const scanData = dataManager.getScanWar();
        if (!scanData[clanTag]) scanData[clanTag] = [];

        const endTime = war.endTime || war.startTime || new Date().toISOString();

        // Check for duplicate (same opponent + same endTime)
        const isDuplicate = scanData[clanTag].some(
            w => w.opponentTag === (war.opponent?.tag || "") && w.endTime === endTime
        );
        if (isDuplicate) return false;

        const snapshot = {
            opponentName: war.opponent ? war.opponent.name : "Unknown",
            opponentTag: war.opponent ? war.opponent.tag : "",
            endTime: endTime,
            teamSize: war.teamSize || 0,
            members: warMembers.map(m => ({
                tag: m.tag,
                name: m.name,
                townhallLevel: m.townhallLevel || m.townHallLevel || 0,
                mapPosition: m.mapPosition || 0
            }))
        };

        scanData[clanTag].unshift(snapshot); // newest first

        // Filter out any wars older than 7 days
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        scanData[clanTag] = scanData[clanTag].filter(w => {
            if (!w.endTime) return false;
            let date;
            const endTimeStr = String(w.endTime);
            if (/^\d{8}T\d{6}/.test(endTimeStr)) {
                const formatted = endTimeStr.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
                date = new Date(formatted);
            } else {
                date = new Date(endTimeStr);
            }
            return !isNaN(date.getTime()) && date.getTime() >= sevenDaysAgo;
        });

        // Still enforce the max 10 limit just in case
        if (scanData[clanTag].length > 10) {
            scanData[clanTag] = scanData[clanTag].slice(0, 10);
        }

        dataManager.saveScanWar(scanData);
        return true;
    } catch (err) {
        console.error("Error storing war snapshot:", err.message);
        return false;
    }
}

/**
 * Get a member's role from the clan data
 */
function getMemberRole(playerTag, clanData) {
    if (!clanData || !clanData.memberList || !playerTag) return "member";
    const member = clanData.memberList.find(m => m.tag === playerTag);
    return member ? member.role : "member";
}

/**
 * Build a "no war" embed
 */
function noWarEmbed(clan, emoji) {
    const embed = new EmbedBuilder()
        .setTitle(`${clan.name} — War Status`)
        .setColor(0xFF0000)
        .setDescription(`${emoji.getEmoji("bluex") || "❌"} This clan is **not currently in a war**.`)
        .setFooter({ text: "FWA War Scanner" })
        .setTimestamp();
    const badgeUrl = clan.badgeUrls?.large || clan.badgeUrls?.medium;
    if (badgeUrl) {
        embed.setThumbnail(badgeUrl);
    }
    return embed;
}

/**
 * Send embeds in batches to avoid Discord's 6000-character-per-message limit.
 */
async function sendBatchedEmbeds(interaction, embeds, components = []) {
    const MAX_TOTAL_CHARS = 5800;
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;

    for (const embed of embeds) {
        let embedSize = 0;
        if (embed.data.title) embedSize += embed.data.title.length;
        if (embed.data.description) embedSize += embed.data.description.length;
        if (embed.data.footer && embed.data.footer.text) embedSize += embed.data.footer.text.length;
        if (embed.data.author && embed.data.author.name) embedSize += embed.data.author.name.length;
        if (embed.data.fields) {
            for (const f of embed.data.fields) {
                if (f.name) embedSize += f.name.length;
                if (f.value) embedSize += f.value.length;
            }
        }

        if (currentLength + embedSize > MAX_TOTAL_CHARS || currentBatch.length >= 10) {
            if (currentBatch.length > 0) batches.push(currentBatch);
            currentBatch = [embed];
            currentLength = embedSize;
        } else {
            currentBatch.push(embed);
            currentLength += embedSize;
        }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    for (let i = 0; i < batches.length; i++) {
        const batchComponents = (i === batches.length - 1) ? components : [];
        if (i === 0) {
            await interaction.editReply({ embeds: batches[i], components: batchComponents }).catch(e => console.error("EDITREPLY ERROR:", e));
        } else {
            await interaction.followUp({ embeds: batches[i], components: batchComponents }).catch(e => console.error("FOLLOWUP ERROR:", e));
        }
    }
}

/**
 * Format a CoC API timestamp to a "time ago" string
 */
function getTimeAgo(endTime) {
    if (!endTime) return "Unknown";
    let date;
    // CoC format: 20260621T120000.000Z
    if (/^\d{8}T\d{6}/.test(endTime)) {
        const formatted = endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
        date = new Date(formatted);
    } else {
        date = new Date(endTime);
    }

    if (isNaN(date.getTime())) return "Unknown";

    const diff = Date.now() - date.getTime();
    if (diff < 0) return "Ongoing";

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
    return "Just now";
}

module.exports = {
    name: "scan-clan",
    data: new SlashCommandBuilder()
        .setName('scan-clan')
        .setDescription('Scan war roster for an FWA clan — linked vs unlinked members')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('Select a clan tag or nickname')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const clanRoles = dataManager.getClanRoles();

        const choices = [];
        for (const [tag, data] of Object.entries(clanRoles)) {
            if (data.clanType === "war") continue; // Only FWA clans
            const label = data.nickName ? `${data.nickName} (${tag})` : tag;
            choices.push({ name: label, value: tag });
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { coc, emoji, data: dm } = context;

        const query = interaction.options.getString('clantag');
        if (!query) return interaction.reply({ content: "❌ Please provide a clan tag.", ephemeral: true });

        await interaction.deferReply().catch(() => {});

        const loadingEmoji = emoji.getEmoji("alaram") || "⏳";
        const loadingColor = Math.floor(Math.random() * 16777215);
        const loadingEmbed = new EmbedBuilder()
            .setColor(loadingColor)
            .setDescription(`${loadingEmoji} Scanning war roster...`);
        await interaction.editReply({ embeds: [loadingEmbed] }).catch(() => null);

        // Resolve tag by nickname or raw input
        let clanTag = null;
        const arg = query.toUpperCase();
        const clanRoles = dm.getClanRoles();
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.nickName && info.nickName.toUpperCase() === arg) {
                clanTag = tag;
                break;
            }
        }
        if (!clanTag) {
            clanTag = arg.startsWith("#") ? arg : "#" + arg;
        }

        let result;
        try {
            result = await buildScanClanEmbeds(clanTag, coc, dm, emoji);
        } catch (err) {
            console.error("Error in buildScanClanEmbeds:", err);
            const errEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription(`❌ An error occurred: \`${err.message}\``);
            return await interaction.editReply({ embeds: [errEmbed] }).catch(async (e) => {
                await interaction.channel.send(`❌ editReply failed inside catch: \`${e.message}\``).catch(() => {});
            });
        }

        if (!result) {
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Could not fetch clan data for \`${query}\`.`);
            return await interaction.editReply({ embeds: [errEmbed] }).catch(() => {});
        }

        // Build buttons
        const cleanTag = clanTag.replace("#", "");
        const refreshEmoji = emoji.getEmojiObject("refresh") || "🔄";

        const refreshBtn = new ButtonBuilder()
            .setCustomId(`scanclan_refresh_${cleanTag}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji(refreshEmoji);

        const lastWarsBtn = new ButtonBuilder()
            .setCustomId(`scanclan_lastwars_${cleanTag}`)
            .setLabel("Last Wars")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📜");

        const btnRow = new ActionRowBuilder().addComponents(refreshBtn, lastWarsBtn);

        await sendBatchedEmbeds(interaction, result.embeds, [btnRow]);
    },

    // Exported for handler.js and sync.js
    buildScanClanEmbeds,
    buildStoredWarEmbeds,
    getTimeAgo,
    storeWarSnapshot,
    sendBatchedEmbeds
};
