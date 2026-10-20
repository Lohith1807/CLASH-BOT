const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");

/**
 * Dispatch war embed for normal war clans.
 * Formats match details with Match Type: War, no FWA fields (no Points Balance, no War ID, no Sync Number).
 */
async function dispatchWarEmbed(client, coc, emojiUtils, clanTag, roleData, clanData, currentWar, apiLogger = null) {
    // Strictly only send for normal war clans, never for FWA clans
    const clanType = (roleData?.clanType || "fwa").toLowerCase();
    if (clanType !== "war") {
        if (apiLogger) await apiLogger(`[WAR MAIL] Skipped ${clanTag}: Clan type is '${clanType}', warmail.js only sends for normal war clans.`);
        return false;
    }

    const opponentTag = currentWar?.opponent?.tag || "N/A";
    let opponentData = null;
    if (opponentTag !== "N/A") {
        try {
            opponentData = await coc.getClan(opponentTag);
        } catch (e) { }
    }

    const opponentName = opponentData?.name || currentWar?.opponent?.name || "Unknown Opponent";

    const getComposition = (members) => {
        if (!members || members.length === 0) return "N/A";
        const counts = {};
        members.forEach(m => {
            const th = m.townhallLevel || m.thLevel;
            if (th) counts[th] = (counts[th] || 0) + 1;
        });
        const sortedTHs = Object.keys(counts).sort((a, b) => b - a);
        if (sortedTHs.length === 0) return "N/A";
        return sortedTHs.map(th => `${emojiUtils.getEmoji('th' + th) || 'TH' + th} \`${counts[th]}\``).join(" ");
    };

    const clanComp = (currentWar && currentWar.clan?.members)
        ? getComposition(currentWar.clan.members)
        : (clanData?.memberList ? getComposition(clanData.memberList) : "N/A");

    const oppComp = (currentWar && currentWar.opponent?.members)
        ? getComposition(currentWar.opponent.members)
        : (opponentData?.memberList ? getComposition(opponentData.memberList) : "N/A");

    const getDiscordTimestamp = (apiTime) => {
        if (!apiTime) return "N/A";
        const formattedDate = apiTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
        const unixTime = Math.floor(new Date(formattedDate).getTime() / 1000);
        return `<t:${unixTime}:R>`;
    };

    const embed = new EmbedBuilder()
        .setTitle(`${clanData.name} vs ${opponentName}`)
        .setColor(0xFFA500)
        .setThumbnail(clanData.badgeUrls?.medium || clanData.badgeUrls?.large || clanData.badgeUrls?.small || null)
        .setDescription(
            `**[${clanData.name}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clanData.tag.replace("#", "")})** (\`${clanData.tag}\`) **VS** **[${opponentName}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${opponentTag.replace("#", "")})** (\`${opponentTag}\`)\n\n` +
            `**Match Type:** War\n` +
            `**Team Size:** ${currentWar?.teamSize ? `${currentWar.teamSize} vs ${currentWar.teamSize}` : "50 vs 50"}\n` +
            (currentWar?.state === "preparation"
                ? `**Starts:** ${getDiscordTimestamp(currentWar?.startTime)}\n\n`
                : `**Ends:** ${getDiscordTimestamp(currentWar?.endTime)}\n\n`) +
            `**${clanData.name} Composition**\n${clanComp}\n\n` +
            `**${opponentName} Composition**\n${oppComp}\n`
        )
        .setFooter({ text: `✧ ${clanData.name} ✧`, iconURL: clanData.badgeUrls?.small || clanData.badgeUrls?.medium || null })
        .setTimestamp();

    const dataManager = require("../../../utils/dataManager.js");
    const warTypeData = dataManager.getWarType();
    warTypeData[clanTag] = {
        wartype: "War",
        result: "N/A"
    };
    dataManager.saveWarType(warTypeData);

    const targetChannelId = roleData.mailChannelId && roleData.mailChannelId.trim() !== "" ? roleData.mailChannelId : roleData.channelId;
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (channel) {
        const ping = roleData.roleId ? `<@&${roleData.roleId}>` : "";
        await channel.send({ content: ping, embeds: [embed] }).catch(() => null);
        return true;
    }
    return false;
}

/**
 * Send war notification for a war clan.
 */
async function sendWarNotification(client, coc, emojiUtils, clanTag, roleData, apiLogger = null) {
    // Strictly only send for normal war clans, never for FWA clans
    const clanType = (roleData?.clanType || "fwa").toLowerCase();
    if (clanType !== "war") {
        if (apiLogger) await apiLogger(`[WAR MAIL] Skipped ${clanTag}: Clan type is '${clanType}', warmail.js only sends for normal war clans.`);
        return false;
    }

    let clanData, currentWar;
    try {
        clanData = await coc.getClan(clanTag);
        if (!clanData) return false;

        try {
            currentWar = await coc.getCurrentWar(clanTag);
        } catch (e) { }

        if (!currentWar || currentWar.state === "notInWar") {
            const targetChannelId = roleData.mailChannelId && roleData.mailChannelId.trim() !== "" ? roleData.mailChannelId : roleData.channelId;
            const channel = await client.channels.fetch(targetChannelId).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(`${clanData.name} War Status`)
                    .setDescription("**NO WAR IS ONGOING**")
                    .setColor(0x808080)
                    .setThumbnail(clanData.badgeUrls?.medium || null)
                    .setFooter({ text: `✧ ${clanData.name} ✧`, iconURL: clanData.badgeUrls?.small || null })
                    .setTimestamp();
                await channel.send({ embeds: [embed] }).catch(() => null);
            }
            return true;
        }

        const success = await dispatchWarEmbed(client, coc, emojiUtils, clanTag, roleData, clanData, currentWar, apiLogger);
        if (success) {
            const STATE_PATH = path.join(__dirname, "../../../data/warState.json");
            const warState = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) : {};
            const warUniqueId = `${currentWar.opponent?.tag || "N/A"}_${currentWar?.preparationStartTime || "N/A"}`;
            warState[clanTag] = warUniqueId;
            fs.writeFileSync(STATE_PATH, JSON.stringify(warState, null, 2));
        }
        return success;
    } catch (error) {
        if (apiLogger) await apiLogger(`Fatal error in warmail.sendWarNotification for ${clanTag}: ${error.message}`);
        return false;
    }
}

/**
 * Auto-monitor war matches for normal war clans.
 */
async function startAutoMonitoring(client, config, emojiUtils) {
    const coc = require("../../../utils/cocManager.js");
    const STATE_PATH = path.join(__dirname, "../../../data/warState.json");
    const CLAN_ROLES_PATH = path.join(__dirname, "../../../data/clanrole.json");
    const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";

    const apiLogger = async (msg) => {
        if (msg) {
            const lower = msg.toLowerCase();
            const isTokenError = lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied");
            const isIgnorable = lower.includes("coc api") || lower.includes("clash api") || lower.includes("fetch") || 
                                lower.includes("timeout") || lower.includes("503") || lower.includes("504") || 
                                lower.includes("502") || lower.includes("500") || lower.includes("network error") || 
                                lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("api_maintenance_pause");
            if (isIgnorable && !isTokenError) return;
        }
        const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
        if (logChannel) await logChannel.send(`\`[WAR MAIL MONITOR]\` ${msg}`).catch(() => null);
    };

    console.log("📡 War monitoring service started via warmail.js");

    setInterval(async () => {
        try {
            if (!fs.existsSync(CLAN_ROLES_PATH)) return;
            const clanRoles = JSON.parse(fs.readFileSync(CLAN_ROLES_PATH, "utf-8"));
            let warState = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) : {};

            for (const [tag, roleData] of Object.entries(clanRoles)) {
                if ((roleData?.clanType || "fwa").toLowerCase() !== "war") continue;

                try {
                    const currentWar = await coc.getCurrentWar(tag);
                    if (!currentWar || currentWar.state === "notInWar") {
                        continue;
                    }

                    const warUniqueId = `${currentWar.opponent?.tag || "N/A"}_${currentWar?.preparationStartTime || "N/A"}`;
                    if (warState[tag] !== warUniqueId) {
                        await apiLogger(`🆕 New war match for ${tag}!`);
                        const success = await sendWarNotification(client, coc, emojiUtils, tag, roleData, apiLogger);
                        if (success) {
                            warState[tag] = warUniqueId;
                            fs.writeFileSync(STATE_PATH, JSON.stringify(warState, null, 2));
                        }
                    }
                } catch (err) { }
            }
        } catch (error) { }
    }, 10 * 60 * 1000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("send-warmails")
        .setDescription("Check the latest war results and send to war clan channels")
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Clan tag (#TAG) or nickname (leave empty to send for all war clans)")
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        try {
            const dataMgr = context?.data || require("../../../utils/dataManager.js");
            const clanRoles = dataMgr.getClanRoles();
            const focusedValue = interaction.options.getFocused().toLowerCase().trim();

            const choices = [];
            for (const [tag, data] of Object.entries(clanRoles)) {
                if ((data?.clanType || "fwa").toLowerCase() === "war") {
                    const label = data.nickName ? `${data.nickName} (${tag})` : tag;
                    choices.push({ name: label, value: tag });
                }
            }

            const filtered = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedValue) ||
                choice.value.toLowerCase().includes(focusedValue)
            );

            await interaction.respond(filtered.slice(0, 25)).catch(() => {});
        } catch (err) {
            await interaction.respond([]).catch(() => {});
        }
    },

    async execute(interaction, context) {
        const { coc, emoji: emojiUtils, client } = context;
        try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        try {
            const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");
            const clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf-8"));
            const clanInput = interaction.options.getString("clan");

            const apiLogger = async (msg) => {
                const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
                const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
                if (logChannel) await logChannel.send(`\`[WAR MAIL LOG]\` ${msg}`).catch(() => null);
            };

            let successCount = 0;
            let failCount = 0;
            const results = [];

            if (clanInput) {
                let targetTag = clanInput.trim().toUpperCase();
                if (!targetTag.startsWith("#")) targetTag = `#${targetTag}`;

                for (const [tag, data] of Object.entries(clanRoles)) {
                    if (data.nickName && data.nickName.toUpperCase() === clanInput.trim().toUpperCase()) {
                        targetTag = tag;
                        break;
                    }
                }

                const roleData = clanRoles[targetTag];
                const clanType = (roleData?.clanType || "fwa").toLowerCase();
                if (!roleData || clanType !== "war") {
                    return interaction.editReply(`❌ Clan **${clanInput}** is an **${clanType.toUpperCase()}** clan. \`/send-warmails\` only sends for normal war clans, not for FWA clans.`);
                }

                const success = await sendWarNotification(client, coc, emojiUtils, targetTag, roleData, apiLogger);
                return interaction.editReply(success ? `✅ War mail sent for **${roleData.nickName || targetTag}** (\`${targetTag}\`).` : `❌ Failed to send war mail for **${targetTag}**.`);
            }

            for (const [tag, roleData] of Object.entries(clanRoles)) {
                if ((roleData?.clanType || "fwa").toLowerCase() !== "war") continue;
                const success = await sendWarNotification(client, coc, emojiUtils, tag, roleData, apiLogger);
                if (success) {
                    successCount++;
                    results.push(`✅ **${roleData.nickName ? `${roleData.nickName} (${tag})` : tag}**: Success`);
                } else {
                    failCount++;
                    results.push(`❌ **${roleData.nickName ? `${roleData.nickName} (${tag})` : tag}**: Failed`);
                }
            }

            if (results.length === 0) {
                return interaction.editReply("⚠️ No normal war clans found in `clanrole.json`.");
            }

            const summaryEmbed = new EmbedBuilder()
                .setTitle("📤 War Clan Mail Distribution")
                .setDescription(results.join("\n"))
                .setColor(failCount === 0 ? 0x00FF00 : 0xFFA500)
                .setTimestamp();

            await interaction.editReply({ embeds: [summaryEmbed] });
        } catch (error) {
            if (interaction.deferred) await interaction.editReply("❌ Error distributing war clan reports: " + error.message);
        }
    },

    dispatchWarEmbed,
    sendWarNotification,
    startAutoMonitoring
};
