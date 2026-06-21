const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    ChannelType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lockchannel')
        .setDescription('Lock a channel to prevent members from sending messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to lock (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for locking the channel')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { config } = context;
        const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
            !interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))
        ) {
            return interaction.reply({ content: '❌ You do not have permission to lock channels.', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const everyoneRole = interaction.guild.roles.everyone;

        const botMember = await interaction.guild.members.fetchMe();
        const botPerms = channel.permissionsFor(botMember);
        if (!botPerms.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: `❌ I don't have **Manage Channel** permission in ${channel}.`, ephemeral: true });
        }

        try {
            await channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                SendMessagesInThreads: false,
                AddReactions: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false
            }, { reason: `Locked by ${interaction.user.tag}: ${reason}` });

            const lockEmbed = new EmbedBuilder()
                .setTitle('🔒 Channel Locked')
                .setColor(0xED4245)
                .setDescription(`${channel} has been **locked**. Members can no longer send messages here.`)
                .addFields(
                    { name: '🔐 Channel', value: `${channel} (${channel.id})`, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '📋 Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [lockEmbed] });

            if (channel.id !== interaction.channel.id) {
                await channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔒 This channel has been locked')
                        .setColor(0xED4245)
                        .setDescription(`**Reason:** ${reason}\n**Locked by:** ${interaction.user.tag}`)
                        .setTimestamp()]
                }).catch(() => null);
            }

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) await logChannel.send({ embeds: [lockEmbed] }).catch(() => null);
            }
        } catch (err) {
            await interaction.reply({ content: `❌ Failed to lock channel: ${err.message}`, ephemeral: true });
        }
    }
};
