const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

function canForceAction(author, member, config, guild) {
    if (!author) return false;
    const targetObj = member || author;
    if (checkPermission('forceunlink', targetObj)) return true;
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
                    member.permissions.has("ModerateMembers")
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
                ...(config?.ALL_STAFF_ROLE_IDS || [])
            ].filter(Boolean);

            if (allowedRoleIds.some(id => memberRoles.has(id))) {
                return true;
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
    name: "unlink",
    description: "Unlink a Clash of Clans account from a user (or force-unlink by @user or User ID)",
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink a Clash of Clans account from a user')
        .addStringOption(option => 
            option.setName('tag')
                .setDescription('The player tag to unlink (e.g. #YQGQQYGV)')
                .setRequired(false))
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to force-unlink this tag from (Admin only)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('user_id')
                .setDescription('The Discord User ID to force-unlink this tag from (Admin only)')
                .setRequired(false)),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        try {
            const { EmbedBuilder, emoji: emojiUtils, data: dataManager, config } = ctx;
            const client = input.client || ctx.client;
            const gtick = emojiUtils.getEmoji('gtick') || '✅';
            const bwrong = emojiUtils.getEmoji('bluex') || '❌';

            if (!checkPermission('unlink', input)) {
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
            const memberObj = member || (guild ? await guild.members.fetch(author.id).catch(() => null) : null);
            const isStaffOrAdmin = canForceAction(author, memberObj, config, guild);

            const userData = dataManager.getUserData();

            if (isInteraction) {
                await input.deferReply().catch(() => {});
                const tagOption = input.options.getString('tag');
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
                }

                if (tagOption) {
                    playerTag = tagOption.trim();
                }
            } else {
                if (args.length === 0) {
                    const authorAccounts = userData[author.id] || [];
                    if (authorAccounts.length === 1) {
                        targetUser = author;
                        playerTag = authorAccounts[0].tag;
                    } else if (authorAccounts.length > 1) {
                        const accList = authorAccounts.map(a => `• \`${a.tag}\` (${a.name || 'Unknown'})`).join("\n");
                        const embed = new EmbedBuilder()
                            .setTitle(`${emojiUtils.getEmoji('parrow')} Specify Account to Unlink`)
                            .setDescription(`You have multiple linked accounts:\n${accList}\n\nUsage: \`;unlink #TAG\` or \`;unlink @user/#ID [#TAG]\``)
                            .setColor(getRandomColor());
                        return input.channel.send({ embeds: [embed] });
                    } else {
                        const embed = new EmbedBuilder()
                            .setTitle(`${emojiUtils.getEmoji('parrow')} Incorrect Usage`)
                            .setDescription("Usage: `;unlink #TAG` or `;unlink @user/#ID [#TAG]`")
                            .setColor(getRandomColor());
                        return input.channel.send({ embeds: [embed] });
                    }
                } else {
                    if (input.mentions?.users?.size > 0) {
                        targetUser = input.mentions.users.first();
                        explicitlySpecifiedTarget = true;
                    }

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

                    const tagCandidates = explicitlySpecifiedTarget ? nonUserArgs : args;
                    if (tagCandidates.length > 0) {
                        playerTag = tagCandidates.find(arg => arg.startsWith("#")) || tagCandidates[0];
                    }
                }
            }

            if (!targetUser) {
                targetUser = author;
            }

            // Permission check if target is someone else
            if (targetUser.id !== author.id) {
                if (!isStaffOrAdmin) {
                    const noPermEmbed = new EmbedBuilder()
                        .setTitle(`${bwrong} Permission Denied`)
                        .setDescription("You do not have permission to force-unlink accounts for other users.")
                        .setColor(0xE74C3C);
                    if (isInteraction) return await input.editReply({ embeds: [noPermEmbed] });
                    return input.channel.send({ embeds: [noPermEmbed] });
                }
            }

            // If playerTag was not provided, check targetUser's accounts
            if (!playerTag) {
                const targetAccounts = userData[targetUser.id] || [];
                if (targetAccounts.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle(`${emojiUtils.getEmoji('babyd')} No Linked Accounts`)
                        .setDescription(`No linked accounts found for <@${targetUser.id}>.`)
                        .setColor(getRandomColor());
                    if (isInteraction) return await input.editReply({ embeds: [embed] });
                    return input.channel.send({ embeds: [embed] });
                } else if (targetAccounts.length === 1) {
                    playerTag = targetAccounts[0].tag;
                } else {
                    const accList = targetAccounts.map(a => `• \`${a.tag}\` (${a.name || 'Unknown'})`).join("\n");
                    const syntaxHint = isInteraction
                        ? (targetUser.id === author.id ? '/unlink tag: #TAG' : '/unlink tag: #TAG user: ...')
                        : (targetUser.id === author.id ? ';unlink #TAG' : `;unlink ${targetUser.id} #TAG`);
                    const embed = new EmbedBuilder()
                        .setTitle(`${emojiUtils.getEmoji('parrow')} Multiple Accounts Found`)
                        .setDescription(`<@${targetUser.id}> has multiple linked accounts:\n${accList}\n\nPlease specify which tag to unlink:\n\`${syntaxHint}\``)
                        .setColor(getRandomColor());
                    if (isInteraction) return await input.editReply({ embeds: [embed] });
                    return input.channel.send({ embeds: [embed] });
                }
            }

            let cleanTag = playerTag.replace("#", "").toUpperCase();

            // If target wasn't explicitly specified and author doesn't have this tag,
            // check if tag belongs to another user in database (if author is staff/admin)
            if (!explicitlySpecifiedTarget && targetUser.id === author.id) {
                const authorAccounts = userData[author.id] || [];
                const hasTag = authorAccounts.some(acc => acc.tag.replace("#", "").toUpperCase() === cleanTag);
                if (!hasTag && isStaffOrAdmin) {
                    for (const [uid, accounts] of Object.entries(userData)) {
                        if (Array.isArray(accounts) && accounts.some(acc => acc.tag.replace("#", "").toUpperCase() === cleanTag)) {
                            targetUser = await resolveUser(client, uid);
                            break;
                        }
                    }
                }
            }

            if (!userData[targetUser.id] || userData[targetUser.id].length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${emojiUtils.getEmoji('babyd')} No Linked Accounts`)
                    .setDescription(`No linked accounts found for <@${targetUser.id}>.`)
                    .setColor(getRandomColor());
                if (isInteraction) return await input.editReply({ embeds: [embed] });
                return input.channel.send({ embeds: [embed] });
            }

            const beforeCount = userData[targetUser.id].length;
            const removedAccount = userData[targetUser.id].find(
                acc => acc.tag.replace("#", "").toUpperCase() === cleanTag
            );

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

            // Preserve strikes in strikeplayers.json if any exist
            if (removedAccount && (removedAccount.totalStrikes > 0 || (removedAccount.strikeHistory && removedAccount.strikeHistory.length > 0))) {
                const strikePlayers = dataManager.getStrikePlayers();
                strikePlayers[removedAccount.tag] = {
                    name: removedAccount.name,
                    tag: removedAccount.tag,
                    totalStrikes: removedAccount.totalStrikes || 0,
                    strikes: removedAccount.totalStrikes || 0,
                    strikeHistory: removedAccount.strikeHistory || [],
                    sixStrikeAlertSent: removedAccount.sixStrikeAlertSent || false
                };
                dataManager.saveStrikePlayers(strikePlayers);
            }

            if (userData[targetUser.id].length === 0) {
                delete userData[targetUser.id];
            }

            dataManager.saveUserData(userData);

            const embed = new EmbedBuilder()
                .setColor(getRandomColor())
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${author.tag}`,
                    iconURL: author.displayAvatarURL()
                });

            const accountDisplayName = removedAccount?.name 
                ? `**${removedAccount.name}** (\`#${cleanTag}\`)`
                : `**#${cleanTag}**`;

            if (targetUser.id === author.id) {
                embed
                    .setTitle(`${gtick} Successfully Unlinked`)
                    .setDescription(`Your account ${accountDisplayName} has been unlinked.`);
            } else {
                embed
                    .setTitle(`${gtick} Successfully Force-Unlinked`)
                    .setDescription(`Account ${accountDisplayName} has been force-unlinked from <@${targetUser.id}>.`)
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
