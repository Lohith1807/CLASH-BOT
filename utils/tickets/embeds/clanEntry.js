const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: (emojis = {}, clanName = null) => {
        const title = clanName 
            ? `${getEmoji('whitefwa')} ${clanName} FWA Clan Application`
            : `${getEmoji('whitefwa')} FWA Clan Application`;

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(
                `${getEmoji('parrow')} **Welcome to the Clan Application! ${getEmoji('heart')} **\n\n` +
                `${getEmoji('pinkdot')} Thank you for your interest in joining one of our Clash of Clans clans.\n\n` +
                `${getEmoji('orangedot')} Click **Start Application** below to begin. You'll be asked a few questions about your account, experience, and preferences.\n\n` +
                `${getEmoji('orangedot')} Please provide accurate information so our leadership team can review your application quickly.\n\n` +
                `${getEmoji('orangedot')} Once submitted, a clan leader will review your application and get back to you as soon as possible.\n\n` +
                `Good luck, Chief! ${getEmoji('cocfight')}`
            )
            .setColor(0xff4d4d);
    }
};
