const fs = require("fs");
const path = require("path");

const STATUS_PATH = path.join(__dirname, "../data/recruitment_status.json");

/**
 * Recruitment Monitoring Module
 */
async function startRecruitmentMonitoring(client, config, coc, dataManager, emoji) {
    console.log("📡 Recruitment Monitoring System started");

    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    setInterval(async () => {
        try {
            await checkClans(client, config, coc, dataManager, emoji);
        } catch (err) {
            console.error("❌ Recruitment check error:", err.message);
        }
    }, 15 * 60 * 1000);

    setTimeout(() => checkClans(client, config, coc, dataManager, emoji), 10000);
}

async function checkClans(client, config, coc, dataManager, emoji) {
    const RECRUIT_CHANNEL_ID = process.env.RECRUIT_CHANNEL_ID;
    const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "1188515065889050746";

    const channel = await client.channels.fetch(RECRUIT_CHANNEL_ID).catch(() => null);
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

    const systemLog = async (msg) => {
        if (logChannel) await logChannel.send(`\`[RECRUITMENT SYSTEM]\` ${msg}`).catch(() => null);
    };

    if (!channel) {
        await systemLog("⚠️ Recruitment channel not found. Please set RECRUIT_CHANNEL_ID in .env");
        return;
    }

    const clanRoles = dataManager.getClanRoles();
    const statusData = getStatusData();
    const { getEmoji } = emoji;

    const now = Date.now();
    for (const [tag, data] of Object.entries(statusData)) {
        if (data && data.status === "closed" && data.closedAt) {
            const thirtyMinutes = 30 * 60 * 1000;
            if (now - data.closedAt > thirtyMinutes) {
                if (data.closedMessageId) {
                    const msg = await channel.messages.fetch(data.closedMessageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => null);
                }
                delete statusData[tag];
            }
        }
    }

    for (const [tag, roleInfo] of Object.entries(clanRoles)) {
        try {
            const clan = await coc.getClan(tag);
            const members = clan.members;
            const isFwa = roleInfo.clanType === "fwa";

            const isCwlActive = await checkIsCwlActive(tag, coc);
            if (isCwlActive) {
                continue;
            }


            if (members < 48) {
                if (!roleInfo.autoPostRecruitment) continue;

                const currentStatus = statusData[tag];
                const isAlreadyOpen = typeof currentStatus === "object" ? currentStatus.status === "open" : currentStatus === "notified";

                if (!isAlreadyOpen) {
                    const spotsOpened = 50 - members;
                    const clanIcon = isFwa ? getEmoji("whitefwa") : getEmoji("cocfight");
                    const cwlType = isFwa ? "Lazy CWL" : "Serious CWL";
                    const clanTypeText = isFwa ? "FWA Clan" : "WarClan";

                    const thEmojiStr = ["14", "15", "16", "17", "18"].map(lvl => getEmoji(`th${lvl}`) || `TH${lvl}`).join(' ');
                    const leaderEmoji = getEmoji("fwalead");

                    const embed = {
                        title: `${getEmoji("gtick")} RECRUITMENT OPEN`,
                        color: 0x2ECC71, // Green
                        description:
                            `${clanIcon} **${clan.name}** is now recruiting!\n\n` +
                            `${leaderEmoji} **Accepting:** ${thEmojiStr}\n` +
                            `${getEmoji("mem")} **Spots opened:** ${spotsOpened}\n` +
                            `${getEmoji("coc")} **${clanTypeText}**\n` +
                            `${getEmoji("cwl")} **${cwlType}**\n\n` +
                            `${getEmoji("heart")} **Open a ticket to apply.**`,
                        timestamp: new Date().toISOString()
                    };

                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`apply_recruit:${tag}`)
                            .setLabel(`Join ${clan.name}`)
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(getEmoji('coc') || '🛡️')
                    );

                    const sentMsg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
                    await systemLog(`📢 Recruitment notification sent for **${clan.name}** (${members}/50)`);

                    statusData[tag] = {
                        status: "open",
                        messageId: sentMsg ? sentMsg.id : null,
                        openedAt: Date.now()
                    };
                }
            } else if (members >= 50) {
                const currentStatus = statusData[tag];
                const isOpen = typeof currentStatus === "object" ? currentStatus.status === "open" : currentStatus === "notified";

                if (isOpen) {
                    const openMsgId = typeof currentStatus === "object" ? currentStatus.messageId : null;
                    if (openMsgId) {
                        const msg = await channel.messages.fetch(openMsgId).catch(() => null);
                        if (msg) await msg.delete().catch(() => null);
                    }

                    const embed = {
                        title: `${getEmoji("bluex")} RECRUITMENT CLOSED`,
                        color: 0xE74C3C, // Red
                        description: `**${clan.name}** is now full (${members}/50).`,
                        timestamp: new Date().toISOString()
                    };
                    const closedMsg = await channel.send({ embeds: [embed] }).catch(() => null);
                    await systemLog(`🔴 Recruitment CLOSED for **${clan.name}** (50/50). Message sent.`);

                    statusData[tag] = {
                        status: "closed",
                        closedAt: Date.now(),
                        closedMessageId: closedMsg ? closedMsg.id : null
                    };
                }
            }

        } catch (err) {
            await systemLog(`❌ Check failed for **${tag}**: ${err.message}`);
        }
    }

    saveStatusData(statusData);
}

/**
 * Check if the clan is currently in CWL
 */
async function checkIsCwlActive(tag, coc) {
    try {
        const group = await coc.getClanWarLeagueGroup(tag);
        if (group && (group.state === "inWar" || group.state === "preparation")) {
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

function getStatusData() {
    if (!fs.existsSync(STATUS_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
    } catch (e) {
        return {};
    }
}

function saveStatusData(data) {
    try {
        fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2));
    } catch (e) { }
}

module.exports = { startRecruitmentMonitoring, getStatusData, saveStatusData };
