const { EmbedBuilder } = require('discord.js');

module.exports = {
    getEmbed: (emojis = {}) => {
        return new EmbedBuilder()
            .setTitle(`${emojis.staff_icon || '📝'} Staff Application Requirements`)
            .setDescription(
                `${emojis.arrow || '➡'} **In-Game Name & Tag:**\n` +
                '(Example: LEGEND #ABC123XYZ)\n\n' +
                `${emojis.arrow || '»'} **Time Zone:**\n` +
                '(Example: IST / GMT+5:30)\n\n' +
                `${emojis.arrow || '»'} **Age:**\n` +
                '(We require honesty here; age will not affect eligibility directly.)\n\n' +
                `${emojis.blue_dot || '🔵'} **What role are you applying for?**\n` +
                '(Example: Entry, Support)\n\n' +
                `${emojis.orange_dot || '🟠'} **How long have you been in FWA or your current clan?**\n\n` +
                `${emojis.blue_dot || '🔵'} **Why do you want to join the staff team?**\n\n` +
                `${emojis.pink_dot || '💖'} **How active are you daily (in hours)?**\n\n` +
                `${emojis.cyan_dot || '⚫'} **Have you been staff in any other servers? If yes, mention which ones.**\n\n` +
                `${emojis.chat || '🚩'} **Anything else you\'d like us to know?**`
            )
            .setColor(0x95a5a6);
    }
};
