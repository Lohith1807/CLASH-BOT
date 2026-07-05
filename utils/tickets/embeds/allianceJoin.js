const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: () => {
        return new EmbedBuilder()
            .setTitle(`${getEmoji('reddot')} Alliance Partnership`)
            .setDescription(
                `${getEmoji('parrow')} **Welcome to the Alliance Partnership Ticket!**\n\n` +
                `${getEmoji('pinkdot')} We're excited about the possibility of partnering with your clan.\n\n` +
                `${getEmoji('orangedot')} Click **Start Application** below to share details about your clan and why you'd like to join our alliance.\n\n` +
                `${getEmoji('orangedot')} A member of our executive team will review your application and respond as soon as possible.\n\n` +
                `Thank you for reaching out! 🤝`
            )
            .setColor(0x00FF00);
    }
};
