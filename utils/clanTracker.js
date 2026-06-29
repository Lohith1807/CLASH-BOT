const { EmbedBuilder } = require("discord.js");
const { getEmoji } = require("./emoji.js");

// ─────────────────────────────────────────────
//  In-memory snapshots (clanTag → memberMap)
//  Lost on restart — first cycle re-baselines, no false events
// ─────────────────────────────────────────────
const snapshots = new Map(); // clanTag → { playerTag: { name, tag, townHallLevel } }

// ─────────────────────────────────────────────
//  Entry point — called from index.js
// ─────────────────────────────────────────────
// Accepts both (client, coc, dataManager) and (client, config, coc, dataManager)
async function startClanTracker(client, cocOrConfig, cocOrData, maybeData) {
    // Detect 4-arg call: (client, config, coc, dataManager)
    const coc         = (maybeData !== undefined) ? cocOrData  : cocOrConfig;
    const dataManager = (maybeData !== undefined) ? maybeData  : cocOrData;

    console.log("📡 Clan Join/Leave Tracker started (in-memory, 1-min poll)");

    // ── Migrate old clans: add joinLeaveTracker field if missing ──────────
    try {
        const clanRoles = dataManager.getClanRoles();
        let changed = false;
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.joinLeaveTracker === undefined) {
                clanRoles[tag].joinLeaveTracker = false;
                changed = true;
            }
        }
        if (changed) {
            dataManager.saveClanRoles(clanRoles);
            console.log("📝 ClanTracker: added joinLeaveTracker field to existing clans");
        }
    } catch (err) {
        console.error("ClanTracker migration error:", err);
    }

    // First run after 30 s (let bot fully boot)
    setTimeout(() => runTracker(client, coc, dataManager), 30_000);

    // Poll every 1 minute
    setInterval(async () => {
        try   { await runTracker(client, coc, dataManager); }
        catch (err) { console.error("ClanTracker error:", err); }
    }, 60 * 1000);
}


// ─────────────────────────────────────────────
//  Main poll cycle
// ─────────────────────────────────────────────
async function runTracker(client, coc, dataManager) {
    if (!dataManager || typeof dataManager.getClanRoles !== "function") {
        console.error("ClanTracker: dataManager is invalid — check startClanTracker call in index.js");
        return;
    }
    const clanRoles = dataManager.getClanRoles();

    // Only track clans with tracker enabled AND a feed channel
    const trackedClans = Object.entries(clanRoles).filter(
        ([, info]) => info.joinLeaveTracker && info.feedChannelId
    );

    if (trackedClans.length === 0) return;

    for (const [tag, info] of trackedClans) {
        try {
            await processClan(client, coc, tag, info);
        } catch { /* per-clan errors are non-fatal */ }
    }
}

// ─────────────────────────────────────────────
//  Per-clan diff check
// ─────────────────────────────────────────────
async function processClan(client, coc, tag, info) {
    let clan;
    try { clan = await coc.getClan(tag); }
    catch { return; } // API error — skip silently

    const currentMembers = clan.memberList || [];

    // Build current member map
    const currentMap = {};
    for (const m of currentMembers) {
        currentMap[m.tag.replace("#", "").toUpperCase()] = {
            name:          m.name,
            tag:           m.tag,
            townHallLevel: m.townHallLevel,
        };
    }

    // First run — baseline only, no events
    if (!snapshots.has(tag)) {
        snapshots.set(tag, currentMap);
        return;
    }

    const previousMap = snapshots.get(tag);
    const prevKeys    = new Set(Object.keys(previousMap));
    const currKeys    = new Set(Object.keys(currentMap));

    const joined = [...currKeys].filter(k => !prevKeys.has(k));
    const left   = [...prevKeys].filter(k => !currKeys.has(k));

    // Update snapshot immediately
    snapshots.set(tag, currentMap);

    if (joined.length === 0 && left.length === 0) return;

    // Fetch feed channel
    const feedChannel = await client.channels.fetch(info.feedChannelId).catch(() => null);
    if (!feedChannel) return;

    const clanBadge = clan.badgeUrls?.small || null;
    const clanSize  = currentMembers.length;
    const clanEmoji = getClanEmoji(info.nickName);

    for (const playerTag of joined) {
        await feedChannel.send({
            embeds: [buildEmbed("join", currentMap[playerTag], clan, clanBadge, clanSize, clanEmoji)]
        }).catch(() => null);
    }

    for (const playerTag of left) {
        await feedChannel.send({
            embeds: [buildEmbed("leave", previousMap[playerTag], clan, clanBadge, clanSize, clanEmoji)]
        }).catch(() => null);
    }
}

// ─────────────────────────────────────────────
//  Embed builder
// ─────────────────────────────────────────────
function buildEmbed(type, player, clan, clanBadge, clanSize, clanEmoji) {
    const isJoin      = type === "join";
    const statusEmoji = isJoin ? getEmoji("greendot") : getEmoji("reddot");
    const statusText  = isJoin ? "Joined" : "Left";
    const color       = isJoin ? 0x2ECC71 : 0xE74C3C;
    const rarrow      = getEmoji("rarrow");

    const thEmoji = player.townHallLevel ? (getEmoji(`th${player.townHallLevel}`) || "") : "";

    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({
            name:    `${player.name} (${player.tag})`,
            iconURL: clanBadge || undefined,
        })
        .setDescription(
            `${statusEmoji} **${player.name}** ${thEmoji}\n` +
            `${rarrow} **${statusText}** ${clanEmoji} **${clan.name}** \`[${clanSize}/50]\``
        )
        .setFooter({ text: `${clan.name} • ${clan.tag}` })
        .setTimestamp();
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
const CLAN_EMOJI_MAP = {
    bb: "bb", bz: "bz", bkl: "bkl",
    tl: "tl", su: "su", ik:  "ik",
    dw: "dw", cc: "cc", bl:  "bl",
    asr: "asr", kc: "kc", bwc: "bwc", qg: "qg",
};

function getClanEmoji(nickName) {
    if (!nickName) return getEmoji("sheild");
    const key = CLAN_EMOJI_MAP[nickName.toLowerCase()];
    return key ? getEmoji(key) : getEmoji("sheild");
}

module.exports = { startClanTracker };
