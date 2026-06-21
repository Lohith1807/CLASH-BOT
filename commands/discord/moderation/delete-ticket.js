const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const transcripts = require('discord-html-transcripts');

async function sendLog(guild, embed, config, file = null) {
    const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const payload = { embeds: [embed] };
    if (file) payload.files = [file];

    await logChannel.send(payload).catch(err => console.error('Log Error:', err));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete-ticket')
        .setDescription('Deletes the existing ticket where the command is used'),

    async execute(interaction, context) {
        const { channel, member, guild, user } = interaction;
        const { config } = context;

        if (channel.deleting) {
            return interaction.reply({
                content: 'noob pervert go to chrome and tap there not here again and again ',
                ephemeral: true
            }).catch(() => null);
        }

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only Staff or Admins can delete this ticket.',
                ephemeral: true
            });
        }

        const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;
        if (channel.parentId !== CATEGORY_ID) {
            return interaction.reply({
                content: '❌ This command can only be used inside a ticket channel.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const creationTime = channel.createdAt;

        let attachment = null;
        try {
            attachment = await transcripts.createTranscript(channel, {
                limit: -1,
                fileName: `transcript-${channel.name}.html`,
                returnBuffer: false,
                saveImages: false
            });
        } catch (err) {
            console.error('Transcript Generation Error:', err);
        }

        const closeEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('Ticket Deleted via Command')
            .setDescription(
                `• **By:** ${user} (${user.username})\n` +
                `• **Ticket:** ${channel.name}\n` +
                `• **Created:** <t:${Math.floor(creationTime.getTime() / 1000)}:R>\n` +
                `• **Deleted:** <t:${Math.floor(Date.now() / 1000)}:f>`
            )
            .setColor(0x2b2d31);

        try {
            await sendLog(guild, closeEmbed, config, attachment);
        } catch (err) {
            console.error('Failed to send log with attachment:', err);
            await sendLog(guild, closeEmbed, config).catch(e => console.error('Final Log Error:', e));
        }

        if (channel.deleting) return;
        channel.deleting = true;

        await interaction.editReply({ content: '✅ Transcript saved! This ticket will be deleted in **5 seconds**...' });

        setTimeout(() => {
            channel.delete().catch(err => {
                if (err.code === 10003) return; // Silence "Unknown Channel" error
                console.log('Error deleting channel:', err);
            });
        }, 5000);
    }
};
