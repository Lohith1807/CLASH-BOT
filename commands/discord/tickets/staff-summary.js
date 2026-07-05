const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
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
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        // Get tracking data
        const trackingData = staffTicketTracker.getSummary();
        const staff = trackingData.staff || {};
        
        // Convert object to array and sort by claims descending
        const staffList = Object.keys(staff).map(id => ({
            id: id,
            username: staff[id].username,
            claims: staff[id].claims
        })).sort((a, b) => b.claims - a.claims);

        // Format dates
        const lastResetTimestamp = Math.floor(trackingData.lastReset / 1000);
        const nextResetTimestamp = lastResetTimestamp + (7 * 24 * 60 * 60);

        const embed = new EmbedBuilder()
            .setTitle(`📊 Weekly Staff Ticket Claims`)
            .setColor(0x00FF00)
            .setDescription(`*Resets every Sunday at 7:30 AM IST.*\n**Current Week:** <t:${lastResetTimestamp}:d> to <t:${nextResetTimestamp}:d>\n\n`);

        if (staffList.length === 0) {
            embed.setDescription(embed.data.description + "No tickets have been claimed yet this week.");
        } else {
            let leaderboard = "";
            let rank = 1;
            
            for (const member of staffList) {
                // Use medal emojis for top 3
                let rankStr = `**${rank}.**`;
                if (rank === 1) rankStr = "🥇";
                if (rank === 2) rankStr = "🥈";
                if (rank === 3) rankStr = "🥉";
                
                leaderboard += `${rankStr} <@${member.id}> (${member.username}) - **${member.claims}** claim${member.claims === 1 ? '' : 's'}\n`;
                rank++;
            }
            
            embed.setDescription(embed.data.description + leaderboard);
        }

        embed.setFooter({ text: "Blood Alliance Staff Summary", iconURL: interaction.guild.iconURL() });
        embed.setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
