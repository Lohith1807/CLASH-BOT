const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const LEAVER_TIMESTAMPS_PATH = path.join(__dirname, "../data/leaver_timestamps.json");

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;


function getLeaverTimestamps() {
    if (!fs.existsSync(LEAVER_TIMESTAMPS_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(LEAVER_TIMESTAMPS_PATH, "utf8"));
    } catch (e) {
        return {};
    }
}

function saveLeaverTimestamps(data) {
    try {
        fs.writeFileSync(LEAVER_TIMESTAMPS_PATH, JSON.stringify(data, null, 2));
    } catch (e) { }
}


async function startAutoRoleManager(client, config, coc, dataManager) {
    console.log("🛡️ Auto-Role Manager started (removal-only mode, 2-day grace period)");

    setInterval(async () => {
        try {
            await checkAutoRoles(client, config, coc, dataManager);
        } catch (err) {
            console.error("AutoRoleManager error:", err);
        }
    }, 2 * 60 * 1000);

    setTimeout(() => checkAutoRoles(client, config, coc, dataManager), 20000);
}


async function checkAutoRoles(client, config, coc, dataManager) {
    const LOG_CHANNEL_ID = config.AUTOROLE_LOG_CHANNEL_ID || process.env.AUTOROLE_LOG_CHANNEL_ID;
    if (!LOG_CHANNEL_ID) return;

    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    const clanRoles = dataManager.getClanRoles();
    const userData = dataManager.getUserData();

    const monitoredClans = {};
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.roleId) {
            monitoredClans[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase() };
        }
    }

    const currentClanMembers = {}; // clanTag -> Set of player tags (uppercase, no #)
    await Promise.all(
        Object.keys(monitoredClans).map(async (clanTag) => {
            try {
                const clan = await coc.getClan(clanTag);
                currentClanMembers[clanTag] = new Set(
                    (clan.memberList || []).map(m => m.tag.replace("#", "").toUpperCase())
                );
            } catch (e) {
                currentClanMembers[clanTag] = null; // API error, skip this clan
            }
        })
    );

    const tagToUser = {};
    for (const [userId, accounts] of Object.entries(userData)) {
        if (Array.isArray(accounts)) {
            accounts.forEach(acc => {
                if (acc.tag) tagToUser[acc.tag.replace("#", "").toUpperCase()] = userId;
            });
        }
    }

    const leaverTimestamps = getLeaverTimestamps();
    const now = Date.now();

    for (const [userId, accounts] of Object.entries(userData)) {
        if (!Array.isArray(accounts) || accounts.length === 0) continue;

        try {
            await processUser({
                client, config, coc, dataManager,
                userId, accounts,
                monitoredClans, currentClanMembers,
                leaverTimestamps, now, logChannel
            });
        } catch (err) {
        }
    }

    const allUserIds = new Set(Object.keys(userData));
    for (const key of Object.keys(leaverTimestamps)) {
        const uid = key.split(":")[0];
        if (!allUserIds.has(uid)) delete leaverTimestamps[key];
    }

    saveLeaverTimestamps(leaverTimestamps);
}


async function processUser({
    client, config, coc, dataManager,
    userId, accounts,
    monitoredClans, currentClanMembers,
    leaverTimestamps, now, logChannel
}) {
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const guild = await client.guilds.fetch(config.GUILD_ID).catch(() => null);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return; // User not in server, skip

    const accountClanMap = {}; // playerTag -> clanTag | null

    for (const acc of accounts) {
        const playerTag = acc.tag.replace("#", "").toUpperCase();
        let foundClan = null;

        for (const [clanTag, members] of Object.entries(currentClanMembers)) {
            if (members === null) continue; // API error clan, skip
            if (members.has(playerTag)) {
                foundClan = clanTag;
                break;
            }
        }
        accountClanMap[playerTag] = foundClan;
    }

    const shouldHaveRoleIds = new Set();
    for (const clanTag of Object.values(accountClanMap)) {
        if (clanTag && monitoredClans[clanTag] && monitoredClans[clanTag].roleId) {
            shouldHaveRoleIds.add(monitoredClans[clanTag].roleId);
        }
    }

    const allManagedRoleIds = new Set(
        Object.values(monitoredClans).filter(c => c.roleId).map(c => c.roleId)
    );

    const rolesToRemove = [];
    const rolesToAdd = [];

    for (const roleId of allManagedRoleIds) {
        if (!member.roles.cache.has(roleId)) continue; // They don't have it, skip

        if (shouldHaveRoleIds.has(roleId)) {
            const clanTag = Object.keys(monitoredClans).find(
                t => monitoredClans[t].roleId === roleId
            );
            if (clanTag) {
                const key = `${userId}:${clanTag}`;
                if (leaverTimestamps[key]) {
                    delete leaverTimestamps[key];
                }
            }
        } else {
            const clanTag = Object.keys(monitoredClans).find(
                t => monitoredClans[t].roleId === roleId
            );
            if (!clanTag) continue;

            if (currentClanMembers[clanTag] === null) continue;

            const key = `${userId}:${clanTag}`;
            if (!leaverTimestamps[key]) {
                leaverTimestamps[key] = now;
            } else if (now - leaverTimestamps[key] >= TWO_DAYS_MS) {
                rolesToRemove.push({ roleId, clanTag });
                delete leaverTimestamps[key]; // Clean up after scheduling removal
            }
        }
    }

    if (GLOBAL_ROLE_ID) {
        const remainingRoleIds = new Set(
            [...allManagedRoleIds].filter(id => member.roles.cache.has(id))
        );
        for (const { roleId } of rolesToRemove) remainingRoleIds.delete(roleId);
        for (const roleId of shouldHaveRoleIds) remainingRoleIds.add(roleId);

        if (remainingRoleIds.size === 0) {
            if (!member.roles.cache.has(GLOBAL_ROLE_ID)) {
                rolesToAdd.push(GLOBAL_ROLE_ID);
            }
        } else {
            if (member.roles.cache.has(GLOBAL_ROLE_ID)) {
                rolesToRemove.push({ roleId: GLOBAL_ROLE_ID, clanTag: null });
            }
        }
    }

    const rolesRemovedNames = [];
    const rolesAddedNames = [];

    for (const { roleId } of rolesToRemove) {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => null);
            rolesRemovedNames.push(`<@&${roleId}>`);
        }
    }
    for (const roleId of rolesToAdd) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => null);
            rolesAddedNames.push(`<@&${roleId}>`);
        }
    }

    if (rolesRemovedNames.length > 0 || rolesAddedNames.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Auto-Role Removal")
            .setColor(0xE74C3C)
            .setDescription(`**User:** <@${userId}> (${member.user.tag})`)
            .setTimestamp();

        if (rolesRemovedNames.length > 0) {
            embed.addFields({ name: "Roles Removed", value: rolesRemovedNames.join(", "), inline: true });
        }
        if (rolesAddedNames.length > 0) {
            embed.addFields({ name: "Roles Added (Global)", value: rolesAddedNames.join(", "), inline: true });
        }

        const clanNames = rolesToRemove
            .filter(r => r.clanTag)
            .map(r => monitoredClans[r.clanTag]?.nickName || r.clanTag)
            .join(", ");
        if (clanNames) {
            embed.addFields({ name: "Left Clan(s)", value: clanNames, inline: false });
        }

        await logChannel.send({ embeds: [embed] }).catch(() => null);
    }
}


async function syncUser(client, config, coc, dataManager, userId, monitoredClans, logChannel) {
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const guild = await client.guilds.fetch(config.GUILD_ID).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const userData = dataManager.getUserData();
    const userAccounts = userData[userId] || [];
    if (userAccounts.length === 0) return;

    const fetchPromises = userAccounts.map(acc => coc.getPlayer(acc.tag).catch(() => null));
    const players = await Promise.all(fetchPromises);
    const validPlayers = players.filter(p => p !== null);
    if (validPlayers.length === 0) return;

    const inMonitoredClans = validPlayers.filter(p => p.clan && monitoredClans[p.clan.tag.toUpperCase()]);
    const currentClanTags = [...new Set(inMonitoredClans.map(p => p.clan.tag.toUpperCase()))];

    const shouldHaveRoleIds = new Set();
    currentClanTags.forEach(tag => {
        if (monitoredClans[tag]?.roleId) shouldHaveRoleIds.add(monitoredClans[tag].roleId);
    });

    const managedRoleIds = new Set(Object.values(monitoredClans).filter(c => c.roleId).map(c => c.roleId));
    const rolesToAdd = [];
    const rolesToRemove = [];

    managedRoleIds.forEach(roleId => {
        if (shouldHaveRoleIds.has(roleId)) {
            rolesToAdd.push(roleId);
        } else {
            rolesToRemove.push(roleId);
        }
    });

    if (GLOBAL_ROLE_ID) {
        if (currentClanTags.length === 0) {
            rolesToAdd.push(GLOBAL_ROLE_ID);
        } else {
            rolesToRemove.push(GLOBAL_ROLE_ID);
        }
    }

    const finalRolesToAdd = [...new Set(rolesToAdd)];
    const finalRolesToRemove = [...new Set(rolesToRemove)].filter(r => !finalRolesToAdd.includes(r));

    const rolesAddedNames = [];
    const rolesRemovedNames = [];

    for (const roleId of finalRolesToAdd) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => null);
            rolesAddedNames.push(`<@&${roleId}>`);
        }
    }
    for (const roleId of finalRolesToRemove) {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => null);
            rolesRemovedNames.push(`<@&${roleId}>`);
        }
    }

    const result = {
        rolesAdded: rolesAddedNames,
        rolesRemoved: rolesRemovedNames,
        currentClanTags,
        hasChanges: rolesAddedNames.length > 0 || rolesRemovedNames.length > 0
    };

    if (result.hasChanges && logChannel) {
        const embed = new EmbedBuilder()
            .setTitle("🛡️ Manual Role Sync")
            .setColor(0x3498DB)
            .setDescription(`**User:** <@${userId}> (${member.user.tag})`)
            .addFields({
                name: "Current Clans",
                value: currentClanTags.length > 0
                    ? currentClanTags.map(t => monitoredClans[t]?.nickName || t).join(", ")
                    : "None (Global)",
                inline: false
            })
            .setTimestamp();

        if (rolesAddedNames.length > 0) embed.addFields({ name: "Roles Added", value: rolesAddedNames.join(", "), inline: true });
        if (rolesRemovedNames.length > 0) embed.addFields({ name: "Roles Removed", value: rolesRemovedNames.join(", "), inline: true });

        await logChannel.send({ embeds: [embed] }).catch(() => null);
        result.embed = embed;
    }

    return result;
}

module.exports = { startAutoRoleManager, syncUser };
