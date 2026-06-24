const { EmbedBuilder } = require('discord.js');
const config = require('../../../config/config.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: (emojis = {}, clanName = null) => {
        const title = clanName 
            ? `${getEmoji('cocfight')} ${clanName} War Entry Requirements`
            : `${getEmoji('cocfight')} War Entry Requirements`;

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(
                'Please complete all steps below carefully before applying.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('parrow')} **Where did you find Blood Alliance?**\n` +
                'Please tell us where you found/heard about us.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('bluedot')} **Share Your War Base**\n` +
                'Upload a screenshot of your current War base design.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('orangedot')} **Upload War Performance**\n` +
                'Send a screenshot showing your War Stars and best attacks.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('pinkdot')} **Hero Availability**\n` +
                'Ensure your heroes are available or you have books to finish them.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                '📌 **Important**\n' +
                '• Our War Clans are highly competitive.\n' +
                '• Be prepared for strategic planning.\n' +
                '• Full hero availability is strictly required.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('tickred')} **After completing everything,**\n` +
                `ping the <@&${config.STAFF_ROLE_IDS[2]}> to proceed.`
            )
            .setColor(0xCC0000);
    }
};
