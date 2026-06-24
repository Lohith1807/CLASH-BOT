const { EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../emoji.js');

module.exports = {
    getEmbed: (emojis = {}) => {
        return new EmbedBuilder()
            .setTitle(`${emojis.alliance_icon || '📢'} Alliance Clan Application –`)
            .setDescription(
                '*Read Everything Carefully Before You Apply*\n\n' +
                '**Interested in joining Blood Alliance? Please follow the steps below and provide all required information.**\n\n' +
                `${emojis.arrow || '»'} **1. Leadership Contact –**\n` +
                'We will only communicate with the Leader of the clan. If you are not one, please ask them to join the server so we can initiate the discussion.\n\n' +
                `${emojis.arrow || '»'} **2. Account Verification –**\n` +
                'Are you applying using the Clash account you intend to register with our alliance?\n' +
                `${emojis.arrow || '»'} **If not, please link by \`;link #playertag\` ${emojis.chain || '🔗'} the correct account to your Discord ID through <@&1234567890> before proceeding.**\n\n` +
                `${getEmoji('parrow')} **3. Where you found Blood Alliance –**\n` +
                'Where did you find/hear about Blood Alliance?\n\n' +
                `${emojis.arrow || '»'} **4. Alliance Interest –**\n` +
                'Why do you want your clan to join our family? What are you looking for in our alliance?\n\n' +
                `${emojis.arrow || '»'} **5. Clan Type –**\n` +
                'Is your clan currently part of the **FWA**, or are you a regular war clan?\n\n' +
                `${emojis.arrow || '»'} **6. CWL Participation –**\n` +
                'Are you interested in joining our **Lazy CWL** group?\n\n' +
                `${emojis.arrow || '»'} **7. Clan Members in Server –**\n` +
                'Are your clan members **already in our server**, or will you need to bring them in?\n' +
                `${emojis.book || '🗂'} **Please note:** To participate in Lazy CWL, all members must be in the Discord server. This is essential for coordination and smooth execution.\n\n` +
                `*Please respond with clear and complete answers so we can process your request smoothly. We look forward to learning more about your clan! ${emojis.chat || '💬'}*`
            )
            .setColor(0x2ecc71);
    }
};
