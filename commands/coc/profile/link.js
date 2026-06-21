

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: "link",
    description: "Link your Clash of Clans account (or force-link someone else's)",
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Clash of Clans account (or force-link someone else\'s)')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to link (e.g. #YQGQQYGV)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to force-link this tag to (Admin only)')
                .setRequired(false)),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        const { EmbedBuilder, coc, data: dataManager, emoji: emojiUtils } = ctx;
        const gtick = emojiUtils.getEmoji('gtick');
        const bwrong = emojiUtils.getEmoji('bluex');
        if (!isInteraction && input.deletable) input.delete().catch(() => { });

        let targetUser;
        let playerTag;
        const author = isInteraction ? input.user : input.author;

        if (isInteraction) {
            targetUser = input.options.getUser('user') || author;
            playerTag = input.options.getString('tag');
            await input.deferReply().catch(() => { });
        } else {
            if (args.length === 0) {
                return input.channel.send(`${emojiUtils.getEmoji('parrow')} Syntax: \`;link #TAG\` or \`;link @user #TAG\``);
            }
            targetUser = input.mentions.users.size > 0 ? input.mentions.users.first() : author;
            playerTag = args.find(arg => arg.startsWith("#")) || args[0];

            if (input.mentions.users.size > 0 && !args.find(arg => arg.startsWith("#"))) {
                return input.channel.send(`Please provide a player tag. Example: \`;link @user #TAG\``);
            }
        }

        const cleanTag = playerTag.replace("#", "").toUpperCase();

        try {
            const data = await coc.getPlayer(playerTag);
            const userData = dataManager.getUserData();

            let tagAlreadyLinkedUserId = null;
            for (const [userId, accounts] of Object.entries(userData)) {
                if (Array.isArray(accounts) && accounts.some(acc => acc.tag === data.tag)) {
                    tagAlreadyLinkedUserId = userId;
                    break;
                }
            }

            if (tagAlreadyLinkedUserId) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle(`${bwrong} Tag Already Linked`)
                    .setColor("Red")
                    .setTimestamp();

                if (tagAlreadyLinkedUserId === targetUser.id) {
                    if (targetUser.id === author.id) {
                        errorEmbed.setDescription(`\`${data.tag}\` is already linked to your profile. Link another account.`);
                    } else {
                        errorEmbed.setDescription(`\`${data.tag}\` is already linked to this user. Link another account.`);
                    }
                } else {
                    errorEmbed.setDescription(`\`${data.tag}\` is already linked to <@${tagAlreadyLinkedUserId}>.`);
                }

                if (isInteraction) return await input.editReply({ embeds: [errorEmbed] });
                return input.channel.send({ embeds: [errorEmbed] });
            }

            if (!Array.isArray(userData[targetUser.id])) {
                userData[targetUser.id] = [];
            }

            userData[targetUser.id].push({
                tag: data.tag,
                name: data.name
            });

            dataManager.saveUserData(userData);

            const randomColor = Math.floor(Math.random() * 16777215);

            const embed = new EmbedBuilder()
                .setColor(randomColor)
                .setFooter({ text: `Done by ${author.tag}`, iconURL: author.displayAvatarURL() })
                .setTimestamp();

            if (targetUser.id === author.id) {
                embed.setTitle(`${gtick} Successfully Linked Account`)
                    .setDescription(`**${data.name}** (${data.tag}) is now linked to your Discord.`);
            }
            else {
                embed.setTitle(`${gtick} Successfully Force-Linked Account`)
                    .setDescription(`**${data.name}** (${data.tag}) has been force-linked to <@${targetUser.id}>`);
            }

            if (isInteraction) return await input.editReply({ embeds: [embed] });
            return input.channel.send({ embeds: [embed] });
        } catch (err) {
            if (err.response && err.response.status === 503) {
                const maintenanceMsg = `${bwrong} The Clash of Clans API is currently in maintenance. Please try again later.`;
                if (isInteraction) return await input.editReply({ content: maintenanceMsg });
                return input.channel.send(maintenanceMsg);
            }
            const errorMsg = `${bwrong} There is a problem in linking account. Invalid tag?`;
            if (isInteraction) return await input.editReply({ content: errorMsg });
            return input.channel.send(errorMsg);
        }
    }
};
