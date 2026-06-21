const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    name: 'warweight',
    description: 'Show instructions to calculate Clash of Clans war weight.',
    data: new SlashCommandBuilder()
        .setName('warweight')
        .setDescription('Show instructions to calculate Clash of Clans war weight.'),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        const { emoji: emojiUtils } = ctx;
        
        try {
            if (!isInteraction && input.deletable) input.delete().catch(() => { });

            const bluestar = emojiUtils?.getEmoji("bluestar") || "⭐";

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('How to check war weight:')
                .setDescription(
                    `${bluestar} **Step 1**: Post a friendly challenge of any base and scout your base, incase if all your bases are locked to post an friendly challenge then please check during the battle day (by scouting your base).\n\n` +
                    `${bluestar} **Step 2**: After scouting please click on to the Townhall and select the info button.\n\n` +
                    `${bluestar} **Step 3**: Multiply the amount of gold (Or) elixir storage in your townhall by 5\n\n` +
                    `\`\`\`For example ~ If your elixer value is 31800 in townhall, then your weight will be 31800 x 5 = 159000\`\`\`\n`
                )
                .setImage('https://media.discordapp.net/attachments/1036981585150484481/1245434044079145101/20240529_232153.jpg?format=webp&width=1403&height=890')
                .setFooter({ text: 'Blood Alliance' });

            const button = new ButtonBuilder()
                .setCustomId('calc_war_weight_btn')
                .setLabel('Calculate War Weight')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            if (isInteraction) {
                await input.reply({ embeds: [embed], components: [row] });
            } else {
                await input.channel.send({ embeds: [embed], components: [row] });
            }

        } catch (error) {
            console.error('❌ Error in warweight command:', error);
            const errMsg = '⚠️ Error loading war weight instructions.';
            if (isInteraction && !input.replied && !input.deferred) {
                return input.reply({ content: errMsg, ephemeral: true }).catch(() => {});
            } else if (isInteraction) {
                return input.editReply({ content: errMsg }).catch(() => {});
            } else {
                return input.channel.send(errMsg).catch(() => {});
            }
        }
    }
};
