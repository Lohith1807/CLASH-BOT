const fs = require("fs");
const path = require("path");
const syncStatePath = path.join(__dirname, "../../../data/syncState.json");

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
    const { ChannelType } = require("discord.js");
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
            `**War Availability Clans:**\n${fwaDesc || "No FWA Clans configured."}`
        );

    let sentMessage;
    try {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sync_yes").setLabel("Able").setEmoji(emojiUtils.getEmojiObject("gtick") || "✅").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("sync_maybe").setLabel("Maybe").setEmoji(emojiUtils.getEmojiObject("question") || "❗").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sync_no").setLabel("Cannot").setEmoji(emojiUtils.getEmojiObject("bluex") || "❌").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("sync_check").setLabel("Check Clans").setEmoji(emojiUtils.getEmojiObject("refresh") || "🔍").setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("sync_fillers").setLabel("Need Fillers").setEmoji(emojiUtils.getEmojiObject("alaram") || "📣").setStyle(ButtonStyle.Secondary)
        );

        sentMessage = await channel.send({
            content: `<@&${roleId}> Choose before 10 hours`,
            embeds: [embed],
            components: [row1, row2]
        });

        const existingState = fs.existsSync(statePath) ? (() => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { return {}; } })() : {};
        fs.writeFileSync(statePath, JSON.stringify({
            ...existingState,
            messageId: sentMessage.id,
            starters: initialStarters.map(s => ({ ...s, entries: [] })),
            voteCounts: {}
        }, null, 2));

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
    if (syncState.fillCheckMessageId) {
        const oldMsg = await syncChannel.messages.fetch(syncState.fillCheckMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
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
    const guild = client.guilds.cache.first();
    if (!guild) return;

    let syncState = {};
    if (fs.existsSync(statePath)) {
        try { syncState = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (e) { }
    }

    try {
        const channel = await guild.channels.fetch(SYNC_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        if (syncState.messageId) {
            const syncMsg = await channel.messages.fetch(syncState.messageId).catch(() => null);
            if (syncMsg && syncMsg.embeds.length > 0) {
                await syncMsg.edit({ components: [] }).catch(() => {});
            }
        }

        if (syncState.fillCheckMessageId) {
            const fillMsg = await channel.messages.fetch(syncState.fillCheckMessageId).catch(() => null);
            if (fillMsg) await fillMsg.delete().catch(() => {});
            syncState.fillCheckMessageId = null;
            fs.writeFileSync(statePath, JSON.stringify(syncState, null, 2));
        }

        let deletedThisPass;
        do {
            deletedThisPass = 0;
            const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
            if (!fetched) break;

            const toDelete = [];
            for (const [id, m] of fetched) {
                if (id === syncState.messageId) continue; // keep sync embed
                if (m.system) continue;                   // keep system messages
                toDelete.push(m);
            }

            if (toDelete.length === 0) break;

            const recentIds = toDelete
                .filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000)
                .map(m => m.id);
            const oldMsgs = toDelete
                .filter(m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

            if (recentIds.length > 0) {
                await channel.bulkDelete(recentIds, true).catch(() => {});
                deletedThisPass += recentIds.length;
            }
            for (const m of oldMsgs) {
                await m.delete().catch(() => {});
                deletedThisPass++;
            }
        } while (deletedThisPass > 0);

        await logToChannel(context, "🧹 Prep day: removed buttons from sync embed, deleted fill check & other messages.");
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
            const activeThreads = await channel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            for (const thread of activeThreads.threads.values()) {
                await thread.delete().catch(() => { });
            }

            const archivedThreads = await channel.threads.fetchArchived().catch(() => ({ threads: new Map() }));
            for (const thread of archivedThreads.threads.values()) {
                await thread.delete().catch(() => { });
            }
        } catch (threadErr) {
            console.error("Failed to delete threads in sync channel:", threadErr);
        }

        try {
            let state = {};
            if (fs.existsSync(syncStatePath)) {
                try { state = JSON.parse(fs.readFileSync(syncStatePath, "utf8")); } catch (e) { }
            }
            const lastWarId = state.lastWarId || null;
            fs.writeFileSync(syncStatePath, JSON.stringify({ lastWarId }, null, 2));
        } catch (e) { }

        await logToChannel(context, "🧼 Cleaned up threads and reset sync state (messages kept).");
    } catch (err) {
        console.error("Error during sync channel cleanup:", err);
    }
}

async function checkWarStatus(context) {
    const { coc, config, client } = context;
    const CLAN_TAG = "#CYQVL002";
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

        if (data.state === "preparation") {
            const prepId = `${baseWarId}-prep`;
            if (syncState.prepCleanId !== prepId) {
                syncState.prepCleanId = prepId;
                fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
                await logToChannel(context, "📋 Preparation day detected! Clearing sync channel messages...");
                await cleanSyncMessages(context);
            }
        }

        if (hoursLeft <= 8 && hoursLeft > 7.9) {
            const warId = `${baseWarId}-8hr`;
            if (lastWarId !== warId) {
                syncState.lastWarId = warId;
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
                await logToChannel(context, "🏁 War ended! Cleaning sync channel threads and resetting state...");
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
        if (message?.deletable) await message.delete().catch(() => { });
        await sendSyncMessage(context, message);
    },
    setupWarChecker(client, config, coc, emojiUtils, EmbedBuilder) {
        const context = { client, config, coc, emoji: emojiUtils, EmbedBuilder };
        setInterval(() => checkWarStatus(context), 5 * 60 * 1000);
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

        if (interaction.customId === "sync_check") {
            try {
                await interaction.deferReply({ ephemeral: true });
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

        if (["sync_yes", "sync_maybe", "sync_no"].includes(interaction.customId)) {
            try {
                await interaction.deferReply({ ephemeral: true });
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
            try {
                await interaction.deferUpdate();
            } catch (e) {
                return;
            }

            state.voteCounts[interaction.user.id] = (state.voteCounts[interaction.user.id] || 0) + 1;

            const parts = interaction.customId.split("_");
            const actionType = parts[2];
            const targetMsgId = parts.slice(3).join("_");

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
                        const entryStr = entries.length > 0
                            ? entries.map(e => `<@${e.userId}> ${e.status}`).join(" ")
                            : "";
                        description += `${i + 1}. ${clan.emojiStr} ${clan.name} - ${entryStr}\n`;
                    });

                    const newEmbed = new EmbedBuilder()
                        .setColor(originalMsg.embeds[0]?.color ?? 0x2b2d31)
                        .setTitle(originalMsg.embeds[0]?.title ?? "Are you able to start?")
                        .setDescription(description);

                    await originalMsg.edit({ embeds: [newEmbed] }).catch(() => { });
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
                await interaction.deferReply({ ephemeral: true });
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
                return interaction.followUp({ content: "❌ Could not find the sync channel.", ephemeral: true }).catch(() => { });
            }

            const threadName = `📣 Fillers Needed — ${clanName}`.slice(0, 90);
            const activeThreads = await syncChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
            const existingThread = activeThreads.threads.find(t => t.name === threadName);
            if (existingThread) {
                return interaction.followUp({ content: `⚠️ A filler thread for **${clanName}** already exists: <#${existingThread.id}>`, ephemeral: true }).catch(() => { });
            }

            const thread = await syncChannel.threads.create({
                name: threadName,
                autoArchiveDuration: 1440,
                reason: `Fillers needed for ${clanName}`
            }).catch(() => null);

            if (!thread) {
                return interaction.followUp({ content: "❌ Failed to create thread.", ephemeral: true }).catch(() => { });
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

            return interaction.followUp({ content: `✅ Filler thread created: <#${thread.id}>`, ephemeral: true }).catch(() => { });
        }

        if (interaction.customId.startsWith("sync_showclan_")) {
            try { await interaction.deferReply({ ephemeral: true }); } catch (e) { return; }
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
            try { await interaction.reply({ content: "⏰ Timer feature coming soon! Use this thread to coordinate manually.", ephemeral: true }); } catch (e) { }
            return;
        }

        if (interaction.customId.startsWith("sync_deletethread_")) {
            const isAdmin = interaction.member && interaction.member.permissions.has("Administrator");
            const staffRoles = (context.config.STAFF_ROLE_IDS || []);
            const isStaff = staffRoles.some(roleId => roleId && member.roles.cache.has(roleId));
            if (!isAdmin && !isStaff) {
                try { await interaction.reply({ content: "❌ Only staff or admins can delete this thread.", ephemeral: true }); } catch (e) { }
                return;
            }
            const threadToDelete = interaction.channel;
            try { await interaction.reply({ content: "🗑️ Deleting thread...", ephemeral: true }); } catch (e) { }
            await threadToDelete.delete().catch(() => { });
            return;
        }

    }
};
