const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

async function fwaFetch(originalUrl, logger = null) {
    const workerBase = process.env.FWA_WORKER_URL;
    if (!workerBase) throw new Error("FWA_WORKER_URL is not set in .env");

    const tagMatch = originalUrl.match(/[?&]tag=([^&]+)/);
    const workerUrl = tagMatch
        ? `${workerBase}?tag=${tagMatch[1]}`
        : `${workerBase}?url=${encodeURIComponent(originalUrl)}`;

    const res = await axios.get(workerUrl, { timeout: 15000 });
    const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    const isCfBlocked = data.includes("Just a moment") || data.includes("_cf_chl_opt");
    if (isCfBlocked || data.length < 100) throw new Error("Worker returned a blocked/invalid response");
    if (logger) await logger(`✅ Worker fetch succeeded`);
    return data;
}

function stripHtml(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

async function fetchDetailedWarData(tag, opponentTagFromApi = "N/A", logger = null) {
    const url = `https://points.fwafarm.com/clan?tag=${tag.replace("#", "")}`;
    try {
        const rawHtml = await fwaFetch(url, logger);
        const bodyText = stripHtml(rawHtml);

        const activeFwaMatch = bodyText.match(/Active FWA\s*:\s*(Yes|No)/i);
        const isActiveFWA = activeFwaMatch ? (activeFwaMatch[1].toLowerCase() === 'yes') : false;

        const pointsMatch = bodyText.match(/Point Balance\s*:\s*(\d+)/i);
        const pointsSummary = pointsMatch ? pointsMatch[1] : "N/A";

        let opponentName = "Unknown";
        let opponentTag = opponentTagFromApi !== "N/A" ? opponentTagFromApi : "N/A";

        let prediction = "";
        const winCalcRegex = /Win Calculator for War.*?\):\s*(.*?)\s*Clan Point History/i;
        const winCalcMatch = bodyText.match(winCalcRegex);
        if (winCalcMatch) {
            prediction = winCalcMatch[1].trim();
        } else {
            const predictionMatch = bodyText.match(/([^.:]+should win by points[^)]+\))/i);
            if (predictionMatch) prediction = predictionMatch[1].trim();
        }

        if (opponentTag === "N/A") {
            const cleanTag = tag.replace("#", "").toUpperCase();
            const warRegex = /([^(]+)\s*\(\s*([A-Z0-9]+)\s*\)\s*vs\.\s*([^(]+)\s*\(\s*([A-Z0-9]+)\s*\)/i;
            const warMatch = bodyText.match(warRegex);
            if (warMatch) {
                const team1Tag = warMatch[2].trim().toUpperCase();
                const team2Tag = warMatch[4].trim().toUpperCase();
                if (team1Tag === cleanTag) {
                    opponentName = warMatch[3].trim();
                    opponentTag = `#${team2Tag}`;
                } else if (team2Tag === cleanTag) {
                    opponentName = warMatch[1].trim();
                    opponentTag = `#${team1Tag}`;
                } else {
                    opponentName = warMatch[3].trim();
                    opponentTag = `#${team2Tag}`;
                }
            }
        }

        const stateMatch = bodyText.match(/Last Known War State\s*:\s*(\w+)/i);
        const statusRaw = stateMatch ? stateMatch[1].toUpperCase() : "N/A";

        const syncMatch = bodyText.match(/Sync\s*(#\d+)/i);
        const syncNumber = syncMatch ? syncMatch[1] : "N/A";

        const warIdMatch = bodyText.match(/War\s*(#\d+)/i);
        const warId = warIdMatch ? warIdMatch[1] : "N/A";

        return {
            warInfo: { warId, opponentName, opponentTag, syncNumber, statusRaw },
            pointsSummary, prediction, isActiveFWA, url
        };
    } catch (error) { throw error; }
}

async function sendWarNotificationTest(client, coc, emojiUtils, clanTag, roleData, targetChannel, apiLogger = null) {
    try {
        const clanData = await coc.getClan(clanTag);
        if (!clanData) return { success: false, reason: "No clan data" };

        let currentWar = null;
        try { currentWar = await coc.getCurrentWar(clanTag); } catch (e) { }

        if (!currentWar || currentWar.state === "notInWar") {
            const embed = new EmbedBuilder()
                .setTitle(`${clanData.name} War Status`)
                .setDescription("**NO WAR IS ONGOING**")
                .setColor(0x808080)
                .setThumbnail(clanData.badgeUrls.medium)
                .setFooter({ text: `✧ ${clanData.name} ✧`, iconURL: clanData.badgeUrls.small })
                .setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(() => null);
            return { success: true, reason: "No war" };
        }

        const opponentTagFromApi = currentWar?.opponent?.tag || "N/A";
        const fwaData = await fetchDetailedWarData(clanTag, opponentTagFromApi, apiLogger);

        let matchType = "Mismatch";
        let isOpponentFWA = false;
        let oppPoints = 0;

        const opponentTagToCheck = opponentTagFromApi !== "N/A" ? opponentTagFromApi : fwaData.warInfo?.opponentTag;
        if (opponentTagToCheck && opponentTagToCheck !== "N/A") {
            try {
                const oppPointsUrl = `https://points.fwafarm.com/clan?tag=${opponentTagToCheck.replace("#", "")}`;
                const oppBodyText = stripHtml(await fwaFetch(oppPointsUrl, apiLogger));
                if (oppBodyText.match(/Active FWA\s*:\s*Yes/i) || oppBodyText.includes("FWA Points: Clan")) {
                    isOpponentFWA = true;
                }
                const oppPointsMatch = oppBodyText.match(/Point Balance\s*:\s*(\d+)/i);
                if (oppPointsMatch) oppPoints = parseInt(oppPointsMatch[1], 10) || 0;
            } catch (e) { }
        }

        if (fwaData.isActiveFWA && isOpponentFWA) {
            matchType = "FWA Match";
        } else if (fwaData.isActiveFWA && !isOpponentFWA) {
            matchType = "Mismatch";
        } else {
            matchType = "Blacklisted Match";
        }

        const opponentTag = currentWar?.opponent?.tag || fwaData.warInfo?.opponentTag || "N/A";
        let opponentData = null;
        if (opponentTag !== "N/A") {
            try { opponentData = await coc.getClan(opponentTag); } catch (e) { }
        }

        const opponentName = opponentData?.name || currentWar?.opponent?.name || fwaData.warInfo?.opponentName || "Unknown Opponent";

        const getComposition = (members) => {
            if (!members || members.length === 0) return "N/A";
            const counts = {};
            members.forEach(m => {
                const th = m.townhallLevel || m.thLevel;
                if (th) counts[th] = (counts[th] || 0) + 1;
            });
            return Object.keys(counts).sort((a, b) => b - a)
                .map(th => `${emojiUtils.getEmoji(`th${th}`) || `TH${th}`} \`${counts[th]}\``).join(" ");
        };

        const clanComp = (currentWar?.clan?.members) ? getComposition(currentWar.clan.members) : getComposition(clanData.memberList);
        const oppComp = (currentWar?.opponent?.members) ? getComposition(currentWar.opponent.members) : (opponentData ? getComposition(opponentData.memberList) : "N/A");

        const getDuration = (endTime) => {
            if (!endTime) return "N/A";
            const formattedDate = endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
            const diff = new Date(formattedDate) - Date.now();
            if (diff <= 0) return "Finished";
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            return days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
        };

        const ourPoints = parseInt(fwaData.pointsSummary, 10) || 0;
        let isWin = false;
        let tieBreakerNote = "";

        if (ourPoints > oppPoints) {
            isWin = true;
        } else if (ourPoints < oppPoints) {
            isWin = false;
        } else {
            let isHighWar = false;
            const predLower = (fwaData.prediction || "").toLowerCase();
            if (predLower.includes("high sync") || predLower.includes("high lotto") || predLower.includes("high tag") || predLower.includes("high war")) {
                isHighWar = true;
            } else if (predLower.includes("low sync") || predLower.includes("low lotto") || predLower.includes("low tag") || predLower.includes("low war")) {
                isHighWar = false;
            } else {
                const syncStr = fwaData.warInfo?.syncNumber || "";
                const syncMatch = syncStr.match(/\d+/);
                if (syncMatch) isHighWar = (parseInt(syncMatch[0], 10) % 2 !== 0);
            }

            const cleanOurTag = clanTag.replace("#", "").toUpperCase();
            const cleanOppTag = opponentTagToCheck ? opponentTagToCheck.replace("#", "").toUpperCase() : "";
            if (cleanOurTag && cleanOppTag && cleanOurTag !== cleanOppTag) {
                const isOurTagHigher = cleanOurTag > cleanOppTag;
                isWin = isHighWar ? isOurTagHigher : !isOurTagHigher;
            }
            tieBreakerNote = `\n⚖️ **Tie-Breaker:** ${isHighWar ? "HIGH WAR" : "LOW WAR"} | Tags: \`#${cleanOurTag}\` vs \`#${cleanOppTag}\` → **${isWin ? "We Win" : "Opponent Wins"}**`;
        }

        let warRules = "";
        if (matchType === "Blacklisted Match") {
            warRules = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ This is a blacklisted war — we're not backing down!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${emojiUtils.getEmoji('cocfight')} **Instructions:**\n\n🔸 Change your war base to a real war base — no FWA layouts!\n🔸 Attack freely and aim for ⭐️⭐️⭐️ 3 stars on both hits.\n🔸 Coordinate with your team for cleanup and efficient hits.\n\n📌 **War Goals:**\n30 war bases changed\n60% destruction\nWin the war 💪\n\n📚 **Need a base? Visit:** clashofclans-layouts.com\n\n🔁 **After war ends:**\nSwitch your base back to FWA format immediately!`;
        } else if (matchType === "FWA Match") {
            if (isWin) {
                warRules = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟩 **This war has been declared a win as per FWA rules.**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚔️ **WIN WAR INSTRUCTIONS** ⚔️\n\n${emojiUtils.getEmoji('rarrow')} First attack on mirror – try for ⭐⭐⭐(3 Stars)\n${emojiUtils.getEmoji('rarrow')} First 16 hours – secure ⭐⭐(2 Stars) if needed\n${emojiUtils.getEmoji('rarrow')} Last 8 hours – go for ⭐⭐⭐(3 Stars) cleanups\n\n📌 **Important**\n\n${emojiUtils.getEmoji('rarrow')} Use both attacks\n${emojiUtils.getEmoji('rarrow')} Don't rush attacks\n${emojiUtils.getEmoji('rarrow')} Ask if you need help`;
            } else {
                warRules = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟥 **This war has been declared a loss as per FWA rules.**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚔️ **LOSE WAR INSTRUCTIONS** ⚔️\n\n${emojiUtils.getEmoji('rarrow')} First attack on mirror – secure ⭐⭐(2 Stars)\n${emojiUtils.getEmoji('rarrow')} First 16 hours – secure ⭐(1 Star) if needed\n${emojiUtils.getEmoji('rarrow')} Last 8 hours – go for ⭐⭐(2 Stars) cleanups\n\n📌 **Important**\n\n${emojiUtils.getEmoji('rarrow')} Use both attacks\n${emojiUtils.getEmoji('rarrow')} No extra attacks without permission\n${emojiUtils.getEmoji('rarrow')} Don't rush attacks\n${emojiUtils.getEmoji('rarrow')} Ask if you need help`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`🧪 [TEST] ${clanData.name} vs ${opponentName}`)
            .setColor(matchType === "Blacklisted Match" ? 0xFF0000 : (matchType === "FWA Match" ? (isWin ? 0x00FF00 : 0xFF0000) : 0xFFA500))
            .setThumbnail(clanData.badgeUrls.medium)
            .setDescription(
                `**[${clanData.name}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clanData.tag.replace("#", "")})** (\`${clanData.tag}\`) **VS** **[${opponentName}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${opponentTag.replace("#", "")})** (\`${opponentTag}\`)\n\n` +
                `**Match Type:** ${matchType}\n` +
                `**Sync Number:** ${fwaData.warInfo?.syncNumber || "N/A"}\n` +
                `**War ID:** ${fwaData.warInfo?.warId || "N/A"}\n` +
                `**Team Size:** ${currentWar?.teamSize ? `${currentWar.teamSize} vs ${currentWar.teamSize}` : "50 vs 50"}\n` +
                `**Ends in:** ${getDuration(currentWar?.endTime)}\n\n` +
                `**Our Points:** ${ourPoints} | **Opp Points:** ${oppPoints}${tieBreakerNote ? `\n${tieBreakerNote}` : ""}\n\n` +
                `**${clanData.name} Composition**\n${clanComp}\n\n` +
                `**${opponentName} Composition**\n${oppComp}\n` +
                warRules
            )
            .setFooter({ text: `🧪 TEST MODE — ${clanData.name}`, iconURL: clanData.badgeUrls.small })
            .setTimestamp();

        await targetChannel.send({ embeds: [embed] }).catch(() => null);
        return { success: true, reason: matchType };
    } catch (error) {
        if (apiLogger) await apiLogger(`[TEST] Error for ${clanTag}: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("checkallwarstest")
        .setDescription("Test war mail — sends all outputs to a single channel without touching clan channels")
        .addChannelOption(option =>
            option.setName("channel")
                .setDescription("The test channel to send all war mails to")
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { coc, emoji: emojiUtils, client } = context;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetChannel = interaction.options.getChannel("channel");
        if (!targetChannel) return interaction.editReply("❌ Target channel not found.");

        try {
            const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");
            const clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf-8"));
            const results = [];

            const apiLogger = async (msg) => {
                const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
                const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
                if (logChannel) await logChannel.send(`\`[TEST LOG]\` ${msg}`).catch(() => null);
            };

            for (const [tag, roleData] of Object.entries(clanRoles)) {
                const { success, reason } = await sendWarNotificationTest(client, coc, emojiUtils, tag, roleData, targetChannel, apiLogger);
                results.push(success ? `✅ **${tag}**: ${reason}` : `❌ **${tag}**: ${reason}`);
            }

            const failCount = results.filter(r => r.startsWith("❌")).length;
            const summaryEmbed = new EmbedBuilder()
                .setTitle("🧪 War Mail Test — Distribution Summary")
                .setDescription(results.join("\n") + `\n\n> All results sent to <#${targetChannel.id}>`)
                .setColor(failCount === 0 ? 0x00FF00 : 0xFFA500)
                .setFooter({ text: "TEST MODE — No clan channels were affected" })
                .setTimestamp();

            await interaction.editReply({ embeds: [summaryEmbed] });
        } catch (error) {
            console.error(error);
            if (interaction.deferred) await interaction.editReply("❌ Error running test distribution.");
        }
    }
};
