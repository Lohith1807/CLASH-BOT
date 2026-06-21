const { EmbedBuilder } = require('discord.js');

module.exports = {
    getEmbed: (emojis = {}) => {
        return new EmbedBuilder()
            .setTitle(`${emojis.chat || '❓'} Help & Support –`)
            .setDescription(
                '**Do you need help or have questions about Blood Alliance?**\n\n' +
                'Please describe your issue or question in detail below. Our support team will be with you as soon as possible.\n\n' +
                `${emojis.arrow || '»'} **Common Support Topics:**\n` +
                '• clan war leauge doubts?\n' +
                '• Alliance rules clarification\n' +
                '• General Clash of Clans questions\n\n' +
                `*Please be patient while waiting for a response. We are here to help! ${emojis.chat || '💬'}*`
            )
            .setColor(0x3498db);
    }
};
