const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout (unmute) from a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
        const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
            !interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))
        ) {
            return interaction.reply({ content: '❌ You do not have permission to unmute members.', ephemeral: true });
        }

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ Could not find that member in this server.', ephemeral: true });
        }

        if (!target.isCommunicationDisabled()) {
            return interaction.reply({ content: '❌ That member is not currently muted (timed out).', ephemeral: true });
        }

        if (!target.moderatable) {
            return interaction.reply({ content: '❌ I cannot manage that user. They may have higher permissions than me.', ephemeral: true });
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

            await interaction.reply({ embeds: [successEmbed], ephemeral: true });

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
            }
        } catch (err) {
            await interaction.reply({ content: `❌ Failed to unmute: ${err.message}`, ephemeral: true });
        }
    }
};
