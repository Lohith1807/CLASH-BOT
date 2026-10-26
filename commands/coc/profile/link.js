const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');

function canForceAction(author, member, config, guild, dataManager = null) {
    if (!author) return false;
    const targetObj = member || author;
    if (checkPermission('forcelink', targetObj)) return true;
    if (guild && guild.ownerId === author.id) return true;
    if (config?.VIP_USER_IDS && config.VIP_USER_IDS.includes(author.id)) return true;

    if (member) {
        if (member.permissions && typeof member.permissions.has === "function") {
            try {
                if (
                    member.permissions.has(PermissionFlagsBits?.Administrator || "Administrator") ||
                    member.permissions.has(8n) ||
                    member.permissions.has("ManageGuild") ||
                    member.permissions.has("ManageRoles") ||
                    member.permissions.has("BanMembers") ||
                    member.permissions.has("KickMembers") ||
                    member.permissions.has("ModerateMembers") ||
                    member.permissions.has("ManageMessages")
                ) {
                    return true;
                }
            } catch (e) { }
        }

        const memberRoles = member.roles?.cache;
        if (memberRoles) {
            const allowedRoleIds = [
                ...(config?.ADMIN_ROLE_IDS || []),
                ...(config?.STAFF_ROLE_IDS || []),
                ...(config?.ALL_STAFF_ROLE_IDS || []),
                config?.ALL_LEAD_ROLE_ID,
                config?.ALL_LEADS_ID,
                process.env.ALL_LEAD_ROLE_ID,
                process.env.ALL_LEADS_ID,
                "1394230094675050616", // All Leads (FWA)
                "1510301412280635585", // All Leads (Crimson)
                config?.TRAINEE_ROLE_ID,
                config?.CWL_STAFF_ROLE_ID,
                "1513940638909988874", // Server Moderator
                "1513942017196167389", // T-Moderator
                "1154276716982833154", // Staff
                "1466103376642314445", // All Staff
                "1511650426343133274"  // All Staff 2
            ].map(id => id ? id.toString().trim() : null).filter(Boolean);

            if (dataManager && typeof dataManager.getClanRoles === "function") {
                try {
                    const clanRoles = dataManager.getClanRoles();
                    for (const tag in clanRoles) {
                        if (clanRoles[tag]?.leaderRoleId) {
                            allowedRoleIds.push(clanRoles[tag].leaderRoleId.toString().trim());
                        }
                    }
                } catch (e) { }
            }

            if (typeof memberRoles.some === "function") {
                return memberRoles.some(r => {
                    if (allowedRoleIds.includes(r.id)) return true;
                    const name = (r.name || "").toLowerCase();
                    return name.includes("all lead") || name.includes("all leader") || name.includes("leader") || name.includes("co-lead");
                });
            }

            for (const [id, r] of memberRoles) {
                if (allowedRoleIds.includes(id)) return true;
                const name = (r?.name || "").toLowerCase();
                if (name.includes("all lead") || name.includes("all leader") || name.includes("leader") || name.includes("co-lead")) {
                    return true;
                }
            }
        }
    }
    return false;
}

async function resolveUser(client, idOrMention) {
    if (!idOrMention) return null;
    const cleanId = String(idOrMention).replace(/[<@!>]/g, "").trim();
    if (!/^\d{15,22}$/.test(cleanId)) return null;

    let user = null;
    if (client && client.users) {
        user = await client.users.fetch(cleanId).catch(() => null);
    }
    if (!user) {
        user = {
            id: cleanId,
            username: `User (${cleanId})`,
            tag: cleanId,
            displayName: `User (${cleanId})`,
            displayAvatarURL: () => null
        };
    }
    return user;
}

module.exports = {
    name: "link",
    description: "Link your Clash of Clans account (or force-link someone else's by user or user ID)",
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Clash of Clans account (or force-link someone else\'s)')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to link (e.g. #YQGQQYGV)')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to force-link this tag to (Admin/Lead only)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('user_id')
                .setDescription('The Discord User ID to force-link this tag to (Admin/Lead only)')
                .setRequired(false)),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        const { EmbedBuilder, coc, data: dataManager, emoji: emojiUtils, config } = ctx;
        const client = input.client || ctx.client;
        const gtick = emojiUtils.getEmoji('gtick') || '✅';
        const bwrong = emojiUtils.getEmoji('bluex') || '❌';

        if (!checkPermission('link', input)) {
            const noPermMsg = `${bwrong} You do not have permission to use this command.`;
            if (isInteraction) return await input.reply({ content: noPermMsg, flags: [MessageFlags.Ephemeral] });
            return input.channel.send(noPermMsg);
        }
        if (!isInteraction && input.deletable) input.delete().catch(() => { });

        let targetUser = null;
        let playerTag = null;
        let explicitlySpecifiedTarget = false;
        const author = isInteraction ? input.user : input.author;
        const member = isInteraction ? input.member : input.member;
        const guild = input.guild;

        if (isInteraction) {
            await input.deferReply().catch(() => { });
            playerTag = input.options.getString('tag');
            const userOption = input.options.getUser('user');
            const userIdOption = input.options.getString('user_id');

            if (userOption) {
                targetUser = userOption;
                explicitlySpecifiedTarget = true;
            } else if (userIdOption) {
                const cleanId = userIdOption.replace(/[<@!>]/g, "").trim();
                if (!/^\d{15,22}$/.test(cleanId)) {
                    return input.editReply({ content: `${bwrong} Invalid Discord User ID provided. Must be a valid 17-20 digit number.` });
                }
                targetUser = await resolveUser(client, cleanId);
                explicitlySpecifiedTarget = true;
            } else {
                targetUser = author;
            }
        } else {
            if (args.length === 0) {
                return input.channel.send(`${emojiUtils.getEmoji('parrow')} Syntax: \`;link #TAG\` or \`;link @user/#ID #TAG\``);
            }

            // 1. Check if there's a mention
            if (input.mentions?.users?.size > 0) {
                targetUser = input.mentions.users.first();
                explicitlySpecifiedTarget = true;
            }

            // 2. Check if any arg is a snowflake ID or mention format
            let foundUserId = null;
            const nonUserArgs = [];

            for (const arg of args) {
                const clean = arg.replace(/[<@!>]/g, "").trim();
                if (!targetUser && !foundUserId && /^\d{15,22}$/.test(clean)) {
                    foundUserId = clean;
                } else if (targetUser && clean === targetUser.id) {
                    continue;
                } else {
                    nonUserArgs.push(arg);
                }
            }

            if (foundUserId) {
                targetUser = await resolveUser(client, foundUserId);
                explicitlySpecifiedTarget = true;
            }

            if (!targetUser) {
                targetUser = author;
            }

            const tagArgs = explicitlySpecifiedTarget ? nonUserArgs : args;
            playerTag = tagArgs.find(arg => arg.startsWith("#")) || tagArgs[0];

            if (explicitlySpecifiedTarget && !playerTag) {
                return input.channel.send(`Please provide a player tag. Example: \`;link <@${targetUser.id}> #TAG\` or \`;link ${targetUser.id} #TAG\``);
            }

            if (!playerTag) {
                return input.channel.send(`${emojiUtils.getEmoji('parrow')} Syntax: \`;link #TAG\` or \`;link @user/#ID #TAG\``);
            }
        }

        if (!playerTag.startsWith("#")) {
            playerTag = `#${playerTag}`;
        }

        // Permission check for force-link
        if (targetUser.id !== author.id) {
            const memberObj = member || (guild ? await guild.members.fetch(author.id).catch(() => null) : null);
            const hasPerm = canForceAction(author, memberObj, config, guild, dataManager);
            if (!hasPerm) {
                const noPermMsg = `${bwrong} You do not have permission to force-link accounts for other users.`;
                if (isInteraction) return await input.editReply({ content: noPermMsg });
                return input.channel.send(noPermMsg);
            }
        }

        try {
            const data = await coc.getPlayer(playerTag);
            const userData = dataManager.getUserData();

            let tagAlreadyLinkedUserId = null;
            for (const [userId, accounts] of Object.entries(userData)) {
                if (Array.isArray(accounts) && accounts.some(acc => acc.tag.toUpperCase() === data.tag.toUpperCase())) {
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
                        errorEmbed.setDescription(`\`${data.tag}\` is already linked to <@${targetUser.id}>.`);
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
                        const freshUserData = dataManager.getUserData();
                        if (!Array.isArray(freshUserData[targetUser.id])) {
                            freshUserData[targetUser.id] = [];
                        }

                        // Check if player had unlinked strikes in strikeplayers.json
                        const strikePlayers = dataManager.getStrikePlayers();
                        const unlinkedRecord = strikePlayers[data.tag] || null;

                        const newAccount = {
                            tag: data.tag,
                            name: data.name
                        };

                        if (unlinkedRecord) {
                            if (unlinkedRecord.totalStrikes) newAccount.totalStrikes = unlinkedRecord.totalStrikes;
                            if (unlinkedRecord.strikes) newAccount.strikes = unlinkedRecord.strikes;
                            if (unlinkedRecord.strikeHistory) newAccount.strikeHistory = unlinkedRecord.strikeHistory;
                            if (unlinkedRecord.sixStrikeAlertSent) newAccount.sixStrikeAlertSent = unlinkedRecord.sixStrikeAlertSent;
                            delete strikePlayers[data.tag];
                            dataManager.saveStrikePlayers(strikePlayers);
                        }

                        if (!freshUserData[targetUser.id].some(acc => acc.tag.toUpperCase() === data.tag.toUpperCase())) {
                            freshUserData[targetUser.id].push(newAccount);
                            dataManager.saveUserData(freshUserData);
                        }

                        const tickbox = emojiUtils.getEmoji('tickbox') || '✅';
                        const successEmbed = new EmbedBuilder()
                            .setColor('#57F287')
                            .setDescription(`${tickbox} Player (${data.tag}) force-linked to discord account <@${targetUser.id}>`);

                        await i.update({ embeds: [confirmEmbed], components: [] }).catch(() => {});
                        await i.channel.send({ embeds: [successEmbed] });
                    } else if (i.customId === 'cancel_link') {
                        const cancelEmbed = new EmbedBuilder()
                            .setTitle('❌ Action Cancelled')
                            .setDescription(`Force-linking has been cancelled.`)
                            .setColor(0xE74C3C);
                        await i.update({ embeds: [confirmEmbed], components: [] }).catch(() => {});
                        await i.channel.send({ embeds: [cancelEmbed] });
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

            // Self-link flow
            const strikePlayers = dataManager.getStrikePlayers();
            const unlinkedRecord = strikePlayers[data.tag] || null;

            const newAccount = {
                tag: data.tag,
                name: data.name
            };

            if (unlinkedRecord) {
                if (unlinkedRecord.totalStrikes) newAccount.totalStrikes = unlinkedRecord.totalStrikes;
                if (unlinkedRecord.strikes) newAccount.strikes = unlinkedRecord.strikes;
                if (unlinkedRecord.strikeHistory) newAccount.strikeHistory = unlinkedRecord.strikeHistory;
                if (unlinkedRecord.sixStrikeAlertSent) newAccount.sixStrikeAlertSent = unlinkedRecord.sixStrikeAlertSent;
                delete strikePlayers[data.tag];
                dataManager.saveStrikePlayers(strikePlayers);
            }

            if (!Array.isArray(userData[author.id])) {
                userData[author.id] = [];
            }

            userData[author.id].push(newAccount);
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
