const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits , MessageFlags } = require("discord.js");
const staffTicketTracker = require("../../../utils/staffTicketTracker");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff-summary')
        .setDescription('Displays a weekly summary of tickets claimed by staff members.'),

    async execute(interaction, context) {
        const { config, emoji } = context;
        const { getEmoji } = emoji;
        
        // Permission check
        const allowedRoleNames = ['executive staff', 'server mod', 't-mod', 'admin'];
        const memberRoles = interaction.member.roles.cache;
        
        const hasConfigRole = 
            (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) ||
            (config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => memberRoles.has(id)));

        const hasNameRole = memberRoles.some(r => allowedRoleNames.some(allowed => r.name.toLowerCase().includes(allowed)));
        const hasPerms = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles);

        if (!hasConfigRole && !hasNameRole && !hasPerms && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setDescription(`${getEmoji("bluex")} You do not have the required roles to use this command.`)
                ], 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        try { await interaction.deferReply(); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        // Get tracking data
        const trackingData = staffTicketTracker.getSummary();
        const staff = trackingData.staff || {};
        // Format dates
        const lastResetTimestamp = Math.floor(trackingData.lastReset / 1000);
        const nextResetTimestamp = lastResetTimestamp + (7 * 24 * 60 * 60);

        const embeds = [];

        const mainEmbed = new EmbedBuilder()
            .setTitle(`📊 Weekly Staff Ticket Claims`)
            .setColor(0x00FF00)
            .setDescription(`*Resets every Sunday at 7:30 AM IST.*\n**Current Week:** <t:${lastResetTimestamp}:d> to <t:${nextResetTimestamp}:d>`);
        
        embeds.push(mainEmbed);

        // Build data grouped by type
        const typesData = {};
        let totalClaimsAll = 0;

        for (const [userId, userObj] of Object.entries(staff)) {
            totalClaimsAll += userObj.claims;
            if (userObj.claimsByType) {
                for (const [type, count] of Object.entries(userObj.claimsByType)) {
                    if (count > 0) {
                        if (!typesData[type]) typesData[type] = { total: 0, members: [] };
                        typesData[type].total += count;
                        typesData[type].members.push({ id: userId, username: userObj.username, claims: count });
                    }
                }
            } else if (userObj.claims > 0) { // Fallback for unmigrated data
                if (!typesData['Other']) typesData['Other'] = { total: 0, members: [] };
                typesData['Other'].total += userObj.claims;
                typesData['Other'].members.push({ id: userId, username: userObj.username, claims: userObj.claims });
            }
        }

        if (totalClaimsAll === 0) {
            mainEmbed.setDescription(mainEmbed.data.description + "\n\nNo tickets have been claimed yet this week.");
        } else {
            // Sort types by total claims descending
            const sortedTypes = Object.keys(typesData).sort((a, b) => typesData[b].total - typesData[a].total);

            for (const type of sortedTypes) {
                const typeData = typesData[type];
                
                // Sort members by claims descending
                typeData.members.sort((a, b) => b.claims - a.claims);

                let leaderboard = "";
                let rank = 1;
                for (const member of typeData.members) {
                    let rankStr = `**${rank}.**`;
                    if (rank === 1) rankStr = "🥇";
                    if (rank === 2) rankStr = "🥈";
                    if (rank === 3) rankStr = "🥉";
                    
                    leaderboard += `${rankStr} <@${member.id}> (${member.username}) - **${member.claims}** claim${member.claims === 1 ? '' : 's'}\n`;
                    rank++;
                }

                const typeEmbed = new EmbedBuilder()
                    .setTitle(`📋 ${type} (Total: ${typeData.total})`)
                    .setColor(0x3498DB)
                    .setDescription(leaderboard);
                
                embeds.push(typeEmbed);
            }

            // Overall Total Embed
            const staffList = Object.keys(staff).map(id => ({
                id: id,
                username: staff[id].username,
                claims: staff[id].claims
            })).filter(m => m.claims > 0).sort((a, b) => b.claims - a.claims);

            let overallLeaderboard = "";
            let overallRank = 1;
            for (const member of staffList) {
                let rankStr = `**${overallRank}.**`;
                if (overallRank === 1) rankStr = "🥇";
                if (overallRank === 2) rankStr = "🥈";
                if (overallRank === 3) rankStr = "🥉";
                
                overallLeaderboard += `${rankStr} <@${member.id}> (${member.username}) - **${member.claims}** claim${member.claims === 1 ? '' : 's'}\n`;
                overallRank++;
            }

            const overallEmbed = new EmbedBuilder()
                .setTitle(`🏆 Overall Total Claims: ${totalClaimsAll}`)
                .setColor(0xF1C40F)
                .setDescription(overallLeaderboard);

            embeds.push(overallEmbed);
        }

        // Add footer and timestamp to the LAST embed
        embeds[embeds.length - 1]
            .setFooter({ text: "Blood Alliance Staff Summary", iconURL: interaction.guild.iconURL() })
            .setTimestamp();

        return interaction.editReply({ embeds: embeds });
    }
};
