const { EmbedBuilder } = require('discord.js');

module.exports = {
    getEmbed: (emojis = {}) => {
        return new EmbedBuilder()
            .setTitle(`${emojis.book || '📖'} Rep Application Requirements`)
            .setDescription(
                '**If you\'re applying to become a Rep in our alliance, please answer the following:**\n\n' +
                `${emojis.arrow || '»'} **1. Share Your FWA CC Profile link -**\n` +
                `${emojis.chain || '🔗'} [FWA ChocolateClash](https://chocolateclash.com/)\n\n` +
                `${emojis.arrow || '»'} **2. Location & Timezone –**\n` +
                'Where are you from and which time zone are you in?\n\n' +
                `${emojis.arrow || '»'} **3. FWA Clan Experience –**\n` +
                'Are you currently in any FWA clan, or have you been in one before?\n\n' +
                `${emojis.arrow || '»'} **4. FWA Rep Experience –**\n` +
                'Have you been a Rep in any clan before? If yes, please mention the clan(s).\n\n' +
                `${emojis.arrow || '»'} **5. Motivation –**\n` +
                'Why do you want to be a Rep in our alliance?\n\n' +
                '*Please provide detailed answers so we can properly review your application.*'
            )
            .setColor(0x5865f2);
    }
};
