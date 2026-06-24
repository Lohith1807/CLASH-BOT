const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ticketConfigs = require('../../../utils/tickets/ticketConfigs.js');

module.exports = {
  name: "approve",
  description: "Approve the current ticket application",
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve the current ticket application')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

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
    
    // 2. Detect the ticket type automatically
    const type = channel.name.split('-')[0].toLowerCase();

    const starsEmoji = emojiUtils.getEmojiObject('stars');
    const starsIconURL = starsEmoji && starsEmoji.id ? `https://cdn.discordapp.com/emojis/${starsEmoji.id}.${starsEmoji.animated ? 'gif' : 'png'}` : null;

    // 5. Send a green approval embed
    const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTimestamp();

    if (starsIconURL) {
        embed.setAuthor({ name: 'Application Approved', iconURL: starsIconURL });
    } else {
        embed.setTitle('✨ Application Approved');
    }

    let messageText = '';
    const configData = ticketConfigs[type];

    if (configData && configData.approveDesc) {
        // 3. Different embeds depending on the ticket type
        messageText = await configData.approveDesc(userMention, client, emojiUtils);
    } else {
        // 8. If the ticket type cannot be determined, send a generic fallback embed
        messageText = `Your application has been **approved**, ${userMention}!`;
    }

    embed.setDescription(messageText);
    
    // 5. Include who approved it and the timestamp
    embed.addFields(
        { name: 'Approved By', value: `${moderator} (${moderator.tag})`, inline: true },
        { name: 'Approved At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );

    // Emojis spelling "blood alliance" — placed inside embed so they render at smaller inline size
    const welEmoji = getEmoji('wel');
    const darrowEmoji = getEmoji('darrow');
    const bloodAllianceEmojis = [
        getEmoji('letterb'),
        getEmoji('letterl'),
        getEmoji('lettero'),
        getEmoji('lettero'),
        getEmoji('letterd'),
        ' ', // space
        getEmoji('lettera'),
        getEmoji('letterl'),
        getEmoji('letterl'),
        getEmoji('letteri'),
        getEmoji('lettera'),
        getEmoji('lettern'),
        getEmoji('letterc'),
        getEmoji('lettere')
    ].join('');

    // Prepend the header emojis into the embed description so they render smaller (inline)
    const currentDesc = embed.data.description || '';
    embed.setDescription(`${welEmoji} ${darrowEmoji}\n${bloodAllianceEmojis}\n\n${currentDesc}`);

    await interaction.editReply({
        content: '',
        embeds: [embed]
    });
  }
};
