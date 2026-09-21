const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits , MessageFlags } = require('discord.js');
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
        const { channel, member, config } = interaction;
        const conf = context.config || config;

        if (channel.deleting) {
            return interaction.reply({
                content: 'noob pervert go to chrome and tap there not here again and again ',
                flags: [MessageFlags.Ephemeral]
            }).catch(() => null);
        }

        const STAFF_ROLE_IDS = conf.STAFF_ROLE_IDS || [];
        const WEL_EXE_STAFF_ID = conf.WEL_EXE_STAFF_ID || process.env.WEL_EXE_STAFF_ID;
        const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator) || (WEL_EXE_STAFF_ID && member.roles.cache.has(WEL_EXE_STAFF_ID));

        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only Staff or Admins can delete this ticket.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const CATEGORY_ID = conf.TICKET_CATEGORY_ID || conf.ADMIN_CATEGORY_ID;
        if (channel.parentId !== CATEGORY_ID) {
            return interaction.reply({
                content: '❌ This command can only be used inside a ticket channel.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        const confirmEmbed = new EmbedBuilder()
            .setTitle('Close Ticket')
            .setDescription('Are you sure you want to close this ticket?')
            .setColor(0xff0000);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_close_ticket')
                .setLabel('Yes')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_close_ticket')
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [confirmEmbed], components: [row] });
    }
};
