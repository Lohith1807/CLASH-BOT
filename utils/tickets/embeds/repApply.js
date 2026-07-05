const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: () => {
        return new EmbedBuilder()
            .setTitle(`${getEmoji('reddot')} Rep Application`)
            .setDescription(
                `${getEmoji('parrow')} **Welcome to the Rep-Application Ticket!**\n\n` +
                `${getEmoji('pinkdot')} We're glad you're interested in joining the Blood Alliance Leaders family.\n\n` +
                `${getEmoji('orangedot')} Click **Start Application** below and answer all the questions honestly. This helps our leadership team review your request efficiently.\n\n` +
                `${getEmoji('orangedot')} After you submit, a member of our management team will review your application and get back to you shortly.\n\n` +
                `Good luck! 🛡️`
            )
            .setColor(0x00FF00);
    }
};
