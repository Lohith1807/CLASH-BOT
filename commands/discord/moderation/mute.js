const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * multipliers[unit];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout (mute) a member for a specified duration')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to mute')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration (e.g. 10m, 1h, 2d, 30s) — max 28 days')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the mute')
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

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ Could not find that member in this server.', ephemeral: true });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot mute yourself.', ephemeral: true });
        }

        if (!target.moderatable) {
            return interaction.reply({ content: '❌ I cannot timeout that user. They may have higher permissions than me.', ephemeral: true });
        }

        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
            return interaction.reply({
                content: '❌ Invalid duration format. Use: `10s`, `10m`, `1h`, `2d` (max 28 days).',
                ephemeral: true
            });
        }

        const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
        if (durationMs > MAX_TIMEOUT_MS) {
            return interaction.reply({ content: '❌ Timeout duration cannot exceed **28 days**.', ephemeral: true });
        }

        try {
            await target.timeout(durationMs, `${reason} | Muted by: ${interaction.user.tag}`);

            const unmuteTime = Math.floor((Date.now() + durationMs) / 1000);

            await target.send({
                embeds: [new EmbedBuilder()
                    .setTitle(`🔇 You have been muted in ${interaction.guild.name}`)
                    .setColor(0xFFA500)
                    .setDescription(
                        `**Reason:** ${reason}\n` +
                        `**Duration:** ${durationStr}\n` +
                        `**Expires:** <t:${unmuteTime}:R>\n` +
                        `**Moderator:** ${interaction.user.tag}`
                    )
                    .setTimestamp()]
            }).catch(() => null);

            const successEmbed = new EmbedBuilder()
                .setTitle('🔇 Member Muted (Timed Out)')
                .setColor(0xFFA500)
                .setDescription(`**${targetUser.tag}** has been timed out.`)
                .addFields(
                    { name: '🎯 Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '⏱️ Duration', value: durationStr, inline: true },
                    { name: '🕐 Expires', value: `<t:${unmuteTime}:R>`, inline: true },
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
            await interaction.reply({ content: `❌ Failed to mute: ${err.message}`, ephemeral: true });
        }
    }
};
