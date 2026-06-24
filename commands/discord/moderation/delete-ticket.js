const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const transcripts = require('discord-html-transcripts');

async function sendLog(guild, embed, config, file = null, content = null) {
    const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const payload = { embeds: [embed] };
    if (content) payload.content = content;
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

        let ticketOwnerId = channel.topic;
        let ownerMention = '';
        if (ticketOwnerId && /^\d+$/.test(ticketOwnerId)) {
            const owner = await guild.members.fetch(ticketOwnerId).catch(() => null);
            if (owner) {
                ownerMention = `<@${ticketOwnerId}>(${owner.user.username})`;
            } else {
                ownerMention = `<@${ticketOwnerId}>`;
            }
        } else if (ticketOwnerId) {
            ownerMention = `<@${ticketOwnerId}>`;
        } else {
            ownerMention = `Unknown User`;
        }

        const now = Math.floor(Date.now() / 1000);
        
        const closeContent = `Ticket Closed - By: ${user} | ${user.username} - Ticket: ${channel.name}, ${ownerMention} - Time: <t:${now}:F> -`;

        const closeEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('Ticket Closed')
            .setDescription(
                `• By: ${user} | ${user.username}\n` +
                `• Ticket: ${channel.name}, ${ownerMention}\n` +
                `• Time: <t:${now}:F>\n` +
                `• Ticket Creation: <t:${Math.floor(creationTime.getTime() / 1000)}:F>`
            )
            .setColor(0x2b2d31);

        try {
            await sendLog(guild, closeEmbed, config, attachment, closeContent);
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
