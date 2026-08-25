const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm-user')
        .setDescription('Send a direct message to all users with a specific role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to target')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send to the users')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { config } = context;
        
        // Ensure the command is executed within a guild
        if (!interaction.guild) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
        }

        const allLeadsRoleId = config.ALL_LEADS_ID || process.env.ALL_LEADS_ID;
        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : []),
            ...(allLeadsRoleId ? [allLeadsRoleId] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const targetRole = interaction.options.getRole('role');
        const messageContent = interaction.options.getString('message');

        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch all members to ensure cache is populated
            await interaction.guild.members.fetch();
            
            const membersWithRole = targetRole.members;
            
            if (membersWithRole.size === 0) {
                return interaction.editReply({ content: `❌ No users found with the role **${targetRole.name}**.` });
            }

            let successCount = 0;
            let failCount = 0;

            const dmEmbed = new EmbedBuilder()
                .setTitle(`Message from ${interaction.guild.name}`)
                .setDescription(messageContent)
                .setColor(0x00FF00)
                .setFooter({ text: `Sent by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            for (const [memberId, member] of membersWithRole) {
                if (member.user.bot) continue; // Skip bots
                
                try {
                    await member.send({ embeds: [dmEmbed] });
                    successCount++;
                } catch (error) {
                    failCount++;
                }
            }

            const summaryEmbed = new EmbedBuilder()
                .setTitle('DM Status Summary')
                .setColor(0x0099FF)
                .setDescription(`Finished sending messages to members with the **${targetRole.name}** role.`)
                .addFields(
                    { name: '✅ Successful DMs', value: `${successCount}`, inline: true },
                    { name: '❌ Failed DMs', value: `${failCount}`, inline: true },
                    { name: 'Total Attempted', value: `${successCount + failCount}`, inline: true },
                    { name: 'Message Sent', value: messageContent, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [summaryEmbed] });

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📢 Mass DM Command Used (/dm-user)')
                        .setColor(0x00FFFF)
                        .addFields(
                            { name: '👮 Used By', value: `${interaction.member.displayName} - ${interaction.user.username}`, inline: true },
                            { name: '🎯 Target Role', value: `${targetRole.name} (${targetRole.id})`, inline: true },
                            { name: '📊 Delivery Stats', value: `✅ ${successCount} | ❌ ${failCount}`, inline: true },
                            { name: '📝 Message Content', value: messageContent, inline: false }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
                }
            }

        } catch (error) {
            console.error('Error in dm-user command:', error);
            await interaction.editReply({ content: '❌ An error occurred while trying to send the DMs.' });
        }
    }
};
