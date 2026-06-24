const { EmbedBuilder } = require('discord.js');
const config = require('../../../config/config.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: (emojis = {}, clanName = null) => {
        const title = clanName 
            ? `${getEmoji('sheild')} ${clanName} FWA Entry Requirements`
            : `${getEmoji('sheild')} FWA Entry Requirements`;

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(
                'Please complete all steps below carefully before applying.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('parrow')} **Where did you find Blood Alliance?**\n` +
                'Please tell us where you found/heard about us.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('orangedot')} **Share Your FWA Base**\n` +
                'Upload a screenshot of your current FWA base.\n\n' +
                'If you don\'t have one yet, use:\n' +
                '`!bases` \n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('pinkdot')} **Upload Your Profile**\n` +
                'Send a screenshot of your Clash of Clans\n' +
                '“My Profile” page.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                '📌 **Important**\n' +
                '• First time joining FWA? Read all FWA & clan rules.\n' +
                '• Mention how long you plan to stay.\n' +
                '• Make sure your account matches clan requirements.\n\n' +
                '━━━━━━━━━━━━━━\n' +
                `${getEmoji('tickred')} **After completing everything,**\n` +
                `ping the <@&${config.STAFF_ROLE_IDS[2]}> to proceed.`
            )
            .setColor(0xff4d4d);
    }
};
