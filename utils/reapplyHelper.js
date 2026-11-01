const { EmbedBuilder } = require("discord.js");

/**
 * Process clan leave and assign re-apply roles for a member.
 * Shared logic matching commands/discord/tickets/reapply.js.
 *
 * @param {Object} options
 * @param {import('discord.js').GuildMember} options.member - The Discord GuildMember
 * @param {Object} options.clanInfo - Clan info object for the clan being left { roleId, leaderRoleId, nickName, tag }
 * @param {string} options.reason - Reason for re-applying
 * @param {import('discord.js').User} options.executorUser - Discord user executing the reapply
 * @param {Object} options.context - { config, data, coc, emoji }
 * @returns {Promise<{ success: boolean, reapplyGiven: boolean, message: string }>}
 */
async function processMemberReapply({
    member,
    clanInfo,
    reason,
    executorUser,
    context
}) {
    const { config, data, coc, emoji } = context;
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || process.env.REAPPLY_ROLE_ID || "1523186839509401701";
    const TARGET_CHANNEL_ID = config.REAPPLY_CHANNEL_ID || process.env.REAPPLY_CHANNEL_ID || "1523186791950323824";
    const FAMILY_ROLE_ID = config.FAMILY_ROLE_ID || "1528073821343584387";

    const userData = data.getUserData();
    const userAccounts = Array.isArray(userData[member.id]) ? userData[member.id] : [];

    const clanRoles = data.getClanRoles();
    const monitoredClans = {};
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.roleId) {
            monitoredClans[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase() };
        }
    }

    // Fetch live player data for linked accounts (if any)
    const validPlayers = [];
    for (const acc of userAccounts) {
        try {
            const p = await coc.getPlayer(acc.tag);
            if (p) validPlayers.push({ ...p, linkedName: acc.name });
        } catch (err) {
            // Player may have invalid tag or API rate limit
        }
    }

    // Check which monitored clans they are currently in
    const clansStillIn = [];
    for (const p of validPlayers) {
        if (p.clan) {
            const cTag = p.clan.tag.toUpperCase();
            if (monitoredClans[cTag]) {
                clansStillIn.push(monitoredClans[cTag]);
            }
        }
    }

    const leavingTag = (clanInfo && clanInfo.tag ? clanInfo.tag : "").toUpperCase();
    const rolesToRemove = [];
    if (clanInfo && clanInfo.roleId) {
        rolesToRemove.push(clanInfo);
    }

    // Determine if they still have accounts in other family clans (excluding the clan being left)
    const otherClansStillIn = clansStillIn.filter(c => c.tag !== leavingTag);

    // Save reason to data store
    const clanNamesStr = (clanInfo && (clanInfo.nickName || clanInfo.tag)) || "Clan";
    const reasonsData = data.getReapplyReasons();
    if (!reasonsData[member.id]) reasonsData[member.id] = [];

    reasonsData[member.id].push({
        reason: reason,
        timestamp: Math.floor(Date.now() / 1000),
        addedBy: executorUser.id,
        clanName: clanNamesStr,
        status: "ADDED"
    });
    data.saveReapplyReasons(reasonsData);

    if (otherClansStillIn.length > 0) {
        // Rule 2: User has another account still inside a family clan
        for (const leftClan of rolesToRemove) {
            if (leftClan.roleId && member.roles.cache.has(leftClan.roleId)) {
                await member.roles.remove(leftClan.roleId).catch(() => null);
            }
            if (leftClan.leaderRoleId && member.roles.cache.has(leftClan.leaderRoleId)) {
                await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
            }
        }

        // Update nickname for remaining clans
        const clanNicks = [];
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId && member.roles.cache.has(info.roleId) && !rolesToRemove.some(r => r.roleId === info.roleId)) {
                if (info.nickName && !clanNicks.includes(info.nickName)) {
                    clanNicks.push(info.nickName);
                }
            }
        }

        const clanNickStr = clanNicks.join(' • ');
        let currentNick = member.nickname || member.user.username;
        let playerName = currentNick;
        if (currentNick.includes("|")) {
            const parts = currentNick.split("|");
            playerName = parts[1].split('•')[0].trim();
        } else if (validPlayers.length > 0) {
            playerName = validPlayers[0].name;
        }

        let newNickname = clanNickStr 
            ? `BLOOD | ${playerName} • ${clanNickStr}` 
            : `BLOOD | ${playerName}`;

        if (newNickname.length > 32) {
            newNickname = newNickname.substring(0, 32);
        }

        await member.setNickname(newNickname).catch(() => null);

        return {
            success: true,
            reapplyGiven: false,
            message: `Removed ${clanNamesStr} clan role. Retained other family clan role(s).`
        };
    } else {
        // Rule 3/4: All accounts left all family clans (or no linked accounts)
        for (const leftClan of rolesToRemove) {
            if (leftClan.roleId && member.roles.cache.has(leftClan.roleId)) {
                await member.roles.remove(leftClan.roleId).catch(() => null);
            }
            if (leftClan.leaderRoleId && member.roles.cache.has(leftClan.leaderRoleId)) {
                await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
            }
        }

        // Also remove any remaining clan roles held by this member
        for (const [tag, info] of Object.entries(monitoredClans)) {
            if (info.roleId && member.roles.cache.has(info.roleId)) {
                await member.roles.remove(info.roleId).catch(() => null);
            }
            if (info.leaderRoleId && member.roles.cache.has(info.leaderRoleId)) {
                await member.roles.remove(info.leaderRoleId).catch(() => null);
            }
        }

        if (member.roles.cache.has(FAMILY_ROLE_ID)) {
            await member.roles.remove(FAMILY_ROLE_ID).catch(() => null);
        }

        if (GLOBAL_ROLE_ID && !member.roles.cache.has(GLOBAL_ROLE_ID)) {
            await member.roles.add(GLOBAL_ROLE_ID).catch(() => null);
        }

        if (!member.roles.cache.has(REAPPLY_ROLE_ID)) {
            await member.roles.add(REAPPLY_ROLE_ID).catch(() => null);
        }

        // Change nickname format: clanPrefix • BLOOD | mainIdName
        let mainIdName = "Unknown";
        const currentNick = member.nickname || member.user.username;
        if (currentNick.includes("|")) {
            const parts = currentNick.split("|");
            mainIdName = parts[1].split("•")[0].trim();
        } else if (validPlayers.length > 0) {
            mainIdName = validPlayers[0].name;
        } else if (userAccounts.length > 0) {
            mainIdName = userAccounts[0].name;
        } else {
            mainIdName = member.user.username;
        }

        let clanPrefix = (clanInfo && (clanInfo.nickName || clanInfo.tag)) || "BLOOD";
        const separator = " • BLOOD | ";
        let maxNameLen = 32 - clanPrefix.length - separator.length;

        if (maxNameLen <= 0) {
            clanPrefix = clanPrefix.substring(0, 32 - separator.length - 1).trim();
            maxNameLen = 1;
        }

        if (mainIdName.length > maxNameLen) {
            mainIdName = mainIdName.substring(0, maxNameLen).trim();
        }

        const newNick = `${clanPrefix}${separator}${mainIdName}`;
        await member.setNickname(newNick).catch(() => null);

        // Send embed to reapply target channel
        const targetChannel = member.guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (targetChannel) {
            const bluedot = (emoji && emoji.getEmoji && emoji.getEmoji("bluedot")) || "🔹";
            const embed = new EmbedBuilder()
                .setColor(0x00FFFF)
                .setDescription(
                    `This is <#${targetChannel.id}> room. You're here because:\n\n` +
                    `${bluedot} **Reason:** ${reason}\n\n` +
                    `${bluedot} Please Open a ticket if you are intrested again to continue with us.`
                )
                .setFooter({ text: `Done by ${executorUser.tag} | 💎 Blood Alliance` });

            await targetChannel.send({
                content: `Hey <@${member.id}>`,
                embeds: [embed]
            }).catch(() => null);
        }

        return {
            success: true,
            reapplyGiven: true,
            message: `Removed ${clanNamesStr} clan role, assigned Re-Apply role, updated nickname, and notified <#${TARGET_CHANNEL_ID}>.`
        };
    }
}

module.exports = {
    processMemberReapply
};

