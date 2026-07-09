const fs   = require("fs");
const path = require("path");
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { getEmoji, getLeagueEmoji } = require("./emoji.js");

// ─────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────
const LEAVER_TIMESTAMPS_PATH = path.join(__dirname, "../data/leaver_timestamps.json");
const TWO_DAYS_MS            = 2 * 24 * 60 * 60 * 1000;

// Nickname (lowercase) → emoji key mapping
const CLAN_EMOJI_MAP = {
    bb:  "bb",
    bz:  "bz",
    bkl: "bkl",
    tl:  "tl",
    su:  "su",
    ik:  "ik",
    dw:  "dw",
    cc:  "cc",
    bl:  "bl",
    asr: "asr",
    kc:  "kc",
    bwc: "bwc",
    qg:  "qg",
};

// ─────────────────────────────────────────────
//  Leaver timestamp helpers
// ─────────────────────────────────────────────
function getLeaverTimestamps() {
    if (!fs.existsSync(LEAVER_TIMESTAMPS_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(LEAVER_TIMESTAMPS_PATH, "utf8")); }
    catch { return {}; }
}

function saveLeaverTimestamps(data) {
    try { fs.writeFileSync(LEAVER_TIMESTAMPS_PATH, JSON.stringify(data, null, 2)); }
    catch { /* silent */ }
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Returns only clans that have roleId AND autoRole: true */
function buildMonitoredClans(clanRoles) {
    const out = {};
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.roleId && info.autoRole) {
            out[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase() };
        }
    }
    return out;
}

/** Returns the clan emoji string for a given nickName, or a fallback shield */
function clanEmoji(nickName) {
    if (!nickName) return getEmoji("sheild");
    const key = CLAN_EMOJI_MAP[nickName.toLowerCase()];
    return key ? getEmoji(key) : getEmoji("sheild");
}

/** Format ms remaining as "Xd Yh" */
function formatTimeLeft(startTs, now) {
    const left = TWO_DAYS_MS - (now - startTs);
    if (left <= 0) return "0h";
    const hours = Math.floor(left / (60 * 60 * 1000));
    const days  = Math.floor(hours / 24);
    const remH  = hours % 24;
    return days > 0 ? `${days}d ${remH}h` : `${remH}h`;
}

// ─────────────────────────────────────────────
//  Entry point — called from index.js
// ─────────────────────────────────────────────
async function startAutoRoleManager(client, config, coc, dataManager) {
    console.log("🛡️ Auto-Role Manager started (notification-only mode, 2-day grace period)");

    // First run after 20 s (let bot fully boot)
    setTimeout(() => checkAutoRoles(client, config, coc, dataManager), 20_000);

    // Recurring check every 2 minutes
    setInterval(async () => {
        try   { await checkAutoRoles(client, config, coc, dataManager); }
        catch (err) { console.error("AutoRoleManager error:", err); }
    }, 2 * 60 * 1000);
}

// ─────────────────────────────────────────────
//  Main scheduled check
// ─────────────────────────────────────────────
async function checkAutoRoles(client, config, coc, dataManager) {
    const LOG_CHANNEL_ID = config.AUTOROLE_LOG_CHANNEL_ID || process.env.AUTOROLE_LOG_CHANNEL_ID;
    if (!LOG_CHANNEL_ID) return;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    const clanRoles      = dataManager.getClanRoles();
    const userData       = dataManager.getUserData();
    const monitoredClans = buildMonitoredClans(clanRoles);

    // Fetch live member lists for every monitored clan (parallel)
    const currentClanMembers = {}; // clanTag → Set<playerTag> | null (API error)
    await Promise.all(
        Object.keys(monitoredClans).map(async (clanTag) => {
            try {
                const clan = await coc.getClan(clanTag);
                currentClanMembers[clanTag] = new Set(
                    (clan.memberList || []).map(m => m.tag.replace("#", "").toUpperCase())
                );
            } catch {
                currentClanMembers[clanTag] = null;
            }
        })
    );

    const leaverTimestamps = getLeaverTimestamps();
    const now              = Date.now();

    // Process every registered user
    for (const [userId, accounts] of Object.entries(userData)) {
        if (!Array.isArray(accounts) || accounts.length === 0) continue;
        try {
            await processUser({
                client, config, userId, accounts,
                monitoredClans, currentClanMembers,
                leaverTimestamps, now, logChannel, coc
            });
        } catch { /* per-user errors are non-fatal */ }
    }

    // Remove timestamps for users who are no longer registered
    const registeredIds = new Set(Object.keys(userData));
    for (const key of Object.keys(leaverTimestamps)) {
        if (!registeredIds.has(key.split(":")[0])) delete leaverTimestamps[key];
    }

    saveLeaverTimestamps(leaverTimestamps);
}

// ─────────────────────────────────────────────
//  Per-user processing (auto cycle)
// ─────────────────────────────────────────────
async function processUser({
    client, config, userId, accounts,
    monitoredClans, currentClanMembers,
    leaverTimestamps, now, logChannel, coc
}) {
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const guild  = await client.guilds.fetch(config.GUILD_ID).catch(() => null);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return; // not in server

    // ── Step 1: Map each linked account to the clan it's currently in ──────
    // accountClanMap: playerTag → { clanTag, name, rawTag }
    const accountClanMap = {};
    for (const acc of accounts) {
        const playerTag = acc.tag.replace("#", "").toUpperCase();
        let foundClan   = null;
        for (const [clanTag, members] of Object.entries(currentClanMembers)) {
            if (members === null) continue;
            if (members.has(playerTag)) { foundClan = clanTag; break; }
        }
        accountClanMap[playerTag] = {
            clanTag:  foundClan,
            name:     acc.name || playerTag,   // in-game name stored in userData
            rawTag:   acc.tag,                 // original tag with #
        };
    }

    // ── Step 2: Determine which role IDs the user deserves right now ────────
    const shouldHaveRoleIds      = new Set();
    const currentClanTagsForUser = new Set();
    // Build clanTag → [players] map for quick lookup in the log
    const clanToPlayers = {}; // clanTag → [{ name, rawTag }]
    for (const { clanTag, name, rawTag } of Object.values(accountClanMap)) {
        if (clanTag && monitoredClans[clanTag]?.roleId) {
            shouldHaveRoleIds.add(monitoredClans[clanTag].roleId);
            currentClanTagsForUser.add(clanTag);
        }
        // Track which players belong to which clan (including null = no clan)
        if (clanTag) {
            if (!clanToPlayers[clanTag]) clanToPlayers[clanTag] = [];
            clanToPlayers[clanTag].push({ name, rawTag });
        }
    }

    // Also track players NOT in any monitored clan — they could be the ones who left
    // We'll attach them to whichever clan role is being stripped
    const playersNotInAnyClan = Object.values(accountClanMap)
        .filter(a => !a.clanTag)
        .map(a => ({ name: a.name, rawTag: a.rawTag }));

    // ── Step 3: Clear grace timers for clans the user has REJOINED ─────────
    // Do this regardless of whether they currently hold the Discord role.
    for (const clanTag of currentClanTagsForUser) {
        delete leaverTimestamps[`${userId}:${clanTag}`];
    }

    // ── Step 4: Evaluate every managed role for Notifications ──────────────
    const allManagedRoleIds = new Set(
        Object.values(monitoredClans).filter(c => c.roleId).map(c => c.roleId)
    );

    for (const roleId of allManagedRoleIds) {
        if (!member.roles.cache.has(roleId)) {
            // They don't hold this role — clean up any stale timestamp
            const clanTag = Object.keys(monitoredClans).find(t => monitoredClans[t].roleId === roleId);
            if (clanTag) delete leaverTimestamps[`${userId}:${clanTag}`];
            continue;
        }

        if (shouldHaveRoleIds.has(roleId)) continue; // Still in that clan, keep it

        // They have the role but are no longer in the clan → grace period logic
        const clanTag = Object.keys(monitoredClans).find(t => monitoredClans[t].roleId === roleId);
        if (!clanTag) continue;
        if (currentClanMembers[clanTag] === null) continue; // API error — never penalise on bad data

        const key = `${userId}:${clanTag}`;
        if (!leaverTimestamps[key]) {
            // Grace period STARTS now
            leaverTimestamps[key] = now;
        } else if (leaverTimestamps[key] === "notified") {
            // Already notified leaders
            continue;
        } else if (now - leaverTimestamps[key] >= TWO_DAYS_MS) {
            // Grace period OVER — send notification
            const leavingPlayers = playersNotInAnyClan.length > 0
                ? playersNotInAnyClan
                : (clanToPlayers[clanTag] || []);
            
            leaverTimestamps[key] = "notified";
            
            const info = monitoredClans[clanTag];
            const leadChannelId = info.leadChannelId;
            if (leadChannelId) {
                const leadChannel = await client.channels.fetch(leadChannelId).catch(() => null);
                if (leadChannel) {
                    const clanEmojiStr = clanEmoji(info.nickName);
                    
                    const pName = leavingPlayers.length > 0 ? leavingPlayers[0].name : member.user.username;
                    const pTag = leavingPlayers.length > 0 ? leavingPlayers[0].rawTag : "Unknown";
                    
                    let leagueTier = "Unranked";
                    let joinedClan = "None";
                    let leagueEmoji = "🏆";
                    
                    if (pTag !== "Unknown") {
                        try {
                            const pData = await coc.getPlayer(pTag);
                            if (pData) {
                                leagueTier = pData.leagueTier ? pData.leagueTier.name : "Unranked";
                                joinedClan = pData.clan ? `${pData.clan.name} (${pData.clan.tag})` : "None";
                                leagueEmoji = getLeagueEmoji(leagueTier);
                            }
                        } catch (e) {
                            console.error("Failed to fetch player for auto role notification", e.message);
                        }
                    }
                    
                    const embed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle(`${getEmoji("rarroww")} ${pName} - ${pTag}`)
                        .setDescription(
                            `**In Game Name:** ${pName}\n` +
                            `**League Tier:** ${leagueEmoji} ${leagueTier}\n` +
                            `**Left Clan:** ${clanEmojiStr} **${info.nickName || clanTag}**\n` +
                            `**Joined Clan:** ${joinedClan}\n` +
                            `**Discord:** ${member.user.username}\n` +
                            `**Status:** Left 2 days ago\n` +
                            `**Action:** Do you want to send him to re-apply or just ignore him?\n` +
                            `*(Use \`;re @user\` to process the leave)*`
                        )
                        .setTimestamp();

                    const contactBtn = new ButtonBuilder()
                        .setLabel("Contact person")
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/users/${member.id}`);
                    const row = new ActionRowBuilder().addComponents(contactBtn);
                        
                    await leadChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
                }
            }
        }
    }
}

// ─────────────────────────────────────────────
//  Log embed — auto removal
// ─────────────────────────────────────────────
async function sendAutoRemovalLog(logChannel, member, removedClanRoles, monitoredClans) {
    const sh   = getEmoji("sheild");
    const rd   = getEmoji("reddot");
    const ra   = getEmoji("rarrow");
    const tick = getEmoji("tickred");
    const mem  = getEmoji("mem");

    const clanLines = removedClanRoles.map(({ roleId, clanTag, reason, players }) => {
        const info     = monitoredClans[clanTag];
        const emoji    = clanEmoji(info?.nickName);
        const clanName = info?.nickName || clanTag;

        // Player line — show in-game name + tag for each account that left
        const playerLine = players.length > 0
            ? players.map(p => `${mem} **${p.name}** (\`${p.rawTag}\`)`).join("\n")
            : `${mem} Unknown account`;

        return [
            `${rd} ${emoji} **${clanName}** — <@&${roleId}>`,
            `${ra} Reason: \`${reason}\``,
            `${ra} Account(s) that left:\n${playerLine}`,
        ].join("\n");
    }).join("\n\n");

    const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setAuthor({
            name: member.user.tag,
            iconURL: member.user.displayAvatarURL({ dynamic: true }),
        })
        .setTitle(`${sh} Auto Role Removal`)
        .setDescription(
            `**Member:** <@${member.id}>\n\n` +
            `${tick} **Clan Role(s) Removed:**\n\n${clanLines}`
        )
        .setFooter({ text: "Triggered by: Auto-Role Manager (2-day timer)" })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => null);
}

// ─────────────────────────────────────────────
//  syncUser — called by /autorolerefresh
//  (No grace period — immediate sync)
// ─────────────────────────────────────────────
async function syncUser(client, config, coc, dataManager, userId, monitoredClans, logChannel) {
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const guild  = await client.guilds.fetch(config.GUILD_ID).catch(() => null);
    if (!guild) return null;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return null;

    const userData     = dataManager.getUserData();
    const userAccounts = userData[userId] || [];
    if (userAccounts.length === 0) return null;

    // Fetch live player data
    const players      = await Promise.all(userAccounts.map(acc => coc.getPlayer(acc.tag).catch(() => null)));
    const validPlayers = players.filter(Boolean);
    if (validPlayers.length === 0) return null;

    // Which monitored clans is the user currently in?
    const inMonitoredClans = validPlayers.filter(p => p.clan && monitoredClans[p.clan.tag.toUpperCase()]);
    const currentClanTags  = [...new Set(inMonitoredClans.map(p => p.clan.tag.toUpperCase()))];

    const shouldHaveRoleIds = new Set();
    const managedRoleIds = new Set();

    for (const p of inMonitoredClans) {
        const clanTag = p.clan.tag.toUpperCase();
        if (monitoredClans[clanTag]?.roleId) {
            shouldHaveRoleIds.add(monitoredClans[clanTag].roleId);
        }
        if ((p.role === 'coLeader' || p.role === 'leader') && monitoredClans[clanTag]?.leaderRoleId) {
            shouldHaveRoleIds.add(monitoredClans[clanTag].leaderRoleId);
        }
    }

    for (const c of Object.values(monitoredClans)) {
        if (c.roleId) managedRoleIds.add(c.roleId);
        if (c.leaderRoleId) managedRoleIds.add(c.leaderRoleId);
    }

    const rolesToAdd    = [];
    const rolesToRemove = []; // { roleId, clanTag }

    for (const roleId of managedRoleIds) {
        if (shouldHaveRoleIds.has(roleId)) {
            rolesToAdd.push(roleId);
        } else {
            const clanTag = Object.keys(monitoredClans).find(t => monitoredClans[t].roleId === roleId || monitoredClans[t].leaderRoleId === roleId);
            rolesToRemove.push({ roleId, clanTag: clanTag || null });
        }
    }

    if (GLOBAL_ROLE_ID) {
        const isExemptFromGlobal = 
            (config.VIP_USER_IDS && config.VIP_USER_IDS.includes(userId)) ||
            (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id)));

        if (currentClanTags.length === 0) {
            if (!isExemptFromGlobal) rolesToAdd.push(GLOBAL_ROLE_ID);
        } else {
            rolesToRemove.push({ roleId: GLOBAL_ROLE_ID, clanTag: null });
        }
    }

    const finalAdd    = [...new Set(rolesToAdd)];
    const finalRemove = [...new Set(rolesToRemove.map(r => r.roleId))]
        .filter(id => !finalAdd.includes(id))
        .map(id => ({ roleId: id, clanTag: rolesToRemove.find(r => r.roleId === id)?.clanTag || null }));

    const rolesAdded   = [];
    const rolesRemoved = [];

    for (const roleId of finalAdd) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => null);
            rolesAdded.push(`<@&${roleId}>`);
        }
    }
    for (const { roleId } of finalRemove) {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => null);
            rolesRemoved.push(`<@&${roleId}>`);
        }
    }

    const hasChanges = rolesAdded.length > 0 || rolesRemoved.length > 0;

    // Log only if something actually changed
    if (hasChanges && logChannel) {
        const sh  = getEmoji("sheild");
        const gd  = getEmoji("greendot");
        const rd  = getEmoji("reddot");
        const ra  = getEmoji("rarrow");
        const ref = getEmoji("refresh");

        const fields = [];

        if (rolesAdded.length > 0) {
            fields.push({ name: `${gd} Roles Added`, value: rolesAdded.join("\n"), inline: true });
        }
        if (rolesRemoved.length > 0) {
            fields.push({ name: `${rd} Roles Removed`, value: rolesRemoved.join("\n"), inline: true });
        }

        const clanValue = currentClanTags.length > 0
            ? currentClanTags.map(t => {
                const info = monitoredClans[t];
                return `${clanEmoji(info?.nickName)} ${info?.nickName || t}`;
              }).join("\n")
            : "No monitored clan";

        fields.push({ name: `${ra} Current Clans`, value: clanValue, inline: false });

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setAuthor({
                name: `${member.user.tag}`,
                iconURL: member.user.displayAvatarURL({ dynamic: true }),
            })
            .setTitle(`${ref} Manual Role Sync`)
            .setDescription(`**Member:** <@${member.id}>`)
            .addFields(fields)
            .setFooter({ text: "Triggered by: /autorolerefresh" })
            .setTimestamp();

        await logChannel.send({ embeds: [embed] }).catch(() => null);

        return { rolesAdded, rolesRemoved, currentClanTags, hasChanges, embed };
    }

    return { rolesAdded, rolesRemoved, currentClanTags, hasChanges };
}

// ─────────────────────────────────────────────
module.exports = { startAutoRoleManager, syncUser };
