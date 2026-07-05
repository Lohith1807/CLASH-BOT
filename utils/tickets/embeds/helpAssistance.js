const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: () => {
        return new EmbedBuilder()
            .setTitle(`${getEmoji('reddot')} Support Assistance`)
            .setDescription(
                `${getEmoji('parrow')} **Welcome to Support!**\n\n` +
                `${getEmoji('pinkdot')} Need help? You're in the right place.\n\n` +
                `${getEmoji('orangedot')} Click **Start Application** below and describe the issue you're facing or the question you have.\n\n` +
                `${getEmoji('orangedot')} Please provide as much detail as possible so our support team can assist you efficiently.\n\n` +
                `We'll be with you shortly! 💬`
            )
            .setColor(0x00FF00);
    }
};
