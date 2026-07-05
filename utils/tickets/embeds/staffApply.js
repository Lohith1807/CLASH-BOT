const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: () => {
        return new EmbedBuilder()
            .setTitle(`${getEmoji('reddot')} Staff Application`)
            .setDescription(
                `${getEmoji('parrow')} **Welcome to the Staff Application!**\n\n` +
                `${getEmoji('pinkdot')} Thank you for stepping up to help manage the Blood Alliance.\n\n` +
                `${getEmoji('orangedot')} Click **Start Application** below to answer a few quick questions about your experience and the role you're applying for.\n\n` +
                `${getEmoji('orangedot')} Take your time to provide detailed answers, as this will help the admin team review your application.\n\n` +
                `Good luck! 🛠️`
            )
            .setColor(0x00FF00);
    }
};
