const fs = require("fs");
const path = require("path");
const { MessageFlags } = require("discord.js");
const syncStatePath = path.join(__dirname, "../../../data/syncState.json");

const VOTE_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function pruneVoteHistory(state) {
    if (!state.voteHistory || !Array.isArray(state.voteHistory)) {
        state.voteHistory = [];
        return { state, expired: [] };
    }
    const cutoff = Date.now() - VOTE_HISTORY_MAX_AGE_MS;
    const expired = state.voteHistory.filter(entry => !entry.timestamp || entry.timestamp <= cutoff);
    state.voteHistory = state.voteHistory.filter(entry => entry.timestamp && entry.timestamp > cutoff);
    return { state, expired };
}

async function cleanExpiredVoteMessages(context, expired) {
    if (!expired || expired.length === 0) return;
    const { client, config } = context;
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;

    let channel = null;
    try {
        channel = await client.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
    } catch (e) { }

    let deletedCount = 0;
    for (const entry of expired) {
        if (entry.messageId && channel?.isTextBased()) {
            try {
                const msg = await channel.messages.fetch(entry.messageId).catch(() => null);
                if (msg) {
                    await msg.delete().catch(() => {});
                    deletedCount++;
                }
            } catch (e) { }
        }
    }

    // Log the date range of deleted entries
    const timestamps = expired.filter(e => e.timestamp).map(e => e.timestamp).sort((a, b) => a - b);
    if (timestamps.length > 0) {
        const oldest = new Date(timestamps[0]);
        const newest = new Date(timestamps[timestamps.length - 1]);
        const fmt = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const logMsg = `🗑️ **Cleaned expired vote history** (older than 7 days)\n` +
            `📅 **From:** ${fmt(oldest)}\n` +
            `📅 **To:** ${fmt(newest)}\n` +
            `📊 **Sessions removed:** ${expired.length} | **Messages deleted:** ${deletedCount}`;
        await logToChannel(context, logMsg);
    }
}

function archiveCurrentVotes(state) {
    if (!state.starters || state.starters.length === 0) return state;
    const hasAnyVotes = state.starters.some(s => (s.entries || []).length > 0);
    if (!hasAnyVotes) return state;
    if (!state.voteHistory) state.voteHistory = [];
    state.voteHistory.push({
        timestamp: Date.now(),
        messageId: state.messageId || null,
        starters: JSON.parse(JSON.stringify(state.starters)),
        voteCounts: state.voteCounts ? JSON.parse(JSON.stringify(state.voteCounts)) : {}
    });
    const { state: prunedState } = pruneVoteHistory(state);
    return prunedState;
}

function buildDetectiveFields(starters, tickEmoji, questionEmoji, wrongEmoji) {
    const fields = [];
    for (const clan of starters) {
        const entries = clan.entries || [];
        if (entries.length === 0) {
            fields.push({
                name: `${clan.emojiStr || ""} ${clan.name}`,
                value: "No votes yet"
            });
            continue;
        }

        const ableUsers = entries.filter(e => e.status === tickEmoji);
        const maybeUsers = entries.filter(e => e.status === questionEmoji);
        const cannotUsers = entries.filter(e => e.status === wrongEmoji);

        let fieldValue = "";
        if (ableUsers.length > 0) {
            fieldValue += `✅ **Able:** ${ableUsers.map(e => `<@${e.userId}>`).join(", ")}\n`;
        }
        if (maybeUsers.length > 0) {
            fieldValue += `❓ **Maybe:** ${maybeUsers.map(e => `<@${e.userId}>`).join(", ")}\n`;
        }
        if (cannotUsers.length > 0) {
            fieldValue += `❌ **Cannot:** ${cannotUsers.map(e => `<@${e.userId}>`).join(", ")}\n`;
        }

        let val = fieldValue.trim() || "No votes yet";
        if (val.length > 1024) val = val.slice(0, 1020) + "...";

        fields.push({
            name: `${clan.emojiStr || ""} ${clan.name}`,
            value: val
        });
    }
    return fields;
}

function getLastWarId() {
    try {
        if (fs.existsSync(syncStatePath)) {
            const d = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
            return d.lastWarId || null;
        }
    } catch (e) { }
    return null;
}

function setLastWarId(id) {
    try {
        let state = {};
        if (fs.existsSync(syncStatePath)) {
            try { state = JSON.parse(fs.readFileSync(syncStatePath, "utf8")); } catch (e) { }
        }
        state.lastWarId = id;
        fs.writeFileSync(syncStatePath, JSON.stringify(state, null, 2));
    } catch (e) { }
}

async function logToChannel(context, msg) {
    if (msg) {
        const lower = msg.toLowerCase();
        const isTokenError = lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied");
        const isIgnorable = lower.includes("coc api") || lower.includes("clash api") || lower.includes("fetch") || 
                            lower.includes("timeout") || lower.includes("503") || lower.includes("504") || 
                            lower.includes("502") || lower.includes("500") || lower.includes("network error") || 
                            lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("api_maintenance_pause");
        if (isIgnorable && !isTokenError) return;
    }
    const { client, config, EmbedBuilder } = context;
    const LOG_CHANNEL_ID = config.LOG_CHANNEL_ID;
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (logChannel?.isTextBased()) {
            await logChannel.send(msg);
        }
    } catch (error) {
        console.error("Failed to send log to channel:", error);
    }
}

async function sendSyncMessage(context, message = null) {
    const { client, config, emoji: emojiUtils, EmbedBuilder } = context;
    const { ChannelType , MessageFlags } = require("discord.js");
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;
    const CUSTOM_ROLE_ID = "1407320183760224347";
    const LOG_CHANNEL_ID = config.LOG_CHANNEL_ID;

    const tickId = emojiUtils.emojis.gtick;
    const questionId = emojiUtils.emojis.question;
    const wrongId = emojiUtils.emojis.bluex;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = message
        ? message.channel
        : await client.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildText) return;

    const fs = require("fs");
    const path = require("path");
    const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");
    const statePath = path.join(__dirname, "../../../data/syncState.json");

    let initialStarters = [];
    if (fs.existsSync(clanRolesPath)) {
        try {
            const clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf8"));
            const fwaClans = Object.entries(clanRoles).filter(([t, d]) => d.clanType && d.clanType.toLowerCase() === "fwa");
            const fetchPromises = fwaClans.map(async ([tag, data]) => {
                const emojiStr = emojiUtils.getEmoji(data.nickName ? data.nickName.toLowerCase() : "") || "";
                try {
                    const clanData = await context.coc.getClan(tag);
                    return { tag, name: clanData.name || data.nickName || tag, emojiStr, user: null, status: null };
                } catch (e) {
                    return { tag, name: data.nickName || tag, emojiStr, user: null, status: null };
                }
            });
            initialStarters = await Promise.all(fetchPromises);
        } catch (e) { }
    }

    let fwaDesc = "";
    initialStarters.forEach((clan, i) => {
        fwaDesc += `${i + 1}. ${clan.emojiStr} ${clan.name} -\n`;
    });

    const randomColor = Math.floor(Math.random() * 16777215);
    const roleId = "1394230094675050616";

    const embed = new EmbedBuilder()
        .setColor(randomColor)
        .setTitle("Are you able to start?")
        .setDescription(
            `**War Starters Availability Clans:**\n${fwaDesc || "No FWA Clans configured."}`
        );

    let sentMessage;
    try {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sync_yes").setLabel("Able").setEmoji(emojiUtils.getEmojiObject("gtick") || "✅").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("sync_maybe").setLabel("Maybe").setEmoji(emojiUtils.getEmojiObject("question") || "❗").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sync_no").setLabel("Cannot").setEmoji(emojiUtils.getEmojiObject("bluex") || "❌").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("sync_check").setLabel("Re-Check").setEmoji(emojiUtils.getEmojiObject("refresh") || "🔍").setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sync_fillers").setLabel("Need Fillers").setEmoji(emojiUtils.getEmojiObject("alaram") || "📣").setStyle(ButtonStyle.Secondary)
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sync_detective").setEmoji("🕵️").setStyle(ButtonStyle.Secondary)
        );

        sentMessage = await channel.send({
            content: `<@&${roleId}> Choose before 10 hours`,
            embeds: [embed],
            components: [row1, row2, row3]
        });

        let existingState = fs.existsSync(statePath) ? (() => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { return {}; } })() : {};
        // Archive current votes before resetting for the new sync session
        existingState = archiveCurrentVotes(existingState);
        const { state: prunedSendState, expired: expiredSend } = pruneVoteHistory(existingState);
        existingState = prunedSendState;

        let currentWarId = null;
        try {
            const CLAN_TAG = "#2L90V8PYY";
            const currentWar = await context.coc.getCurrentWar(CLAN_TAG);
            if (currentWar && currentWar.clan && currentWar.opponent && currentWar.endTime) {
                currentWarId = `${currentWar.clan.tag}-${currentWar.opponent.tag}-${currentWar.endTime}`;
            }
        } catch (e) { }

        fs.writeFileSync(statePath, JSON.stringify({
            ...existingState,
            syncWarId: currentWarId || existingState.syncWarId || null,
            messageId: sentMessage.id,
            starters: initialStarters.map(s => ({ ...s, entries: [] })),
            voteCounts: {},
            syncExpired: false
        }, null, 2));
        // Delete expired vote messages from Discord and log
        await cleanExpiredVoteMessages(context, expiredSend);

    } catch (err) {
        await logToChannel(context, `Failed to send sync message: ${err.message}`);
        return;
    }

    await sendFillCheckEmbed(context);

}

async function removeRoleFromAll(context) {
    const { client, config } = context;
    const CUSTOM_ROLE_ID = "1407320183760224347";
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const role = guild.roles.cache.get(CUSTOM_ROLE_ID) || await guild.roles.fetch(CUSTOM_ROLE_ID).catch(() => null);
    if (!role) return;

    for (const member of role.members.values()) {
        await member.roles.remove(CUSTOM_ROLE_ID).catch(() => { });
    }

    const syncChannel = await guild.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
    if (syncChannel?.isTextBased()) {
        syncChannel.send(`🗑 Removed role **${role.name}** from all members.`);
    }
}

async function sendFillCheckEmbed(context) {
    const { client, config, coc, emoji: emojiUtils, EmbedBuilder } = context;
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;
    const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");
    const statePath = path.join(__dirname, "../../../data/syncState.json");
    if (!fs.existsSync(clanRolesPath)) return;

    let clanRoles = {};
    try { clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf8")); } catch (e) { return; }

    const fwaClans = Object.entries(clanRoles).filter(([, d]) => d.clanType && d.clanType.toLowerCase() === "fwa");
    if (fwaClans.length === 0) return;

    const missingList = [];
    const pings = new Set();

    await Promise.all(fwaClans.map(async ([tag, data]) => {
        try {
            const clan = await coc.getClan(tag);
            const members = clan.members || 0;
            const emojiStr = emojiUtils.getEmoji((data.nickName || "").toLowerCase()) || "";
            const link = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tag.replace("#", "%23")}`;
            if (members < 50) {
                missingList.push(`${emojiStr} [${clan.name}](${link}) — (${members}/50)`);
                if (data.leaderRoleId) pings.add(`<@&${data.leaderRoleId}>`);
            }
        } catch (e) { }
    }));

    const syncChannel = await client.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
    if (!syncChannel?.isTextBased()) return;

    let syncState = {};
    if (fs.existsSync(statePath)) {
        try { syncState = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { }
    }

    // Delete the previous fill-check message before sending a new one
    if (syncState.fillCheckMessageId) {
        try {
            const oldMsg = await syncChannel.messages.fetch(syncState.fillCheckMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
        } catch (e) { }
        syncState.fillCheckMessageId = null;
    }
    
    let sentFillMsg = null;
    if (missingList.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle("⚠️ Clans Need Members Before Sync!")
            .setColor(0xFF4444)
            .setDescription(missingList.join("\n"))
            .setTimestamp();
        sentFillMsg = await syncChannel.send({ content: [...pings].join(" ") || null, embeds: [embed] }).catch(() => null);
    } else {
        const embed = new EmbedBuilder()
            .setTitle("✅ All Clans Are Full (50/50)")
            .setColor(0x2ECC71)
            .setDescription("All FWA clans are full. Ready for war sync!")
            .setTimestamp();
        sentFillMsg = await syncChannel.send({ embeds: [embed] }).catch(() => null);
    }

    if (sentFillMsg) {
        syncState.fillCheckMessageId = sentFillMsg.id;
        fs.writeFileSync(statePath, JSON.stringify(syncState, null, 2));
    }
}

async function cleanSyncMessages(context) {
    const { client, config } = context;
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;
    const statePath = path.join(__dirname, "../../../data/syncState.json");
    let syncState = {};
    if (fs.existsSync(statePath)) {
        try { syncState = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { }
    }

    // Archive current votes to history now that new war prep has arrived
    syncState = archiveCurrentVotes(syncState);
    const { state: prunedState, expired: expiredClean } = pruneVoteHistory(syncState);
    syncState = prunedState;
    syncState.syncExpired = true;
    try {
        fs.writeFileSync(statePath, JSON.stringify(syncState, null, 2));
    } catch (e) { }
    await cleanExpiredVoteMessages(context, expiredClean);

    const guild = client.guilds.cache.first();
    if (!guild) return;

    try {
        const channel = await guild.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        if (syncState.messageId) {
            const syncMsg = await channel.messages.fetch(syncState.messageId).catch(() => null);
            if (syncMsg && syncMsg.components.length > 0) {
                const { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder } = require("discord.js");
                const disabledComponents = syncMsg.components.map(row => {
                    const newRow = new ActionRowBuilder();
                    row.components.forEach(c => {
                        if (c.type === 2) { // Button
                            const btn = ButtonBuilder.from(c);
                            // Keep detective button always enabled
                            if (c.customId !== "sync_detective") btn.setDisabled(true);
                            newRow.addComponents(btn);
                        } else if (c.type === 3) { // Select Menu
                            newRow.addComponents(StringSelectMenuBuilder.from(c).setDisabled(true));
                        }
                    });
                    return newRow;
                });
                // Preserve embeds and content when disabling buttons to prevent Discord from trashing the message
                await syncMsg.edit({ 
                    content: syncMsg.content || undefined,
                    embeds: syncMsg.embeds || [],
                    components: disabledComponents 
                }).catch(() => {});
            }
        }

        if (syncState.fillCheckMessageId) {
            try {
                const fillMsg = await channel.messages.fetch(syncState.fillCheckMessageId).catch(() => null);
                if (fillMsg) await fillMsg.delete().catch(() => {});
            } catch (e) { }
            syncState.fillCheckMessageId = null;
            fs.writeFileSync(statePath, JSON.stringify(syncState, null, 2));
        }

        let lastMessageId = null;
        let hasMore = true;

        while (hasMore) {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;
            
            const fetched = await channel.messages.fetch(options).catch(() => null);
            if (!fetched || fetched.size === 0) {
                hasMore = false;
                break;
            }

            const toDelete = [];
            for (const [id, m] of fetched) {
                lastMessageId = id; // advance cursor

                if (id === syncState.messageId) continue; // keep sync embed
                
                const isThreadCreated = m.type === 18 || m.type === 21;
                const isUserMessage = !m.author.bot;
                
                if (isThreadCreated || isUserMessage) {
                    toDelete.push(m);
                }
            }

            if (toDelete.length > 0) {
                const recentIds = toDelete
                    .filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000)
                    .map(m => m.id);
                const oldMsgs = toDelete
                    .filter(m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

                if (recentIds.length > 0) {
                    await channel.bulkDelete(recentIds, true).catch(() => {});
                }
                for (const m of oldMsgs) {
                    await m.delete().catch(() => {});
                }
            }
        }

        await logToChannel(context, "🧹 Prep day: disabled buttons on sync embed, deleted user and thread messages.");
    } catch (err) {
        console.error("Error clearing sync channel messages:", err);
    }
}

async function cleanSyncChannel(context) {
    const { client, config } = context;
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;
    const guild = client.guilds.cache.first();
    if (!guild) return;

    try {
        const channel = await guild.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        try {
            // Delete active threads
            const activeThreads = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            for (const thread of activeThreads.threads.values()) {
                await thread.delete().catch(() => { });
            }

            // Delete archived threads (handle pagination)
            let hasMore = true;
            let lastThreadId = undefined;
            while (hasMore) {
                const options = { limit: 100 };
                if (lastThreadId) options.before = lastThreadId;
                
                const archivedThreads = await channel.threads.fetchArchived(options).catch(() => ({ threads: new Map(), hasMore: false }));
                for (const thread of archivedThreads.threads.values()) {
                    await thread.delete().catch(() => { });
                    lastThreadId = thread.id;
                }
                hasMore = archivedThreads.hasMore && archivedThreads.threads.size > 0;
            }
        } catch (threadErr) {
            console.error("Failed to delete threads in sync channel:", threadErr);
        }

        await logToChannel(context, "🧼 Cleaned up threads in sync channel.");
    } catch (err) {
        console.error("Error during sync channel cleanup:", err);
    }
}

async function storeAllFwaWarRosters(context) {
    const { coc } = context;
    const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");
    const scanClanCmd = require("./scan-clan.js");

    try {
        if (!fs.existsSync(clanRolesPath)) return;
        const clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf8"));
        
        const fwaClans = Object.entries(clanRoles).filter(([t, d]) => d.clanType && d.clanType.toLowerCase() === "fwa");
        
        const storedClans = [];
        const errorClans = [];

        for (const [tag, data] of fwaClans) {
            try {
                const war = await coc.getCurrentWar(tag);
                if (war && (war.state === "preparation" || war.state === "inWar")) {
                    const warMembers = (war.clan && war.clan.members) ? war.clan.members : [];
                    const saved = scanClanCmd.storeWarSnapshot(tag, war, warMembers);
                    if (saved) {
                        const clanName = data.nickName || war.clan?.name || tag;
                        storedClans.push(`${clanName} (\`${tag}\`)`);
                    }
                }
            } catch (e) {
                const lower = e.message.toLowerCase();
                const isTokenError = lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied");
                const isIgnorable = lower.includes("coc api") || lower.includes("clash api") || lower.includes("fetch") || 
                                    lower.includes("timeout") || lower.includes("503") || lower.includes("504") || 
                                    lower.includes("502") || lower.includes("500") || lower.includes("network error") || 
                                    lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("api_maintenance_pause");
                if (!isIgnorable || isTokenError) {
                    const clanName = data.nickName || tag;
                    errorClans.push(`${clanName} (\`${tag}\`): ${e.message}`);
                }
            }
        }

        if (storedClans.length > 0) {
            const msg = `✅ **Stored new war rosters for ${storedClans.length} clan(s):**\n${storedClans.map(n => `• ${n}`).join("\n")}`;
            await logToChannel(context, msg);
        }

        if (errorClans.length > 0) {
            const errMsg = `⚠️ **Failed to fetch war data for ${errorClans.length} clan(s):**\n${errorClans.map(n => `• ${n}`).join("\n")}`;
            await logToChannel(context, errMsg);
        }
    } catch (err) {
        console.error("Error storing FWA war rosters:", err);
        await logToChannel(context, `❌ Error in storeAllFwaWarRosters: ${err.message}`);
    }
}

async function checkWarStatus(context) {
    const { coc, config, client } = context;
    const CLAN_TAG = "#2L90V8PYY";
    const SYNC_CHANNEL_ID = config.SYNC_CHANNEL_ID;

    try {
        const data = await coc.getCurrentWar(CLAN_TAG);
        if (!data || !data.endTime) return;

        const endTime = new Date(
            Date.UTC(
                parseInt(data.endTime.substring(0, 4)),
                parseInt(data.endTime.substring(4, 6)) - 1,
                parseInt(data.endTime.substring(6, 8)),
                parseInt(data.endTime.substring(9, 11)),
                parseInt(data.endTime.substring(11, 13)),
                parseInt(data.endTime.substring(13, 15))
            )
        );

        const now = new Date();
        const hoursLeft = (endTime - now) / (1000 * 60 * 60);
        const baseWarId = `${data.clan.tag}-${data.opponent.tag}-${data.endTime}`;

        let syncState = {};
        if (fs.existsSync(syncStatePath)) {
            try { syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf8")); } catch (e) { }
        }
        const lastWarId = syncState.lastWarId || null;

        // ONLY trigger expiration & cleanup when a NEW preparation day is detected after this war
        if (data.state === "preparation") {
            const prepId = `${baseWarId}-prep`;
            if (syncState.prepCleanId !== prepId) {
                syncState.prepCleanId = prepId;
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
                await logToChannel(context, "📋 Preparation day detected! Clearing sync channel messages and storing war rosters...");
                await cleanSyncMessages(context);
            }
        } else if (data.state === "inWar" && syncState.syncWarId && syncState.syncWarId !== baseWarId) {
            // New war already moved to battle day (e.g. if bot was offline during preparation day)
            const prepId = `${baseWarId}-prep`;
            if (syncState.prepCleanId !== prepId && syncState.syncExpired !== true) {
                syncState.prepCleanId = prepId;
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
                await logToChannel(context, "📋 New war in battle day detected! Expiring previous sync messages...");
                await cleanSyncMessages(context);
            }
        }

        if (hoursLeft <= 8 && hoursLeft > 7.9) {
            const warId = `${baseWarId}-8hr`;
            if (lastWarId !== warId) {
                syncState.lastWarId = warId;
                syncState.syncWarId = baseWarId;
                syncState.fillCheck4hrId = null; // reset 4hr check for new cycle
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));

                await logToChannel(context, "⏳ War ending in ~8 hours! Sending sync message...");
                await removeRoleFromAll(context);
                await sendSyncMessage(context); // already calls sendFillCheckEmbed internally
            }
        }

        if (hoursLeft <= 4 && hoursLeft > 3.9) {
            const fillId = `${baseWarId}-4hr`;
            if (syncState.fillCheck4hrId !== fillId) {
                syncState.fillCheck4hrId = fillId;
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
                await logToChannel(context, "🔄 4-hour recheck: checking clan fill status...");
                await sendFillCheckEmbed(context);
            }
        }

        if (data.state === "warEnded") {
            const warId = `${baseWarId}-ended`;
            if (lastWarId !== warId) {
                syncState.lastWarId = warId;
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
                await logToChannel(context, "🏁 War ended! Cleaning sync channel threads...");
                await cleanSyncChannel(context);
            }
        }

    } catch (err) {
        await logToChannel(context, `Failed to fetch COC API: ${err.message}`);
    }
}

module.exports = {
    name: "sync",
    description: "Manual war sync check",
    async execute(message, args, context) {
        await sendSyncMessage(context, message);
    },
    setupWarChecker(client, config, coc, emojiUtils, EmbedBuilder) {
        const context = { client, config, coc, emoji: emojiUtils, EmbedBuilder };
        setInterval(() => {
            checkWarStatus(context);
            storeAllFwaWarRosters(context);
        }, 1 * 60 * 1000);
    },
    async handleSyncButton(interaction, context) {
        const fs = require("fs");
        const path = require("path");
        const { EmbedBuilder } = require("discord.js");
        const statePath = path.join(__dirname, "../../../data/syncState.json");
        const clanRolesPath = path.join(__dirname, "../../../data/clanrole.json");

        let state = { messageId: null, starters: [], voteCounts: {} };
        if (fs.existsSync(statePath)) {
            try {
                state = JSON.parse(fs.readFileSync(statePath, "utf8"));
            } catch (e) { }
        }

        if (!state.voteCounts) state.voteCounts = {};
        if (!state.starters) state.starters = [];

        const member = interaction.member;
        const CUSTOM_ROLE_ID = "1407320183760224347";
        let clanRoles = {};
        if (fs.existsSync(clanRolesPath)) {
            try { clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf8")); } catch (e) { }
        }

        const emojiUtils = context.emoji;
        const tickEmoji = emojiUtils.getEmoji("gtick") || "✅";
        const questionEmoji = emojiUtils.getEmoji("question") || "❗";
        const wrongEmoji = emojiUtils.getEmoji("bluex") || "❌";

        // Server-side expiration guard: block all voting/action interactions after sync has expired or if no active sync exists
        const EXPIRED_WARNING = "🛑 **War has already started, fool! Come back for the next sync confirmation.**";
        const actionIds = ["sync_yes", "sync_maybe", "sync_no", "sync_check", "sync_fillers"];
        const isActionButton = actionIds.includes(interaction.customId);
        const isSelectAction = interaction.customId.startsWith("sync_select_") || interaction.customId.startsWith("sync_filler_select_");

        if (isActionButton || isSelectAction) {
            let isExpired = false;

            // 1. If explicitly marked expired or if no active sync session exists
            if (state.syncExpired === true || !state.messageId) {
                isExpired = true;
            }
            // 2. If clicking action buttons on an old/stale sync message (not the current active one)
            else if (isActionButton && interaction.message?.id && interaction.message.id !== state.messageId) {
                isExpired = true;
            }
            // 3. If submitting a clan select dropdown from an old/stale sync message
            else if (interaction.customId.startsWith("sync_select_")) {
                const targetMsgId = interaction.customId.split("_").slice(3).join("_");
                if (targetMsgId && targetMsgId !== state.messageId) {
                    isExpired = true;
                }
            }
            // 4. If submitting a filler clan select dropdown from an old/stale sync message
            else if (interaction.customId.startsWith("sync_filler_select_")) {
                const targetMsgId = interaction.customId.replace("sync_filler_select_", "");
                if (targetMsgId && targetMsgId !== state.messageId) {
                    isExpired = true;
                }
            }

            if (isExpired) {
                try {
                    if (isSelectAction) {
                        if (interaction.deferred || interaction.replied) {
                            return interaction.editReply({ content: EXPIRED_WARNING, embeds: [], components: [] }).catch(() => {});
                        }
                        return interaction.update({ content: EXPIRED_WARNING, embeds: [], components: [] }).catch(() => {});
                    } else {
                        if (interaction.deferred || interaction.replied) {
                            return interaction.editReply({ content: EXPIRED_WARNING }).catch(() => {});
                        }
                        return interaction.reply({ content: EXPIRED_WARNING, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                    }
                } catch (e) {
                    return;
                }
            }
        }

        if (interaction.customId === "sync_check") {
            try {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            } catch (e) {
                return;
            }

            let readyList = [];
            let notAvailList = [];

            const clansToCheck = Object.entries(clanRoles).filter(([tag, data]) => data.clanType && data.clanType.toLowerCase() === "fwa");

            if (clansToCheck.length === 0) {
                return interaction.editReply({ content: "No FWA clans found in the configuration." });
            }

            const fetchPromises = clansToCheck.map(async ([tag, data]) => {
                const emojiStr = (data.nickName ? emojiUtils.getEmoji(data.nickName.toLowerCase()) : null) || "";
                const link = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tag.replace("#", "%23")}`;
                try {
                    const clan = await context.coc.getClan(tag);
                    return { tag, name: clan.name, members: clan.members || 0, success: true, emojiStr, link };
                } catch (e) {
                    return { tag, name: data.nickName || tag, members: 0, success: false, emojiStr, link };
                }
            });

            const results = await Promise.all(fetchPromises);

            for (const result of results) {
                const displayStr = `${result.emojiStr} [${result.name}](${result.link}) - (${result.members}/50)`;
                if (!result.success) {
                    notAvailList.push(`${result.emojiStr} [${result.name}](${result.link}) - Error fetching data`);
                } else if (result.members >= 50) {
                    readyList.push(displayStr);
                } else {
                    notAvailList.push(displayStr);
                }
            }

            // Helper: split a string array into chunks that each fit within 1024 chars
            function chunkList(items, emptyLabel) {
                if (items.length === 0) return [emptyLabel];
                const chunks = [];
                let current = "";
                for (const item of items) {
                    const line = current ? "\n" + item : item;
                    if (current.length + line.length > 1024) {
                        chunks.push(current);
                        current = item;
                    } else {
                        current += line;
                    }
                }
                if (current) chunks.push(current);
                return chunks;
            }

            const readyChunks = chunkList(readyList, "None");
            const notAvailChunks = chunkList(notAvailList, "None");

            const checkEmbed = new EmbedBuilder()
                .setTitle("Clan Readiness Check")
                .setColor(0x3498DB)
                .setTimestamp();

            readyChunks.forEach((chunk, i) => {
                checkEmbed.addFields({
                    name: i === 0 ? "✅ Ready for War (50/50)" : "\u200b",
                    value: chunk
                });
            });

            notAvailChunks.forEach((chunk, i) => {
                checkEmbed.addFields({
                    name: i === 0 ? "❌ Not Available (< 50)" : "\u200b",
                    value: chunk
                });
            });

            return interaction.editReply({ embeds: [checkEmbed] });
        }

        if (interaction.customId === "sync_detective") {
            // Accessible by anyone — show ALL votes for every clan
            try {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            } catch (e) {
                return;
            }

            // Prune old history
            const { state: prunedDetState, expired: expiredDet } = pruneVoteHistory(state);
            state = prunedDetState;
            // Delete expired vote messages from Discord and log
            await cleanExpiredVoteMessages(context, expiredDet);

            const hasCurrentVotes = state.starters && state.starters.length > 0 && state.starters.some(s => (s.entries || []).length > 0);
            const historyEntries = (state.voteHistory || []).filter(h => h.starters && h.starters.length > 0 && h.starters.some(s => (s.entries || []).length > 0));

            if (!hasCurrentVotes && historyEntries.length === 0) {
                return interaction.editReply({ content: "No vote data available yet." }).catch(() => {});
            }

            // Build current votes embed
            const embeds = [];
            if (hasCurrentVotes) {
                const currentFields = buildDetectiveFields(state.starters, tickEmoji, questionEmoji, wrongEmoji);
                let currentEmbed = new EmbedBuilder()
                    .setTitle("🕵️ Current Vote Audit")
                    .setColor(0x2b2d31);
                let charCount = 30, fieldCount = 0;
                for (const field of currentFields) {
                    const fieldChars = field.name.length + field.value.length;
                    if (fieldCount >= 25 || charCount + fieldChars > 5800) {
                        embeds.push(currentEmbed);
                        currentEmbed = new EmbedBuilder()
                            .setTitle("🕵️ Current Vote Audit (continued)")
                            .setColor(0x2b2d31);
                        charCount = 40; fieldCount = 0;
                    }
                    currentEmbed.addFields(field);
                    charCount += fieldChars; fieldCount++;
                }
                currentEmbed.setTimestamp();
                embeds.push(currentEmbed);
            } else {
                embeds.push(new EmbedBuilder()
                    .setTitle("🕵️ Vote Audit")
                    .setDescription("No current session votes. Select a past session below.")
                    .setColor(0x2b2d31)
                    .setTimestamp());
            }

            // Build dropdown of past sessions
            const components = [];
            if (historyEntries.length > 0) {
                const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
                const sortedHistory = [...historyEntries].sort((a, b) => b.timestamp - a.timestamp);
                const options = sortedHistory.slice(0, 25).map((entry, i) => {
                    const histDate = new Date(entry.timestamp);
                    const timeAgo = Math.round((Date.now() - entry.timestamp) / (1000 * 60 * 60));
                    const dateStr = histDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                    const timeStr = histDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    const totalVotes = entry.starters.reduce((sum, s) => sum + (s.entries || []).length, 0);
                    return {
                        label: `${dateStr} ${timeStr} (~${timeAgo}h ago)`.slice(0, 100),
                        description: `${totalVotes} vote(s) across ${entry.starters.length} clan(s)`.slice(0, 100),
                        value: `${entry.timestamp}`,
                        emoji: "📜"
                    };
                });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId("sync_history_select")
                    .setPlaceholder("📜 View past vote sessions...")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(options);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            await interaction.editReply({ embeds: embeds.slice(0, 10), components }).catch(() => {});
        }

        if (interaction.customId === "sync_history_select") {
            try {
                await interaction.deferUpdate();
            } catch (e) {
                return;
            }

            const selectedTimestamp = parseInt(interaction.values[0]);
            const historyEntries = (state.voteHistory || []).filter(h => h.starters && h.starters.length > 0);
            const entry = historyEntries.find(h => h.timestamp === selectedTimestamp);

            if (!entry) {
                await interaction.editReply({ content: "⚠️ Could not find that vote session.", embeds: [], components: [] }).catch(() => {});
                return;
            }

            const histDate = new Date(entry.timestamp);
            const timeAgo = Math.round((Date.now() - entry.timestamp) / (1000 * 60 * 60));
            const dateStr = histDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
            const timeStr = histDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

            const histFields = buildDetectiveFields(entry.starters, tickEmoji, questionEmoji, wrongEmoji);
            const embeds = [];
            let histEmbed = new EmbedBuilder()
                .setTitle(`📜 Past Votes — ${dateStr} ${timeStr} (~${timeAgo}h ago)`)
                .setColor(0x5865F2);
            let charCount = 60, fieldCount = 0;

            for (const field of histFields) {
                const fieldChars = field.name.length + field.value.length;
                if (fieldCount >= 25 || charCount + fieldChars > 5800) {
                    embeds.push(histEmbed);
                    histEmbed = new EmbedBuilder()
                        .setTitle(`📜 Past Votes (continued)`)
                        .setColor(0x5865F2);
                    charCount = 40; fieldCount = 0;
                }
                histEmbed.addFields(field);
                charCount += fieldChars; fieldCount++;
            }
            histEmbed.setTimestamp(histDate);
            embeds.push(histEmbed);

            // Keep the dropdown so user can switch between sessions
            await interaction.editReply({ embeds: embeds.slice(0, 10), components: interaction.message.components }).catch(() => {});
        }

        if (["sync_yes", "sync_maybe", "sync_no"].includes(interaction.customId)) {
            try {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            } catch (e) {
                return;
            }

            const userVotes = state.voteCounts[interaction.user.id] || 0;
            const isAdmin = interaction.member && interaction.member.permissions.has("Administrator");
            if (userVotes >= 2 && !isAdmin) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription("❌ You can't use it more than 2 times you pervert, confirmation should be done at once!");
                return interaction.editReply({ embeds: [errorEmbed] }).catch(() => { });
            }

            let userClansRaw = [];
            for (const [tag, data] of Object.entries(clanRoles)) {
                if (!data.clanType || data.clanType.toLowerCase() !== "fwa") continue;

                const hasLeaderRole = data.leaderRoleId && member.roles.cache.has(data.leaderRoleId);
                if (hasLeaderRole) {
                    userClansRaw.push({ tag, nickName: data.nickName || tag });
                }
            }

            if (userClansRaw.length === 0) {
                return interaction.editReply({ content: "You don't have any valid FWA clan roles assigned to you." }).catch(() => { });
            }

            const fetchPromises = userClansRaw.map(async (c) => {
                try {
                    const clanData = await context.coc.getClan(c.tag);
                    return { tag: c.tag, name: clanData.name || c.nickName, nickName: c.nickName };
                } catch (e) {
                    return { tag: c.tag, name: c.nickName, nickName: c.nickName };
                }
            });

            const userClans = await Promise.all(fetchPromises);

            const { StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
            const actionType = interaction.customId.split("_")[1];
            const originalMsgId = interaction.message.id;

            const maxOptions = Math.min(userClans.length, 25);
            const options = userClans.slice(0, 25).map(c => {
                let opt = { label: c.name.slice(0, 100), value: c.tag };
                const eObj = emojiUtils.getEmojiObject(c.nickName.toLowerCase());
                if (eObj && eObj.id) opt.emoji = { id: eObj.id, name: eObj.name, animated: eObj.animated || false };
                return opt;
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`sync_select_${actionType}_${originalMsgId}`)
                .setPlaceholder(`Select clans to mark as ${actionType === 'yes' ? 'Able' : actionType === 'maybe' ? 'Maybe' : 'Cannot'}`)
                .setMinValues(1)
                .setMaxValues(maxOptions)
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return interaction.editReply({ components: [row] }).catch(() => { });
        }

        if (interaction.customId.startsWith("sync_select_")) {
            const parts = interaction.customId.split("_");
            const actionType = parts[2];
            const targetMsgId = parts.slice(3).join("_");

            if (state.syncExpired === true || !state.messageId || (targetMsgId && targetMsgId !== state.messageId)) {
                return interaction.editReply({ content: EXPIRED_WARNING, embeds: [], components: [] }).catch(() => {});
            }

            try {
                await interaction.deferUpdate();
            } catch (e) {
                return;
            }

            state.voteCounts[interaction.user.id] = (state.voteCounts[interaction.user.id] || 0) + 1;

            let statusEmoji = actionType === "yes" ? tickEmoji : actionType === "maybe" ? questionEmoji : wrongEmoji;
            let statusText = actionType === "yes" ? "able to start" : actionType === "maybe" ? "maybe" : "not able to start";

            const selectedTags = interaction.values;

            for (let i = 0; i < state.starters.length; i++) {
                if (!selectedTags.includes(state.starters[i].tag)) continue;
                if (!state.starters[i].entries) state.starters[i].entries = [];

                state.starters[i].entries = state.starters[i].entries.filter(e => e.userId !== interaction.user.id);
                state.starters[i].entries.push({ userId: interaction.user.id, status: statusEmoji });
            }

            fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

            let needsThread = false;
            for (const tag of selectedTags) {
                const clanState = state.starters.find(c => c.tag === tag);
                if (clanState) {
                    const hasAble = (clanState.entries || []).some(e => e.status === tickEmoji);
                    if (!hasAble) needsThread = true;
                }
            }

            try {
                const fetchId = targetMsgId || state.messageId;
                const originalMsg = fetchId
                    ? await interaction.channel.messages.fetch(fetchId).catch(() => null)
                    : null;

                if (originalMsg) {
                    let description = `**War Starters Availability Clans:**\n`;

                    state.starters.forEach((clan, i) => {
                        const entries = clan.entries || [];
                        const ableEntries = entries.filter(e => e.status === tickEmoji);
                        const otherEntries = entries.filter(e => e.status !== tickEmoji);

                        let entryStr = "";
                        if (ableEntries.length > 0) {
                            // Once someone is able, only show able players
                            entryStr = ableEntries.map(e => `<@${e.userId}> ${e.status}`).join(" ");
                        } else if (otherEntries.length > 0) {
                            // No able player yet, show unavailable/maybe entries
                            entryStr = otherEntries.map(e => `<@${e.userId}> ${e.status}`).join(" ");
                        }
                        description += `${i + 1}. ${clan.emojiStr} ${clan.name} - ${entryStr}\n`;
                    });

                    // Handle Discord's 4096 character embed description limit
                    if (description.length > 4096) {
                        description = description.slice(0, 4090) + "\n...";
                    }

                    const newEmbed = new EmbedBuilder()
                        .setColor(originalMsg.embeds[0]?.color ?? 0x2b2d31)
                        .setTitle(originalMsg.embeds[0]?.title ?? "Are you able to start?")
                        .setDescription(description);

                    await originalMsg.edit({ 
                        content: originalMsg.content || undefined,
                        embeds: [newEmbed],
                        components: originalMsg.components || []
                    }).catch(() => { });
                }
            } catch (e) {
                console.error("Failed to edit original sync message", e);
            }

            if (actionType === "yes") {
                await member.roles.add(CUSTOM_ROLE_ID).catch(() => { });
                logToChannel(context, `✅ Gave **${CUSTOM_ROLE_ID}** role to ${interaction.user.username}`);
            } else {
                await member.roles.remove(CUSTOM_ROLE_ID).catch(() => { });
                logToChannel(context, `🗑 Removed **${CUSTOM_ROLE_ID}** role from ${interaction.user.username}`);

                if (needsThread) {
                    const SYNC_CHANNEL_ID = context.config.SYNC_CHANNEL_ID;
                    const threadChannel = await interaction.client.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
                    if (threadChannel?.isTextBased()) {
                        const threadName = `${actionType === "maybe" ? "Maybe" : "Cannot"} - ${interaction.user.username}`.slice(0, 90);
                        const activeThreads = await threadChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
                        const existingThread = activeThreads.threads.find(t => t.name === threadName);
                        if (!existingThread) {
                            const thread = await threadChannel.threads.create({
                                name: threadName,
                                autoArchiveDuration: 60,
                                reason: `War start status: ${statusText}`
                            }).catch(() => null);

                            if (thread) {
                                await thread.members.add(interaction.user.id).catch(() => { });
                                await thread.send(`Hey <@${interaction.user.id}>, <@&${CUSTOM_ROLE_ID}> will assist you here.`);
                            }
                        }
                    }
                }
            }
        }

        if (interaction.customId === "sync_fillers") {
            try {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            } catch (e) {
                return;
            }

            let userClansRaw = [];
            for (const [tag, data] of Object.entries(clanRoles)) {
                if (!data.clanType || data.clanType.toLowerCase() !== "fwa") continue;
                const hasLeaderRole = data.leaderRoleId && member.roles.cache.has(data.leaderRoleId);
                if (hasLeaderRole) userClansRaw.push({ tag, nickName: data.nickName || tag });
            }

            if (userClansRaw.length === 0) {
                return interaction.editReply({ content: "You don't have any valid FWA clan roles assigned to you." }).catch(() => { });
            }

            const fillerClans = await Promise.all(userClansRaw.map(async (c) => {
                try {
                    const d = await context.coc.getClan(c.tag);
                    return { tag: c.tag, name: d.name || c.nickName, nickName: c.nickName };
                } catch (e) {
                    return { tag: c.tag, name: c.nickName, nickName: c.nickName };
                }
            }));

            const { StringSelectMenuBuilder, ActionRowBuilder: AR } = require("discord.js");
            const fillerMenu = new StringSelectMenuBuilder()
                .setCustomId(`sync_filler_select_${interaction.message.id}`)
                .setPlaceholder("Select a clan that needs fillers")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(fillerClans.slice(0, 25).map(c => {
                    let opt = { label: c.name.slice(0, 100), value: c.tag };
                    const eObj = emojiUtils.getEmojiObject(c.nickName.toLowerCase());
                    if (eObj && eObj.id) opt.emoji = { id: eObj.id, name: eObj.name, animated: eObj.animated || false };
                    return opt;
                }));

            return interaction.editReply({ components: [new AR().addComponents(fillerMenu)] }).catch(() => { });
        }

        if (interaction.customId.startsWith("sync_filler_select_")) {
            const fillerTargetMsgId = interaction.customId.replace("sync_filler_select_", "");
            if (state.syncExpired === true || !state.messageId || (fillerTargetMsgId && fillerTargetMsgId !== state.messageId)) {
                return interaction.editReply({ content: EXPIRED_WARNING, embeds: [], components: [] }).catch(() => {});
            }

            try {
                await interaction.deferUpdate();
            } catch (e) {
                return;
            }

            const selectedTag = interaction.values[0];
            const ALL_LEAD_ROLE_ID = context.config.ALL_LEAD_ROLE_ID;
            const SYNC_CHANNEL_ID = context.config.SYNC_CHANNEL_ID;

            let clanName = selectedTag;
            let clanTag = selectedTag;
            let clanMembers = null;
            try {
                const clanData = await context.coc.getClan(selectedTag);
                clanName = clanData.name || selectedTag;
                clanTag = clanData.tag || selectedTag;
                clanMembers = clanData.members ?? null;
            } catch (e) { }

            const syncChannel = await interaction.client.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
            if (!syncChannel?.isTextBased()) {
                return interaction.followUp({ content: "❌ Could not find the sync channel.", flags: [MessageFlags.Ephemeral] }).catch(() => { });
            }

            const threadName = `📣 Fillers Needed — ${clanName}`.slice(0, 90);
            const activeThreads = await syncChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            const existingThread = activeThreads.threads.find(t => t.name === threadName);
            if (existingThread) {
                return interaction.followUp({ content: `⚠️ A filler thread for **${clanName}** already exists: <#${existingThread.id}>`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
            }

            const thread = await syncChannel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                reason: `Fillers needed for ${clanName}`
            }).catch(() => null);

            if (!thread) {
                return interaction.followUp({ content: "❌ Failed to create thread.", flags: [MessageFlags.Ephemeral] }).catch(() => { });
            }

            const tagEncoded = clanTag.replace("#", "%23");
            const link = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tagEncoded}`;
            const emojiStr = (clanRoles[clanTag]?.nickName ? emojiUtils.getEmoji(clanRoles[clanTag].nickName.toLowerCase()) : null) || "";

            const neededFillers = clanMembers !== null ? 50 - clanMembers : null;

            const fillerEmbed = new EmbedBuilder()
                .setTitle(`📣 Clan Needs Fillers`)
                .setColor(0xF39C12)
                .setDescription(
                    `${emojiStr} **[${clanName}](${link})**\n` +
                    `**Tag:** \`${clanTag}\`\n` +
                    (neededFillers !== null ? `**Needed Fillers:** ${neededFillers} \`(${clanMembers}/50)\`\n` : "") +
                    `\nThis clan is looking for members to fill open spots before the war sync!`
                )
                .setTimestamp();

            const { ActionRowBuilder: AR2, ButtonBuilder: BB2, ButtonStyle: BS2 } = require("discord.js");
            const threadButtons = new AR2().addComponents(
                new BB2().setCustomId(`sync_showclan_${clanTag.replace("#", "")}`).setLabel("Show Clan").setEmoji(emojiUtils.getEmojiObject("sheild") || "🛡️").setStyle(BS2.Primary),
                new BB2().setCustomId(`sync_timer_${thread.id}`).setLabel("Timer").setEmoji(emojiUtils.getEmojiObject("alaram") || "⏰").setStyle(BS2.Secondary),
                new BB2().setCustomId(`sync_deletethread_${thread.id}`).setLabel("Delete Thread").setEmoji(emojiUtils.getEmojiObject("bluex") || "🗑️").setStyle(BS2.Danger)
            );

            const pingContent = [
                `<@${interaction.user.id}>`,
                ALL_LEAD_ROLE_ID ? `<@&${ALL_LEAD_ROLE_ID}>` : null,
                ...(context.config.STAFF_ROLE_IDS || []).filter(Boolean).map(r => `<@&${r}>`)
            ].filter(Boolean).join(" ");

            await thread.send({ content: pingContent, embeds: [fillerEmbed], components: [threadButtons] });
            await thread.members.add(interaction.user.id).catch(() => { });

            return interaction.followUp({ content: `✅ Filler thread created: <#${thread.id}>`, flags: [MessageFlags.Ephemeral] }).catch(() => { });
        }

        if (interaction.customId.startsWith("sync_showclan_")) {
            try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (e) { return; }
            const clanTagRaw = "#" + interaction.customId.replace("sync_showclan_", "");
            try {
                const clanData = await context.coc.getClan(clanTagRaw);
                const tagEncoded = clanTagRaw.replace("#", "%23");
                const link = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tagEncoded}`;
                const showEmbed = new EmbedBuilder()
                    .setTitle(clanData.name)
                    .setColor(0x3498DB)
                    .setDescription(
                        `**Tag:** \`${clanData.tag}\`\n` +
                        `**Members:** ${clanData.members}/50\n` +
                        `**Type:** ${clanData.type}\n` +
                        `**Level:** ${clanData.clanLevel}\n` +
                        `[Open in Game](${link})`
                    )
                    .setThumbnail(clanData.badgeUrls?.small || null)
                    .setTimestamp();
                return interaction.editReply({ embeds: [showEmbed] }).catch(() => { });
            } catch (e) {
                return interaction.editReply({ content: "❌ Failed to fetch clan data." }).catch(() => { });
            }
        }

        if (interaction.customId.startsWith("sync_timer_")) {
            try { await interaction.reply({ content: "⏰ Timer feature coming soon! Use this thread to coordinate manually.", flags: [MessageFlags.Ephemeral] }); } catch (e) { }
            return;
        }

        if (interaction.customId.startsWith("sync_deletethread_")) {
            const isAdmin = interaction.member && interaction.member.permissions.has("Administrator");
            const staffRoles = (context.config.STAFF_ROLE_IDS || []);
            const isStaff = staffRoles.some(roleId => roleId && member.roles.cache.has(roleId));
            if (!isAdmin && !isStaff) {
                try { await interaction.reply({ content: "❌ Only staff or admins can delete this thread.", flags: [MessageFlags.Ephemeral] }); } catch (e) { }
                return;
            }
            const threadToDelete = interaction.channel;
            try { await interaction.reply({ content: "🗑️ Deleting thread...", flags: [MessageFlags.Ephemeral] }); } catch (e) { }
            await threadToDelete.delete().catch(() => { });
            return;
        }

    }
};
