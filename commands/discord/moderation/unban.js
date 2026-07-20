const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server by their user ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The Discord User ID of the banned user')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the unban')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { config } = context;
        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const userId = interaction.options.getString('userid').trim();
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!/^\d{17,20}$/.test(userId)) {
            return interaction.reply({
                content: '❌ Invalid User ID. Please provide a valid Discord User ID (17–20 digits).',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const banEntry = await interaction.guild.bans.fetch(userId).catch(() => null);

            if (!banEntry) {
                return interaction.editReply({ content: '❌ That user is not currently banned from this server.' });
            }

            await interaction.guild.members.unban(userId, `${reason} | Unbanned by: ${interaction.user.tag}`);

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Member Unbanned')
                .setColor(0x57F287)
                .setDescription(`**${banEntry.user.tag}** has been unbanned from the server.`)
                .addFields(
                    { name: '🎯 Target', value: `${banEntry.user.tag} (${banEntry.user.id})`, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '📋 Reason', value: reason, inline: false },
                    { name: '📛 Original Ban Reason', value: banEntry.reason || 'Unknown', inline: false }
                )
                .setThumbnail(banEntry.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
            }
        } catch (err) {
            await interaction.editReply({ content: `❌ Failed to unban: ${err.message}` });
        }
    }
};
