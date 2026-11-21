const { EmbedBuilder } = require("discord.js");

/**
 * Checks if a member has a staff, admin, lead, or trainee role or permissions.
 * @param {import('discord.js').GuildMember} member 
 * @param {Object} config 
 * @returns {boolean}
 */
function isStaffMember(member, config = {}) {
    if (!member) return false;

    // Server owner check
    if (member.guild && member.guild.ownerId === member.id) return true;

    // Discord permission check (Administrator / ManageGuild)
    if (member.permissions) {
        try {
            if (member.permissions.has("Administrator") || member.permissions.has(8n)) return true;
        } catch (e) {}
    }

    const memberRoles = member.roles?.cache;
    if (!memberRoles) return false;

    const toIdList = val => {
        if (!val) return [];
        if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
        if (typeof val === 'string') return val.split(',').map(v => v.trim()).filter(Boolean);
        return [];
    };

    const staffRoleIds = new Set([
        ...toIdList(config?.ADMIN_ROLE_IDS),
        ...toIdList(config?.STAFF_ROLE_IDS),
        ...toIdList(config?.ALL_STAFF_ROLE_IDS),
        ...toIdList(process.env.ADMIN_ROLE_IDS),
        ...toIdList(process.env.STAFF_ROLE),
        ...toIdList(process.env.ALL_STAFF_ROLE),
        config?.TRAINEE_ROLE_ID,
        config?.WEL_EXE_STAFF_ID,
        config?.CWL_STAFF_ROLE_ID,
        config?.ALL_LEAD_ROLE_ID,
        config?.ALL_LEADS_ID,
        process.env.TRAINEE_ROLE_ID,
        process.env.WEL_EXE_STAFF_ID,
        process.env.CWL_STAFF_ROLE_ID,
        process.env.ALL_LEAD_ROLE_ID,
        process.env.ALL_LEADS_ID,
        // Known staff / leadership fallbacks
        "1466103376642314445",
        "1511650426343133274",
        "1513940638909988874",
        "1513942017196167389",
        "1154276716982833154",
        "1397128468461916282",
        "1153997630112792577",
        "1420626301328297984",
        "1480823475525517415",
        "1448265928503726161",
        "1514535148119392377",
        "1394230094675050616",
        "1510301412280635585",
        "1514536928412827758"
    ].filter(Boolean).map(id => String(id).trim()));

    for (const roleId of staffRoleIds) {
        if (memberRoles.has(roleId)) return true;
    }

    for (const [, role] of memberRoles) {
        const name = (role.name || "").toLowerCase();
        if (name.includes("staff") || name.includes("admin") || name.includes("moderator") || name.includes("executive")) {
            return true;
        }
    }

    return false;
}

/**
 * Extracts clean player name from member's nickname, linked accounts, or username.
 * Strips clan prefixes, "BLOOD |", and trailing clan tags.
 *
 * @param {import('discord.js').GuildMember} member 
 * @param {Array} validPlayers 
 * @param {Array} userAccounts 
 * @param {Object} clanRoles 
 * @returns {string}
 */
function extractCleanPlayerName(member, validPlayers = [], userAccounts = [], clanRoles = {}) {
    const knownClanNicks = new Set();
    for (const info of Object.values(clanRoles || {})) {
        if (info && info.nickName) {
            knownClanNicks.add(info.nickName.trim().toUpperCase());
        }
    }

    const currentNick = member?.nickname || member?.user?.username || "";

    if (currentNick.includes("|")) {
        const afterPipe = currentNick.split("|").slice(1).join("|").trim();
        const segments = afterPipe.split("•").map(s => s.trim()).filter(Boolean);
        for (const seg of segments) {
            if (!knownClanNicks.has(seg.toUpperCase()) && seg.toUpperCase() !== "BLOOD") {
                return seg;
            }
        }
    } else if (currentNick.includes("•")) {
        const segments = currentNick.split("•").map(s => s.trim()).filter(Boolean);
        for (const seg of segments) {
            if (!knownClanNicks.has(seg.toUpperCase()) && seg.toUpperCase() !== "BLOOD") {
                return seg;
            }
        }
    }

    if (validPlayers && validPlayers.length > 0) {
        if (validPlayers[0].name) return validPlayers[0].name.trim();
        if (validPlayers[0].linkedName) return validPlayers[0].linkedName.trim();
    }
    if (userAccounts && userAccounts.length > 0) {
        if (userAccounts[0].name) return userAccounts[0].name.trim();
    }

    if (currentNick) {
        const stripped = currentNick.replace(/BLOOD/gi, "").replace(/[|•]/g, "").trim();
        if (stripped) return stripped;
    }

    return member?.user?.username || "Unknown";
}

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
    account,
    context
}) {
    const { config, data, coc, emoji } = context;
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || process.env.REAPPLY_ROLE_ID || "1523186839509401701";
    const TARGET_CHANNEL_ID = config.REAPPLY_CHANNEL_ID || process.env.REAPPLY_CHANNEL_ID || "1523186791950323824";
    const FAMILY_ROLE_ID = config.FAMILY_ROLE_ID || "1528073821343584387";

    const cleanTag = t => (t || "").replace(/^#/, "").toUpperCase();

    const userData = data.getUserData();
    const userAccounts = Array.isArray(userData[member.id]) ? userData[member.id] : [];

    const clanRoles = data.getClanRoles();
    const monitoredClans = {};
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.roleId) {
            monitoredClans[cleanTag(tag)] = { ...info, tag: tag.toUpperCase(), rawTag: tag };
            monitoredClans[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase(), rawTag: tag };
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
        if (p.clan && p.clan.tag) {
            const cTag = cleanTag(p.clan.tag);
            if (monitoredClans[cTag]) {
                const clanObj = monitoredClans[cTag];
                if (!clansStillIn.some(c => cleanTag(c.tag) === cleanTag(clanObj.tag) || (c.roleId && clanObj.roleId && c.roleId === clanObj.roleId))) {
                    clansStillIn.push(clanObj);
                }
            }
        }
    }

    const leavingTag = cleanTag(clanInfo?.tag);
    const rolesToRemove = [];
    if (clanInfo && (clanInfo.roleId || clanInfo.tag)) {
        rolesToRemove.push(clanInfo);
    }

    // Determine if they still have accounts in other family clans (excluding the clan being left)
    const otherClansStillIn = clansStillIn.filter(c => 
        cleanTag(c.tag) !== leavingTag && 
        (!clanInfo?.roleId || !c.roleId || c.roleId !== clanInfo.roleId)
    );

    // Save reason to data store
    const clanNamesStr = (clanInfo && (clanInfo.nickName || cleanTag(clanInfo.tag))) || "Clan";
    const reasonsData = data.getReapplyReasons();
    if (!reasonsData[member.id]) reasonsData[member.id] = [];

    let accName = "Unknown";
    let accTag = "";
    if (account) {
        if (typeof account === 'object') {
            accName = account.name || account.accountName || account.linkedName || "Unknown";
            accTag = account.tag || account.accountTag || "";
        } else {
            accName = String(account);
        }
    } else if (validPlayers.length > 0) {
        const match = validPlayers.find(p => !p.clan || cleanTag(p.clan.tag) === cleanTag(clanInfo?.tag)) || validPlayers[0];
        accName = match.name || match.linkedName || "Unknown";
        accTag = match.tag || "";
    } else if (userAccounts.length > 0) {
        accName = userAccounts[0].name || "Unknown";
        accTag = userAccounts[0].tag || "";
    }

    reasonsData[member.id].push({
        reason: reason,
        timestamp: Math.floor(Date.now() / 1000),
        addedBy: executorUser.id,
        clanName: clanNamesStr,
        status: "ADDED",
        accountName: accName,
        accountTag: accTag
    });
    data.saveReapplyReasons(reasonsData);

    const isStaff = isStaffMember(member, config);

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
        // Automatically remove from /clan-members data for the leaving clan
        if (data && typeof data.removeClanMember === "function") {
            for (const leftClan of rolesToRemove) {
                if (accTag) data.removeClanMember(leftClan.tag, accTag);
            }
        }

        // Compute remaining clan nicknames: keep clan nicknames for accounts still in clans and remaining clan roles
        const remainingClanNicks = [];
        for (const c of otherClansStillIn) {
            if (c.nickName && !remainingClanNicks.includes(c.nickName)) {
                remainingClanNicks.push(c.nickName);
            }
        }
        for (const [tag, info] of Object.entries(clanRoles)) {
            const isRemoved = rolesToRemove.some(r => 
                (r.roleId && info.roleId && r.roleId === info.roleId) || 
                cleanTag(r.tag) === cleanTag(tag)
            );
            if (info.roleId && member.roles.cache.has(info.roleId) && !isRemoved) {
                if (info.nickName && !remainingClanNicks.includes(info.nickName)) {
                    remainingClanNicks.push(info.nickName);
                }
            }
        }
        const leavingNicknames = rolesToRemove.map(r => (r.nickName || "").toUpperCase()).filter(Boolean);
        const finalClanNicks = remainingClanNicks.filter(n => !leavingNicknames.includes(n.toUpperCase()));

        let nickMsg = "Nickname unchanged (Staff member)";
        if (!isStaff) {
            const cleanPlayerName = extractCleanPlayerName(member, validPlayers, userAccounts, clanRoles);
            const clanNickStr = finalClanNicks.join(' • ');
            let newNickname = clanNickStr 
                ? `BLOOD | ${cleanPlayerName} • ${clanNickStr}` 
                : `BLOOD | ${cleanPlayerName}`;

            if (newNickname.length > 32) {
                newNickname = newNickname.substring(0, 32);
            }

            await member.setNickname(newNickname).catch(() => null);
            nickMsg = `Nickname updated to \`${newNickname}\``;
        }

        return {
            success: true,
            reapplyGiven: false,
            message: `Removed ${clanNamesStr} clan role. Retained other family clan role(s). ${nickMsg}.`
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

        // Automatically remove from /clan-members data for all left clans / accounts
        if (data && typeof data.removeClanMember === "function") {
            if (accTag) data.removeClanMember(null, accTag);
            if (Array.isArray(userAccounts)) {
                for (const acc of userAccounts) {
                    if (acc.tag) data.removeClanMember(null, acc.tag);
                }
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

        let nickMsg = "Nickname unchanged (Staff member)";
        if (!isStaff) {
            const cleanPlayerName = extractCleanPlayerName(member, validPlayers, userAccounts, clanRoles);
            let clanPrefix = (clanInfo && (clanInfo.nickName || cleanTag(clanInfo.tag))) || "BLOOD";
            const separator = " • BLOOD | ";
            let maxNameLen = 32 - clanPrefix.length - separator.length;

            if (maxNameLen <= 0) {
                clanPrefix = clanPrefix.substring(0, 32 - separator.length - 1).trim();
                maxNameLen = 1;
            }

            let finalPlayerName = cleanPlayerName;
            if (finalPlayerName.length > maxNameLen) {
                finalPlayerName = finalPlayerName.substring(0, maxNameLen).trim();
            }

            const newNick = `${clanPrefix}${separator}${finalPlayerName}`;
            await member.setNickname(newNick).catch(() => null);
            nickMsg = `Nickname set to \`${newNick}\``;
        }

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
            message: `Removed ${clanNamesStr} clan role, assigned Re-Apply role, ${nickMsg}, and notified <#${TARGET_CHANNEL_ID}>.`
        };
    }
}

module.exports = {
    processMemberReapply,
    isStaffMember,
    extractCleanPlayerName
};
