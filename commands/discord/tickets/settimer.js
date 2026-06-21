const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const transcripts = require('discord-html-transcripts');

module.exports = {
  name: "set-timer",
  description: "Set an auto-close timer for this ticket",
  data: new SlashCommandBuilder()
    .setName('set-timer')
    .setDescription('Set an auto-close timer for this ticket')
    .addStringOption(option => 
        option.setName('duration')
            .setDescription('Duration format (e.g. 5m, 1h, 1d)')
            .setRequired(true)
    ),

  async execute(interaction, context) {
    const { client, config } = context;
    const { guild, member, channel } = interaction;

    const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;

    if (!channel.parentId || channel.parentId !== CATEGORY_ID) {
        return interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', ephemeral: true });
    }

    const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
    const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

    if (!isStaff && !isAdmin) {
        return interaction.reply({ content: '❌ Only Staff or Admins can set timers.', ephemeral: true });
    }

    const durationStr = interaction.options.getString('duration').trim().toLowerCase();
    const match = durationStr.match(/^(\d+)\s*(m|min|h|hr|d|day)s?$/);

    if (!match) {
        return interaction.reply({ content: '❌ Invalid format. Please use formats like `5m`, `1h`, or `1d`.', ephemeral: true });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const value = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    if (unit.startsWith('m')) {
        ms = value * 60 * 1000;
    } else if (unit.startsWith('h')) {
        ms = value * 60 * 60 * 1000;
    } else if (unit.startsWith('d')) {
        ms = value * 24 * 60 * 60 * 1000;
    }

    const ticketOwnerId = channel.topic;
    const ticketOwnerMention = ticketOwnerId && /^\d+$/.test(ticketOwnerId) ? `<@${ticketOwnerId}>` : 'the creator';

    if (client.activeTicketTimers && client.activeTicketTimers.has(channel.id)) {
        const oldTimer = client.activeTicketTimers.get(channel.id);
        clearTimeout(oldTimer.timeout);
        client.activeTicketTimers.delete(channel.id);
    }

    const autoCloseTimestamp = Math.floor((Date.now() + ms) / 1000);
    const reminderOffset = Math.floor(ms / 2);
    const reminderTimestamp = Math.floor((Date.now() + reminderOffset) / 1000);

    const timerEmbed = new EmbedBuilder()
        .setTitle('Waiting on ticket creator')
        .setDescription(
            `We're waiting for a reply from ${ticketOwnerMention}.\n` +
            `**Reminder:** <t:${reminderTimestamp}:t>\n` +
            `**Auto-close:** <t:${autoCloseTimestamp}:t>\n\n` +
            `*Any reply from the creator will cancel this timer.*`
        )
        .setColor(0x2f3136);

    const timerMessage = await channel.send({
        content: ticketOwnerMention,
        embeds: [timerEmbed]
    });

    const timeout = setTimeout(async () => {
        if (client.activeTicketTimers) client.activeTicketTimers.delete(channel.id);
        const tData = context.data.getTicketTimers();
        if (tData[channel.id]) {
            delete tData[channel.id];
            context.data.saveTicketTimers(tData);
        }

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
            .setTitle('Ticket Auto-Closed')
            .setDescription(
                `• **Reason:** Auto-closed (Timer completed without reply from ticket creator)\n` +
                `• **Ticket:** ${channel.name}\n` +
                `• **Created:** <t:${Math.floor(creationTime.getTime() / 1000)}:R>\n` +
                `• **Closed:** <t:${Math.floor(Date.now() / 1000)}:f>`
            )
            .setColor(0xff0000);

        try {
            const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    const payload = { embeds: [closeEmbed] };
                    if (attachment) payload.files = [attachment];
                    await logChannel.send(payload);
                }
            }
        } catch (err) {
            console.error('Failed to send log:', err);
        }

        await channel.delete().catch(err => {
            if (err.code === 10003) return; // Silence "Unknown Channel" error
            console.log('Error deleting channel:', err);
        });
    }, ms);

    if (!client.activeTicketTimers) client.activeTicketTimers = new Map();
    client.activeTicketTimers.set(channel.id, {
        timeout,
        timerMessageId: timerMessage.id
    });

    const timersData = context.data.getTicketTimers();
    timersData[channel.id] = {
        autoCloseTimestamp: autoCloseTimestamp,
        guildId: guild.id,
        timerMessageId: timerMessage.id
    };
    context.data.saveTicketTimers(timersData);

    await interaction.editReply({ content: `⏳ Auto-close timer successfully set for **${durationStr}**!` });
  }
};
