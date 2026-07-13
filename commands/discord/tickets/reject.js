const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ticketConfigs = require('../../../utils/tickets/ticketConfigs.js');

module.exports = {
  name: "reject",
  description: "Reject the current ticket application",
  data: new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject the current ticket application')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
        option.setName('reason')
            .setDescription('Reason for the rejection')
            .setRequired(false)
    ),

  async execute(interaction, context) {
    const { client, config, emoji: emojiUtils } = context;
    const { getEmoji } = emojiUtils;
    const { guild, member, channel, user: moderator } = interaction;

    const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;

    // 1. Both commands must work only inside ticket channels.
    // 7. If the command is used outside a ticket channel, show "you cant use here noob"
    if (!channel.parentId || channel.parentId !== CATEGORY_ID) {
        return interaction.reply({ content: 'you cant use here noob', ephemeral: true });
    }

    // 9. Restrict these commands to staff/admin roles only.
    const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
    const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

    if (!isStaff && !isAdmin) {
        return interaction.reply({ content: '❌ Only Staff or Admins can use this command.', ephemeral: true });
    }

    await interaction.deferReply();

    // 2. Detect the ticket owner automatically (using logic from ticketHandler.js)
    let ticketOwnerId = channel.topic;
    let ticketOwner = null;

    if (ticketOwnerId && /^\d+$/.test(ticketOwnerId)) {
        ticketOwner = await guild.members.fetch(ticketOwnerId).catch(() => null);
    }

    if (!ticketOwner) {
        try {
            const messages = await channel.messages.fetch({ limit: 10, cache: false });
            const firstMsg = messages.filter(m => m.author.id === client.user.id).sort((a, b) => a.createdTimestamp - b.createdTimestamp).first();
            if (firstMsg && firstMsg.mentions.members.size > 0) {
                ticketOwner = firstMsg.mentions.members.first();
            }
        } catch (err) {
            console.error('Error fetching first message:', err);
        }
    }

    if (!ticketOwner) {
        ticketOwner = channel.members.find(m =>
            !m.user.bot &&
            !(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => m.roles.cache.has(id))) &&
            !(config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => m.roles.cache.has(id)))
        );
    }

    const userMention = ticketOwner ? `<@${ticketOwner.id}>` : 'there';
    
    // 2. Detect the ticket type automatically (ignoring approved/rejected prefixes)
    const baseChannelName = channel.name.replace(/^(approved|rejected)-/, '');
    const type = baseChannelName.split('-')[0].toLowerCase();
    
    // 6. Get optional reason argument
    const reason = interaction.options.getString('reason');

    const birdEmoji = emojiUtils.getEmojiObject('bird');
    const birdIconURL = birdEmoji && birdEmoji.id ? `https://cdn.discordapp.com/emojis/${birdEmoji.id}.${birdEmoji.animated ? 'gif' : 'png'}` : null;

    // 6. Send a red rejection embed
    const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTimestamp();

    if (birdIconURL) {
        embed.setAuthor({ name: 'Application Status', iconURL: birdIconURL });
    } else {
        embed.setTitle('🕊️ Application Status');
    }

    let messageText = '';
    const configData = ticketConfigs[type];

    if (configData && configData.rejectDesc) {
        // 3. Different embeds depending on the ticket type
        messageText = await configData.rejectDesc(userMention, client, emojiUtils);
    } else {
        // 8. If the ticket type cannot be determined, send a generic fallback embed
        messageText = `Your application has been **declined**, ${userMention}.`;
    }

    embed.setDescription(messageText);
    
    // 6. Include who rejected it and the timestamp
    embed.addFields(
        { name: 'Rejected By', value: `${moderator} (${moderator.tag})`, inline: true },
        { name: 'Rejected At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );

    const currentName = channel.name;
    const baseName = currentName.replace(/^(approved|rejected)-/, '');
    const newChannelName = `rejected-${baseName}`;

    try {
        await channel.setName(newChannelName);
        embed.addFields({ name: 'Ticket Name', value: `Changed to \`${newChannelName}\``, inline: false });
    } catch (err) {
        console.error('Failed to change channel name:', err);
    }

    const embeds = [embed];
    if (reason) {
        const wrongboxEmoji = emojiUtils.getEmojiObject('wrongbox');
        const reasonIconURL = wrongboxEmoji && wrongboxEmoji.id ? `https://cdn.discordapp.com/emojis/${wrongboxEmoji.id}.${wrongboxEmoji.animated ? 'gif' : 'png'}` : null;

        const reasonEmbed = new EmbedBuilder()
            .setDescription(reason)
            .setColor(0xe74c3c);

        if (reasonIconURL) {
            reasonEmbed.setAuthor({ name: 'Rejection Reason', iconURL: reasonIconURL });
        } else {
            reasonEmbed.setTitle('❌ Rejection Reason');
        }
        embeds.push(reasonEmbed);
    } else {
        embed.addFields({ name: 'Reason', value: 'No reason provided.', inline: true });
    }

    await interaction.editReply({
        content: null,
        embeds: embeds
    });
  }
};
