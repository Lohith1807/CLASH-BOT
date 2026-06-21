const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Sends the ticket setup panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, context) {
        const { client, config, emoji } = context;
        const { getEmoji } = emoji;

        const ADMIN_ROLE_IDS = config.ADMIN_ROLE_IDS || [];
        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                           ADMIN_ROLE_IDS.some(id => interaction.member.roles.cache.has(id));

        if (!isAuthorized) {
            return interaction.reply({
                content: '❌ You do not have the required permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const getEmojiData = (name) => {
            const obj = emoji.getEmojiObject(name);
            return obj ? obj : { id: null, name: name };
        };

        const emojis = {
            clan: getEmojiData('coc'),
            rep: getEmojiData('crown'),
            staff: getEmojiData('wow'),
            alliance: getEmojiData('blood'),
            help: getEmojiData('question')
        };

        const ticketImage = new AttachmentBuilder('./assets/images/tickets.png');

        const embed = new EmbedBuilder()
            .setTitle(`${emoji.getEmoji('blood')} Apply to be a part of Blood Alliance! ${emoji.getEmoji('sheild')}`)
            .setDescription(
                `### ${emoji.getEmoji('wow')} Thank you for showing interest in The Blood Alliance!\n` +
                `${emoji.getEmoji('chain')} Before we proceed, please link your account(s) to initiate a ticket and begin your journey.\n\n` +
                `${emoji.getEmoji('cocfight')} Whether you're here to apply for one of our FWA clans, support the Blood Alliance as a dedicated staff member, join our growing family of warriors, or enjoy the ride in Lazy CWL — you're more than welcome. We're glad to have you!\n\n` +
                `• Want to **join a clan?** - Click ${emoji.getEmoji('coc')} **Clan Entry**.\n` +
                `• Want to **become a rep and help our clans grow?** - Click ${emoji.getEmoji('crown')} **Rep apply**.\n` +
                `• Want to **support us in any other way?** - Click ${emoji.getEmoji('wow')} **Staff Apply**.\n` +
                `• Want to **your clan to join the alliance?** - Click ${emoji.getEmoji('blood')} **Alliance Join**.\n` +
                `• Need **general help or assistance?** - Click ${emoji.getEmoji('question')} **Help Assistance**.\n\n` +
                `${emoji.getEmoji('bluestar')} **Welcome to the Blood Alliance. Let the journey begin!** ${emoji.getEmoji('bluestar')}`
            )
            .setColor(0xff0000)
            .setImage('attachment://tickets.png');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('apply_clan')
                .setLabel('Apply to clan')
                .setEmoji(emojis.clan.id || '🛡️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('rep_apply')
                .setLabel('Rep Apply')
                .setEmoji(emojis.rep.id || '👑')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('staff_apply')
                .setLabel('Staff Apply')
                .setEmoji(emojis.staff.id || '📝')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('alliance_apply')
                .setLabel('Alliance apply')
                .setEmoji(emojis.alliance.id || '🩸')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('help_assistance')
                .setLabel('Help Assistance')
                .setEmoji(emojis.help.id || '❓')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({
            embeds: [embed],
            components: [row],
            files: [ticketImage]
        });

        await interaction.editReply({
            content: '✅ Ticket Panel has been sent successfully!'
        });
    }
};
