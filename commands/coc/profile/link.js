

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

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

            if (targetUser.id !== author.id) {
                const thEmoji = emojiUtils.getEmoji(`th${data.townHallLevel}`) || '';
                const confirmEmbed = new EmbedBuilder()
                    .setTitle(`${thEmoji} ${data.name} | ${data.tag}`)
                    .setDescription(`Are you sure you want to link <@${targetUser.id}> to ${data.tag}?`)
                    .setColor(0x2B2D31)
                    .setFooter({ text: author.displayName || author.username || author.tag, iconURL: author.displayAvatarURL() });

                const confirmButton = new ButtonBuilder()
                    .setCustomId('confirm_link')
                    .setLabel('Yes')
                    .setStyle(ButtonStyle.Success);

                const cancelButton = new ButtonBuilder()
                    .setCustomId('cancel_link')
                    .setLabel('No')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

                let response;
                if (isInteraction) {
                    response = await input.editReply({ embeds: [confirmEmbed], components: [row] });
                } else {
                    response = await input.channel.send({ embeds: [confirmEmbed], components: [row] });
                }

                const collector = response.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000,
                    filter: i => i.user.id === author.id
                });

                collector.on('collect', async i => {
                    if (i.customId === 'confirm_link') {
                        if (!Array.isArray(userData[targetUser.id])) {
                            userData[targetUser.id] = [];
                        }

                        userData[targetUser.id].push({
                            tag: data.tag,
                            name: data.name
                        });

                        dataManager.saveUserData(userData);

                        const tickbox = emojiUtils.getEmoji('tickbox') || '✅';
                        const successEmbed = new EmbedBuilder()
                            .setColor('#57F287')
                            .setDescription(`${tickbox} Player (${data.tag}) force-linked to discord account <@${targetUser.id}>`);

                        await i.update({ embeds: [successEmbed], components: [] });
                    } else if (i.customId === 'cancel_link') {
                        const cancelEmbed = new EmbedBuilder()
                            .setTitle('❌ Action Cancelled')
                            .setDescription(`Force-linking has been cancelled.`)
                            .setColor(0xE74C3C);
                        await i.update({ embeds: [cancelEmbed], components: [] });
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        const timeoutEmbed = new EmbedBuilder()
                            .setTitle('⏳ Timeout')
                            .setDescription('You did not respond in time.')
                            .setColor(0x95A5A6);
                        
                        if (isInteraction) {
                            input.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                        } else {
                            response.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                        }
                    }
                });
                return;
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
                .setTimestamp()
                .setTitle(`${gtick} Successfully Linked Account`)
                .setDescription(`**${data.name}** (${data.tag}) is now linked to your Discord.`);

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
