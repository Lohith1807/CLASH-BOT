const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlockchannel')
        .setDescription('Unlock a channel to allow members to send messages again')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to unlock (defaults to current channel)')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unlocking the channel')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { config } = context;
        const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
            !interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))
        ) {
            return interaction.reply({ content: '❌ You do not have permission to unlock channels.', ephemeral: true });
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
                SendMessages: null,
                SendMessagesInThreads: null,
                AddReactions: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null
            }, { reason: `Unlocked by ${interaction.user.tag}: ${reason}` });

            const unlockEmbed = new EmbedBuilder()
                .setTitle('🔓 Channel Unlocked')
                .setColor(0x57F287)
                .setDescription(`${channel} has been **unlocked**. Members can now send messages again.`)
                .addFields(
                    { name: '🔓 Channel', value: `${channel} (${channel.id})`, inline: true },
                    { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                    { name: '📋 Reason', value: reason, inline: false }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [unlockEmbed] });

            if (channel.id !== interaction.channel.id) {
                await channel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔓 This channel has been unlocked')
                        .setColor(0x57F287)
                        .setDescription(`**Reason:** ${reason}\n**Unlocked by:** ${interaction.user.tag}`)
                        .setTimestamp()]
                }).catch(() => null);
            }

            const logChannelId = config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(logChannelId);
                if (logChannel) await logChannel.send({ embeds: [unlockEmbed] }).catch(() => null);
            }
        } catch (err) {
            await interaction.reply({ content: `❌ Failed to unlock channel: ${err.message}`, ephemeral: true });
        }
    }
};
