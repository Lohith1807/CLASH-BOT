const { checkPermission } = require('../../../utils/checkPermission.js');
const tick = "1410137697300775026";
const tickEmoji = `<:tick:${tick}>`;
const errorEmoji = `❌`;

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function isLeaderOfSpecificClan(member, clanInfo) {
    if (!member || !clanInfo) return false;

    const memberRoles = member.roles?.cache;

    // 1. Check clanInfo.leaderRoleId
    if (clanInfo.leaderRoleId && memberRoles) {
        if (typeof memberRoles.has === "function" && memberRoles.has(clanInfo.leaderRoleId)) return true;
        if (typeof memberRoles.some === "function" && memberRoles.some(r => r.id === clanInfo.leaderRoleId)) return true;
    }

    // 2. Check clanInfo.leaders array (mentions like "<@562951110562938880>" or plain user IDs)
    if (Array.isArray(clanInfo.leaders) && clanInfo.leaders.some(m => m.includes(member.id))) {
        return true;
    }

    // 3. Check clanInfo.coLeaders array
    if (Array.isArray(clanInfo.coLeaders) && clanInfo.coLeaders.some(m => m.includes(member.id))) {
        return true;
    }

    return false;
}

function isAdminOrMod(member, config) {
    if (!member) return false;

    // 1. Discord Permissions (Admin, ManageGuild, ManageRoles, BanMembers, KickMembers, ModerateMembers, ManageMessages)
    if (member.permissions && typeof member.permissions.has === "function") {
        try {
            if (
                member.permissions.has("Administrator") ||
                member.permissions.has(8n) ||
                member.permissions.has("ManageGuild") ||
                member.permissions.has("ManageRoles") ||
                member.permissions.has("BanMembers") ||
                member.permissions.has("KickMembers") ||
                member.permissions.has("ModerateMembers") ||
                member.permissions.has("ManageMessages")
            ) {
                return true;
            }
        } catch (e) {}
    }

    const memberRoles = member.roles?.cache;
    if (!memberRoles) return false;

    // 2. Role IDs only (Admin, Staff, Mod, All Leaders)
    const allowedIds = [
        ...(config?.ADMIN_ROLE_IDS || []),
        ...(config?.STAFF_ROLE_IDS || []),
        ...(config?.ALL_STAFF_ROLE_IDS || []),
        config?.TRAINEE_ROLE_ID,
        config?.CWL_STAFF_ROLE_ID,
        config?.ALL_LEAD_ROLE_ID,
        config?.ALL_LEADS_ID,
        process.env.ALL_LEAD_ROLE_ID,
        process.env.ALL_LEADS_ID,
        "1394230094675050616", // All Leads (FWA)
        "1510301412280635585", // All Leads (Crimson)
        "1513940638909988874", // Server Moderator
        "1513942017196167389", // T-Moderator
        "1154276716982833154", // Staff
        "1466103376642314445", // All Staff
        "1511650426343133274"  // All Staff 2
    ].map(id => id ? id.toString().trim() : null).filter(Boolean);

    if (typeof memberRoles.some === "function") {
        return memberRoles.some(r => allowedIds.includes(r.id));
    }

    for (const [id] of memberRoles) {
        if (allowedIds.includes(id)) return true;
    }

    return false;
}

module.exports = {
    name: "forceclan",
    description: "Force assign clan roles and nickname without clan verification",
    async execute(message, args, context, clanInfo, clanTag) {
        const { EmbedBuilder, data, config, coc } = context;
        if (message.deletable) message.delete().catch(() => { });

        if (!clanInfo) return;

        const member = message.member;
        const isBypass = checkPermission('forceclan', message);
        const isClanLead = isLeaderOfSpecificClan(member, clanInfo);

        // Admins and Mods bypass clan restriction; specific clan leaders only for their clan
        if (!isBypass && !isClanLead) {
            const notLeaderEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setDescription("⛔ you are not leader for that specific clan");
            return message.channel.send({ content: `${message.author}`, embeds: [notLeaderEmbed] });
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            const errorEmbed = new EmbedBuilder()
                .setColor(getRandomColor())
                .setDescription(`❌ Please mention a user to force assign the clan role.`);
            return message.channel.send({ content: `${message.author}`, embeds: [errorEmbed] });
        }

        let targetMember;
        try {
            targetMember = await message.guild.members.fetch(mentionedUser.id);
        } catch (err) {
            return message.channel.send("❌ Player is not in the server.");
        }

        const botMember = await message.guild.members.fetchMe();
        if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
            return message.channel.send("❌ Cannot modify user: they have a higher or equal role than the bot.");
        }

        const userdata = data.getUserData();
        const linkedAccounts = userdata[mentionedUser.id];

        // Admins and Mods can assign for anyone even if unlinked
        if ((!linkedAccounts || linkedAccounts.length === 0) && !isBypass) {
            return message.channel.send(`❌ ${mentionedUser} has no linked accounts. They must link an account first.`);
        }

        let playerName = targetMember.displayName || targetMember.user.username;
        if (linkedAccounts && linkedAccounts.length > 0) {
            const mainAccount = linkedAccounts[0];
            playerName = mainAccount.name;
            try {
                const cocPlayer = await coc.getPlayer(mainAccount.tag);
                if (cocPlayer && cocPlayer.name) playerName = cocPlayer.name;
            } catch (e) {
                // fallback to linked name
            }
        }

        const results = [];
        const role = message.guild.roles.cache.get(clanInfo.roleId);
        
        if (role) {
            const rolesToAdd = [role];
            const familyRoleId = config.FAMILY_ROLE_ID || "1528073821343584387";
            let extraRole = message.guild.roles.cache.get(familyRoleId);
            if (!extraRole) {
                extraRole = await message.guild.roles.fetch(familyRoleId).catch(() => null);
            }
            if (extraRole) {
                rolesToAdd.push(extraRole);
            }

            await targetMember.roles.add(rolesToAdd)
                .then(() => {
                    results.push(`${tickEmoji} Added role **${role.name}**.`);
                    if (extraRole) results.push(`${tickEmoji} Added role **${extraRole.name}**.`);
                })
                .catch(() => results.push("⚠️ Failed to add clan roles."));
        } else {
            results.push("⚠️ Clan role not found in the server.");
        }

        const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
        if (GLOBAL_ROLE_ID && targetMember.roles.cache.has(GLOBAL_ROLE_ID)) {
            await targetMember.roles.remove(GLOBAL_ROLE_ID)
                .catch(() => {});
        }

        const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || "1523186839509401701";
        if (targetMember.roles.cache.has(REAPPLY_ROLE_ID)) {
            await targetMember.roles.remove(REAPPLY_ROLE_ID)
                .catch(() => {});
        }

        // Check if user is staff (all staff role or staff roles)
        const ALL_STAFF_ROLE_IDS = (config.ALL_STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
        const STAFF_ROLE_IDS = (config.STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
        const fallbackAllStaff = ["1466103376642314445", "1511650426343133274"];
        const fallbackStaff = ["1513940638909988874", "1513942017196167389", "1154276716982833154"];

        const allStaffIds = ALL_STAFF_ROLE_IDS.length > 0 ? ALL_STAFF_ROLE_IDS : fallbackAllStaff;
        const staffIds = STAFF_ROLE_IDS.length > 0 ? STAFF_ROLE_IDS : fallbackStaff;

        const hasStaffRole = targetMember.roles.cache.some(r => 
            allStaffIds.includes(r.id) || 
            staffIds.includes(r.id) ||
            r.name.toLowerCase().includes("staff")
        );

        if (hasStaffRole) {
            results.push("⚠️ Nickname updation skipped, user is staff.");
        } else {
            const clanroles = data.getClanRoles();
            const clanNicks = [];
            for (const [tag, info] of Object.entries(clanroles)) {
                if (info.roleId && targetMember.roles.cache.has(info.roleId)) {
                    if (info.nickName && !clanNicks.includes(info.nickName)) {
                        clanNicks.push(info.nickName);
                    }
                }
            }
            if (clanInfo.nickName && !clanNicks.includes(clanInfo.nickName)) {
                clanNicks.push(clanInfo.nickName);
            }
            const clanNickStr = clanNicks.join(' • ');
            let newNickname = clanNickStr 
                ? `BLOOD | ${playerName || targetMember.user.username} • ${clanNickStr}` 
                : `BLOOD | ${playerName || targetMember.user.username}`;

            if (newNickname.length > 32) {
                newNickname = newNickname.substring(0, 32);
            }

            await targetMember.setNickname(newNickname)
                .then(() => results.push(`${tickEmoji} Nickname updated to **${newNickname}**.`))
                .catch(err => {
                    if (err.code === 50013) {
                        results.push("⚠️ Missing Permissions to change nickname.");
                    } else {
                        results.push(`⚠️ Could not change nickname: ${err.message}`);
                    }
                });
        }

        const finalEmbed = new EmbedBuilder()
            .setColor(getRandomColor())
            .setTitle(`Force Assigned Clan Role`)
            .setDescription(`Successfully force assigned **${clanInfo.nickName || "Clan"}** roles to ${mentionedUser}.`)
            .addFields({ name: "Actions", value: results.join("\n") || "No actions performed." })
            .setFooter({ text: `Done by ${message.member ? message.member.displayName : message.author.username}`, iconURL: message.author.displayAvatarURL() })
            .setTimestamp();

        message.channel.send({ embeds: [finalEmbed] });
    }
};
