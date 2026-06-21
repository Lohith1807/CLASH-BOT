const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

module.exports = {
    name: "unlink",
    description: "Unlink a Clash of Clans account from a user",
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink a Clash of Clans account from a user')
        .addStringOption(option => 
            option.setName('tag')
                .setDescription('The player tag to unlink (e.g. #YQGQQYGV)')
                .setRequired(true))
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to force-unlink this tag from (Admin only)')
                .setRequired(false)),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        try {
            const { EmbedBuilder, emoji: emojiUtils, data: dataManager } = ctx;
            const gtick = emojiUtils.getEmoji('gtick');
            const bwrong = emojiUtils.getEmoji('bluex');
            if (!isInteraction && input.deletable) input.delete().catch(() => { });

            let targetUser;
            let playerTag;
            const author = isInteraction ? input.user : input.author;

            if (isInteraction) {
                targetUser = input.options.getUser('user') || author;
                playerTag = input.options.getString('tag');
                await input.deferReply().catch(() => {});
            } else {
                if (!args[0]) {
                    const embed = new EmbedBuilder()
                    .setTitle(`${emojiUtils.getEmoji('parrow')} Incorrect Usage`)
                        .setDescription("Usage: `;unlink #TAG` or `;unlink @user #TAG`")
                        .setColor(getRandomColor());
                    return input.channel.send({ embeds: [embed] });
                }

                targetUser = input.mentions.users.size > 0 ? input.mentions.users.first() : author;
                playerTag = args.find(arg => arg.startsWith("#")) || args[0];

                if (input.mentions.users.size > 0 && !args.find(arg => arg.startsWith("#"))) {
                    const embed = new EmbedBuilder()
                        .setTitle(`${emojiUtils.getEmoji("hog")} Missing Player Tag`)
                        .setDescription("Example: `;unlink @user #TAG`")
                        .setColor(getRandomColor());
                    return input.channel.send({ embeds: [embed] });
                }
            }

            const cleanTag = playerTag.replace("#", "").toUpperCase();
            const userData = dataManager.getUserData();

            if (!userData[targetUser.id] || userData[targetUser.id].length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${emojiUtils.getEmoji('babyd')} No Linked Accounts`)
                    .setDescription(`No linked accounts found for <@${targetUser.id}>.`)
                    .setColor(getRandomColor());
                if (isInteraction) return await input.editReply({ embeds: [embed] });
                return input.channel.send({ embeds: [embed] });
            }

            const beforeCount = userData[targetUser.id].length;
            userData[targetUser.id] = userData[targetUser.id].filter(
                acc => acc.tag.replace("#", "").toUpperCase() !== cleanTag
            );

            if (userData[targetUser.id].length === beforeCount) {
                const embed = new EmbedBuilder()
                    .setTitle(`${bwrong} Account Not Found`)
                    .setDescription(`Account with tag **#${cleanTag}** not found for <@${targetUser.id}>.`)
                    .setColor(getRandomColor());
                if (isInteraction) return await input.editReply({ embeds: [embed] });
                return input.channel.send({ embeds: [embed] });
            }

            dataManager.saveUserData(userData);

            const embed = new EmbedBuilder()
                .setColor(getRandomColor())
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${author.tag}`,
                    iconURL: author.displayAvatarURL()
                });

            if (targetUser.id === author.id) {
                embed
                    .setTitle(`${gtick} Successfully Unlinked`)
                    .setDescription(`Your account with tag **#${cleanTag}** has been unlinked.`);
            } else {
                embed
                    .setTitle(`${gtick} Successfully Force-Unlinked`)
                    .setDescription(`Account **#${cleanTag}** has been force-unlinked from <@${targetUser.id}>.`)
                    .setFooter({
                        text: `Action by ${author.tag}`,
                        iconURL: author.displayAvatarURL()
                    });
            }

            if (isInteraction) return await input.editReply({ embeds: [embed] });
            return input.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(`❌ Error in unlink command:`, error);
            const errEmbed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("❌ Error")
                .setDescription("An error occurred while unlinking the account. Please try again.")
                .setTimestamp();
            if (isInteraction) return await input.editReply({ embeds: [errEmbed] });
            return input.channel.send({ embeds: [errEmbed] }).catch(() => { });
        }
    }
};
