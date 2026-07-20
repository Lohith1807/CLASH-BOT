const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { syncUser } = require('../../../utils/autoRoleManager.js');

/**
 * Helper to clean current name by extracting the last part of a "BLOOD | Name" format
 * @param {GuildMember} member 
 * @returns {string}
 */
const getCleanName = (member) => {
    let currentNickname = member.nickname || member.user.username;
    if (currentNickname.includes("BLOOD |")) {
        const parts = currentNickname.split("BLOOD |");
        let namePart = parts[parts.length - 1].trim();
        if (namePart.includes("•")) {
            const subParts = namePart.split("•");
            namePart = subParts[0].trim();
        }
        return namePart;
    }
    return currentNickname.trim();
};

/**
 * Updates a member's nickname based on their staff/clan roles
 * @param {GuildMember} member 
 * @param {Object} monitoredClans 
 * @param {Object} config 
 * @returns {Promise<Object>}
 */
const updateMemberNickname = async (member, monitoredClans, config) => {
    const oldNickname = member.nickname || member.user.username;

    const staffPrefixMap = {
        "1153997630112792577": "Admn",
        "1420626301328297984": "Co-Admn",
        "1513940638909988874": "Mod",
        "1513942017196167389": "T-Mod",
        "1154276716982833154": "Exe",
        "1480823475525517415": "HR",
        "1448265928503726161": "CWL",
        "1514535148119392377": "W-Exe"
    };

    const ALL_STAFF_ROLE_IDS = (config.ALL_STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
    const STAFF_ROLE_IDS = (config.STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);

    const fallbackAllStaff = ["1466103376642314445", "1511650426343133274"];
    const fallbackStaff = ["1513940638909988874", "1513942017196167389", "1154276716982833154"];

    const allStaffIds = ALL_STAFF_ROLE_IDS.length > 0 ? ALL_STAFF_ROLE_IDS : fallbackAllStaff;
    const staffIds = STAFF_ROLE_IDS.length > 0 ? STAFF_ROLE_IDS : fallbackStaff;

    const hasStaffRole = member.roles.cache.some(r => 
        allStaffIds.includes(r.id) || 
        staffIds.includes(r.id) ||
        r.name.toLowerCase().includes("staff")
    );

    const cleanName = getCleanName(member);

    let newNickname;
    if (hasStaffRole) {
        const targetMemberRoles = member.roles.cache.filter(role => staffPrefixMap[role.id]);
        let highestStaffRole = null;
        if (targetMemberRoles.size > 0) {
            highestStaffRole = targetMemberRoles.reduce((highest, current) => 
                current.position > (highest?.position || 0) ? current : highest
            );
        }
        const staffPrefix = highestStaffRole ? staffPrefixMap[highestStaffRole.id] : null;
        
        // T-Mod gets NICKNAME in all-caps: T-Mod • BLOOD | NICKNAME
        const formattedName = highestStaffRole?.id === "1513942017196167389"
            ? cleanName.toUpperCase()
            : cleanName;
            
        newNickname = staffPrefix 
            ? `${staffPrefix} • BLOOD | ${formattedName}` 
            : `BLOOD | ${formattedName}`;
    } else {
        // Normal member: BLOOD | cleanName • Clannickname(s)
        const clanNicks = [];
        for (const [tag, info] of Object.entries(monitoredClans)) {
            if (info.roleId && member.roles.cache.has(info.roleId)) {
                if (info.nickName && !clanNicks.includes(info.nickName)) {
                    clanNicks.push(info.nickName);
                }
            }
        }
        const clanNickStr = clanNicks.join(' • ');
        newNickname = clanNickStr 
            ? `BLOOD | ${cleanName} • ${clanNickStr}` 
            : `BLOOD | ${cleanName}`;
    }

    if (newNickname.length > 32) {
        newNickname = newNickname.substring(0, 32);
    }

    if (oldNickname !== newNickname) {
        try {
            await member.setNickname(newNickname);
            return { updated: true, oldNickname, newNickname };
        } catch (err) {
            console.error(`Failed to set nickname for ${member.user.tag}:`, err.message);
        }
    }
    return { updated: false, oldNickname, newNickname };
};

/**
 * Utility to send long message lists in Discord's 2000 character limit chunks
 * @param {Interaction} interaction 
 * @param {string} title 
 * @param {Array<string>} list 
 */
async function sendChunkedList(interaction, title, list) {
    if (list.length === 0) return;
    
    let currentMessage = `**${title}** (${list.length}):\n`;
    for (const item of list) {
        const itemStr = `\`${item}\`, `;
        if (currentMessage.length + itemStr.length > 1950) {
            // Remove trailing comma and space
            if (currentMessage.endsWith(", ")) {
                currentMessage = currentMessage.slice(0, -2);
            }
            await interaction.followUp({ content: currentMessage, ephemeral: true }).catch(() => {});
            currentMessage = "";
        }
        currentMessage += itemStr;
    }
    if (currentMessage.length > 0) {
        if (currentMessage.endsWith(", ")) {
            currentMessage = currentMessage.slice(0, -2);
        }
        await interaction.followUp({ content: currentMessage, ephemeral: true }).catch(() => {});
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorolerefresh')
        .setDescription('Re-check and sync roles/nicknames (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to refresh')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role whose members should be refreshed')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { client, config, coc, data: dataManager } = context;
        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');
        const member = interaction.member;

        // Defer interaction to allow processing time
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        // Build monitored clans list
        const clanRoles = dataManager.getClanRoles();
        const monitoredClans = {};
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId) {
                monitoredClans[tag.toUpperCase()] = info;
            }
        }

        const LOG_CHANNEL_ID = config.AUTOROLE_LOG_CHANNEL_ID || process.env.AUTOROLE_LOG_CHANNEL_ID;
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

        // Fetch guild members to populate cache
        await interaction.guild.members.fetch().catch(() => {});
        const botMember = await interaction.guild.members.fetchMe().catch(() => null);

        // Determine which user IDs to process
        let processIds = [];
        let executionTitle = "Global Sync";
        
        const userData = dataManager.getUserData();

        if (targetUser) {
            processIds = [targetUser.id];
            executionTitle = `Sync — ${targetUser.username}`;
        } else if (targetRole) {
            processIds = targetRole.members
                .filter(m => userData[m.id])
                .map(m => m.id);
            executionTitle = `Sync Role — ${targetRole.name}`;
        } else {
            processIds = Object.keys(userData);
            executionTitle = "Server-Wide Sync";
        }

        if (processIds.length === 0) {
            if (targetRole) {
                return interaction.editReply({ 
                    content: `⚠️ No registered members found with the role **${targetRole.name}** (<@&${targetRole.id}>).` 
                });
            }
            return interaction.editReply({ content: "⚠️ No registered users found in the database." });
        }

        // ── A. MULTI-USER SYNC PATH (Role or Server-Wide) ──────────────
        if (processIds.length > 1) {
            await interaction.editReply({ 
                content: `⏳ Running ${executionTitle} for ${processIds.length} members. Fetching details and formatting nicknames...` 
            });

            let changedCount = 0;
            let notChangedCount = 0;
            let skippedCount = 0;

            const skippedList = [];
            const notChangedList = [];

            // Process members in batches of 5 to avoid API rate limits
            const batchSize = 5;
            for (let i = 0; i < processIds.length; i += batchSize) {
                const batch = processIds.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (userId) => {
                    const targetMember = interaction.guild.members.cache.get(userId);
                    
                    if (!targetMember) {
                        skippedCount++;
                        skippedList.push(`ID: ${userId} (Not in Server)`);
                        return;
                    }
                    if (targetMember.user.bot) return;

                    // Hierarchy Position Check
                    if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
                        skippedCount++;
                        skippedList.push(`${targetMember.user.username} (Hierarchy Limit)`);
                        return;
                    }

                    try {
                        const result = await syncUser(client, config, coc, dataManager, userId, monitoredClans, logChannel);
                        if (!result) {
                            skippedCount++;
                            skippedList.push(`${targetMember.user.username} (Sync Failed)`);
                            return;
                        }

                        let rolesChanged = result.hasChanges;
                        const nickResult = await updateMemberNickname(targetMember, monitoredClans, config);
                        let nickChanged = nickResult.updated;

                        if (rolesChanged || nickChanged) {
                            changedCount++;
                        } else {
                            notChangedCount++;
                            notChangedList.push(targetMember.user.username);
                        }
                    } catch (err) {
                        console.error(`Error during sync for user ${userId}:`, err.message);
                        skippedCount++;
                        skippedList.push(`${targetMember.user.username} (Error: ${err.message})`);
                    }
                }));

                // Edit response status during batches
                await interaction.editReply({ 
                    content: `⏳ Running ${executionTitle}... (${Math.min(i + batchSize, processIds.length)}/${processIds.length} processed)` 
                }).catch(() => {});

                // Small delay to protect API limits
                await new Promise(r => setTimeout(r, 1000));
            }

            const successEmbed = new EmbedBuilder()
                .setTitle(`🔄 ${executionTitle} Complete`)
                .setColor(0x2ECC71)
                .setDescription("Role and nickname refresh has finished successfully.")
                .addFields(
                    { name: "👥 Total Checked", value: `${processIds.length}`, inline: true },
                    { name: "✅ Changed Users", value: `${changedCount}`, inline: true },
                    { name: "ℹ️ Not Changed Users", value: `${notChangedCount}`, inline: true },
                    { name: "⚠️ Skipped Users", value: `${skippedCount}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [successEmbed] });

            // Send lists of skipped and unchanged users in plain text messages (respecting character limits)
            if (skippedList.length > 0) {
                await sendChunkedList(interaction, "⚠️ Skipped Users", skippedList);
            }
            if (notChangedList.length > 0) {
                await sendChunkedList(interaction, "ℹ️ Unchanged Users", notChangedList);
            }
            
            return;
        }

        // ── B. SINGLE USER SYNC PATH ───────────────────────────────────
        const finalUserId = processIds[0];
        const finalTargetMember = interaction.guild.members.cache.get(finalUserId);
        const finalTargetUser = finalTargetMember ? finalTargetMember.user : (await client.users.fetch(finalUserId).catch(() => null));

        if (!finalTargetUser) {
            return interaction.editReply({ content: "❌ Could not fetch user data." });
        }

        try {
            const result = await syncUser(client, config, coc, dataManager, finalUserId, monitoredClans, logChannel);

            if (!result) {
                return interaction.editReply({
                    content: `⚠️ Could not check **${finalTargetUser.username}**. They may not have any linked accounts or are not in the server.`
                });
            }

            let nickChangeStr = "No Change";
            let nicknameUpdated = false;
            
            if (finalTargetMember) {
                if (botMember && finalTargetMember.roles.highest.position >= botMember.roles.highest.position) {
                    nickChangeStr = "⚠️ Skipped (Hierarchy Limit)";
                } else {
                    const nickResult = await updateMemberNickname(finalTargetMember, monitoredClans, config);
                    nicknameUpdated = nickResult.updated;
                    nickChangeStr = nickResult.updated
                        ? `\`${nickResult.oldNickname}\` ➔ \`${nickResult.newNickname}\``
                        : `\`${nickResult.newNickname}\``;
                }
            }

            const currentAllianceRoles = [];
            if (finalTargetMember) {
                for (const [tag, info] of Object.entries(monitoredClans)) {
                    if (info.roleId && finalTargetMember.roles.cache.has(info.roleId)) {
                        currentAllianceRoles.push(`<@&${info.roleId}> (${info.nickName || tag})`);
                    }
                }
            }

            const accounts = userData[finalUserId] || [];

            const accountDetails = await Promise.all(
                accounts.map(async acc => {
                    try {
                        const player = await coc.getPlayer(acc.tag);
                        const clan = player.clan;
                        const inAlliance = clan && monitoredClans[clan.tag.toUpperCase()];
                        return {
                            name: player.name,
                            tag: player.tag,
                            clan: clan ? `${clan.name} (${clan.tag})` : 'No Clan',
                            inAlliance: !!inAlliance,
                            allianceName: inAlliance ? (monitoredClans[clan.tag.toUpperCase()].nickName || clan.tag) : null
                        };
                    } catch (e) {
                        return { name: acc.name || acc.tag, tag: acc.tag, clan: 'API Error', inAlliance: false, allianceName: null };
                    }
                })
            );

            const statusEmbed = new EmbedBuilder()
                .setTitle(`🔍 Role Check — ${finalTargetUser.username}`)
                .setThumbnail(finalTargetUser.displayAvatarURL({ dynamic: true }))
                .setColor((result.hasChanges || nicknameUpdated) ? 0xE74C3C : 0x2ECC71)
                .setTimestamp();

            const accountLines = accountDetails.map(a =>
                `${a.inAlliance ? '✅' : '❌'} \`${a.tag}\` — **${a.name}** → ${a.clan}${a.allianceName ? ` *(${a.allianceName})*` : ''}`
            ).join('\n') || 'No linked accounts';
            statusEmbed.addFields({ name: '🔗 Linked Accounts', value: accountLines, inline: false });

            const rolesValue = currentAllianceRoles.length > 0
                ? currentAllianceRoles.join('\n')
                : 'No alliance roles currently held';
            statusEmbed.addFields({ name: '🎭 Current Alliance Roles', value: rolesValue, inline: false });

            // Display nickname formatting update
            statusEmbed.addFields({ name: '📝 Nickname', value: nickChangeStr, inline: false });

            const hasAnyChange = result.hasChanges || nicknameUpdated;
            if (hasAnyChange) {
                const changeLines = [];
                if (result.rolesAdded?.length > 0) changeLines.push(`**Added:** ${result.rolesAdded.join(', ')}`);
                if (result.rolesRemoved?.length > 0) changeLines.push(`**Removed:** ${result.rolesRemoved.join(', ')}`);
                if (nicknameUpdated) changeLines.push(`**Nickname:** Updated`);
                statusEmbed.addFields({ name: '⚡ Changes Made This Sync', value: changeLines.join('\n'), inline: false });
            } else {
                statusEmbed.addFields({ name: '⚡ Changes', value: 'No changes made this sync', inline: false });
            }

            await interaction.editReply({ embeds: [statusEmbed] });

        } catch (error) {
            console.error('Error in autorolerefresh:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`
            });
        }
    }
};
