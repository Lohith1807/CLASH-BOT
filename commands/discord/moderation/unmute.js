const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout (unmute) from a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to unmute')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for removing the mute')
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
            return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
        }

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ Could not find that member in this server.', flags: [MessageFlags.Ephemeral] });
        }

        if (!target.isCommunicationDisabled()) {
            return interaction.reply({ content: '❌ That member is not currently muted (timed out).', flags: [MessageFlags.Ephemeral] });
        }

        if (!target.moderatable) {
            return interaction.reply({ content: '❌ I cannot manage that user. They may have higher permissions than me.', flags: [MessageFlags.Ephemeral] });
        }

        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } catch (err) {
            if (err.code === 10062) return;
            throw err;
        }

        try {
            await target.timeout(null, `${reason} | Unmuted by: ${interaction.user.tag}`);

            await target.send({
                embeds: [new EmbedBuilder()
                    .setTitle(`🔊 You have been unmuted in ${interaction.guild.name}`)
                    .setColor(0x57F287)
                    .setDescription(
                        `Your timeout has been removed.\n` +
                        `**Reason:** ${reason}\n` +
                        `**Moderator:** ${interaction.user.tag}`
                    )
                    .setTimestamp()]
            }).catch(() => null);

            const successEmbed = new EmbedBuilder()
                .setTitle('🔊 Member Unmuted')
                .setColor(0x57F287)
                .setDescription(`**${targetUser.tag}**'s timeout has been removed.`)
                .addFields(
                    { name: '🎯 Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '📋 Reason', value: reason, inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId)
                    || await interaction.guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
            }
        } catch (err) {
            if (err.code === 10062) return;
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Failed to unmute: ${err.message}` }).catch(() => null);
            } else {
                await interaction.reply({ content: `❌ Failed to unmute: ${err.message}`, flags: [MessageFlags.Ephemeral] }).catch(() => null);
            }
        }
    }
};
