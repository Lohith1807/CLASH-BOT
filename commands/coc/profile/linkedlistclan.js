const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: "discord-links",
    description: "List all clan players and check if linked",
    data: new SlashCommandBuilder()
        .setName('discord-links')
        .setDescription('List all clan players and check if linked')
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('The clan tag to check')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const choices = Object.entries(clanRoles).map(([tag, data]) => ({
            name: `${data.nickName || "Unknown"} (${tag})`,
            value: tag
        }));

        const filtered = choices.filter(choice => 
            choice.name.toLowerCase().includes(focusedValue) || 
            choice.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(filtered);
    },

    async execute(source, second, third) {
        if (source.isChatInputCommand && source.isChatInputCommand()) {
            const context = second;
            const clanTag = source.options.getString('clantag');
            await this.run(source, clanTag, context, true);
        } else {
            const message = source;
            const args = second;
            const context = third;
            const clanTag = args ? args[0] : null;
            if (!clanTag) {
                const clanRoles = context.data.getClanRoles();
                const clanList = Object.entries(clanRoles)
                    .map(([tag, data]) => `• **${data.nickName || "Unknown"}**: \`${tag}\``)
                    .join("\n");
                return message.channel.send(`❌ Provide a clan tag. Example: \`;discord-links #CYQVL002\`\n\n**Available clans from registry:**\n${clanList || "None registered"}`).catch(() => {});
            }
            await this.run(message, clanTag, context, false);
        }
    },

    async run(source, clanTag, context, isInteraction = true, isRefresh = false) {
        const { EmbedBuilder, coc, data: dataManager, client, emoji: emojiUtils } = context;
        const userData = dataManager.getUserData();
        const tickbox = emojiUtils.getEmoji("tickbox") || "✅";
        const wrongbox = emojiUtils.getEmoji("wrongbox") || "❌";
        const memEmoji = emojiUtils.getEmoji("mem") || "👥";
        const discordEmoji = client.emojis.cache.find(e => e.name.toLowerCase() === 'discord') || "💬";

        const tagToUser = {};
        for (const [discordId, accounts] of Object.entries(userData)) {
            if (Array.isArray(accounts)) {
                accounts.forEach(acc => {
                    tagToUser[acc.tag.replace("#", "").toUpperCase()] = discordId;
                });
            }
        }

        try {
            if (isInteraction && !isRefresh) await source.deferReply();

            const clanData = await coc.getClan(clanTag).catch(e => {
                if (e?.response?.status === 404 || e?.status === 404) {
                    return null; // clan not found
                }
                throw e; // re-throw other errors
            });
            if (!clanData || !clanData.memberList) {
                const err = `❌ Clan \`${clanTag}\` not found. Make sure the tag is correct.`;
                return isInteraction ? source.editReply(err) : source.channel.send(err);
            }

            const uniqueDiscordIds = new Set();
            clanData.memberList.forEach(m => {
                const cleanTag = m.tag.replace("#", "").toUpperCase();
                const discordId = tagToUser[cleanTag];
                if (discordId) uniqueDiscordIds.add(discordId);
            });

            const { Collection } = require('discord.js');
            const allMembers = new Collection();
            if (source.guild) {
                let lastId = '0';
                while (true) {
                    const members = await source.guild.members.fetch({ limit: 1000, after: lastId }).catch(() => null);
                    if (!members || members.size === 0) break;
                    for (const [id, member] of members) {
                        allMembers.set(id, member);
                    }
                    if (members.size < 1000) break;
                    const keys = Array.from(members.keys());
                    lastId = keys[keys.length - 1];
                }
            }

            const unresolvedIds = [];
            uniqueDiscordIds.forEach(id => {
                if (!allMembers || !allMembers.has(id)) {
                    unresolvedIds.push(id);
                }
            });

            const resolvedUsernames = {};
            if (unresolvedIds.length > 0) {
                await Promise.all(unresolvedIds.map(id =>
                    client.users.fetch(id)
                        .then(u => { resolvedUsernames[id] = u.username; })
                        .catch(() => { resolvedUsernames[id] = "Unknown"; })
                ));
            }

            let maxNameLength = 15;
            clanData.memberList.forEach(m => {
                const len = m.name.replace(/`/g, "").length;
                if (len > maxNameLength) maxNameLength = len;
            });

            const headerName = "Name".padEnd(maxNameLength, ' ');
            const headerLinked = `${discordEmoji} \`${headerName}\` **Discord**\n`;
            const headerNotLinked = `${discordEmoji} \`${headerName}\` **Player Tag**\n`;

            const linkedLines = [];
            const notLinkedLines = [];
            let linkedCount = 0;
            let notLinkedCount = 0;

            // Track how many clan accounts each Discord user has
            const discordIdAccountCount = {};
            const discordIdUsername = {};

            for (const m of clanData.memberList) {
                const cleanTag = m.tag.replace("#", "").toUpperCase();
                const discordId = tagToUser[cleanTag];

                const cleanName = m.name.replace(/`/g, "'");
                const paddedName = cleanName.padEnd(maxNameLength, ' ');

                if (discordId) {
                    linkedCount++;
                    let username = "Unknown";
                    if (allMembers && allMembers.has(discordId)) {
                        username = allMembers.get(discordId).user.username;
                    } else if (resolvedUsernames[discordId]) {
                        username = resolvedUsernames[discordId];
                    }
                    linkedLines.push(`${tickbox} \`${paddedName}\` ${username}`);

                    // Tally accounts per Discord user
                    discordIdAccountCount[discordId] = (discordIdAccountCount[discordId] || 0) + 1;
                    discordIdUsername[discordId] = username;
                } else {
                    notLinkedCount++;
                    notLinkedLines.push(`${wrongbox} \`${paddedName}\` ${m.tag}`);
                }
            }

            // Build Multiple IDs list — users with 2+ accounts in this clan
            const multipleIdsLines = [];
            for (const [id, count] of Object.entries(discordIdAccountCount)) {
                if (count >= 2) {
                    const uname = discordIdUsername[id] || "Unknown";
                    multipleIdsLines.push(`${memEmoji} **${uname}** : ${count} Accounts`);
                }
            }
            // Sort descending by account count for easy reading
            multipleIdsLines.sort((a, b) => {
                const numA = parseInt(a.match(/(\d+) Accounts/)?.[1] || "0");
                const numB = parseInt(b.match(/(\d+) Accounts/)?.[1] || "0");
                return numB - numA;
            });

            const linkedChunks = [];
            let currentLinkedChunk = headerLinked;
            for (const line of linkedLines) {
                if ((currentLinkedChunk.length + line.length + 1) > 3500) {
                    linkedChunks.push(currentLinkedChunk);
                    currentLinkedChunk = headerLinked + line + "\n";
                } else {
                    currentLinkedChunk += line + "\n";
                }
            }
            if (currentLinkedChunk && currentLinkedChunk !== headerLinked) {
                linkedChunks.push(currentLinkedChunk);
            }

            const notLinkedChunks = [];
            let currentNotLinkedChunk = headerNotLinked;
            for (const line of notLinkedLines) {
                if ((currentNotLinkedChunk.length + line.length + 1) > 3500) {
                    notLinkedChunks.push(currentNotLinkedChunk);
                    currentNotLinkedChunk = headerNotLinked + line + "\n";
                } else {
                    currentNotLinkedChunk += line + "\n";
                }
            }
            if (currentNotLinkedChunk && currentNotLinkedChunk !== headerNotLinked) {
                notLinkedChunks.push(currentNotLinkedChunk);
            }

            const allEmbeds = [];
            const footerText = `${linkedCount}✓ | ${notLinkedCount}✗`;

            for (let i = 0; i < linkedChunks.length; i++) {
                const partSuffix = linkedChunks.length > 1 ? ` (Part ${i + 1}/${linkedChunks.length})` : "";
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${clanData.name} Discord Links${partSuffix}`,
                        iconURL: clanData.badgeUrls.small
                    })
                    .setDescription(linkedChunks[i])
                    .setColor(0x2b2d31)
                    .setFooter({ text: footerText })
                    .setTimestamp();
                allEmbeds.push(embed);
            }

            for (let i = 0; i < notLinkedChunks.length; i++) {
                const partSuffix = notLinkedChunks.length > 1 ? ` (Part ${i + 1}/${notLinkedChunks.length})` : "";
                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: `${clanData.name} Pending Links${partSuffix}`,
                        iconURL: clanData.badgeUrls.small
                    })
                    .setDescription(notLinkedChunks[i])
                    .setColor(0x2b2d31)
                    .setFooter({ text: footerText })
                    .setTimestamp();
                allEmbeds.push(embed);
            }

            // Multiple IDs embed — only shown when at least one user has 2+ accounts
            if (multipleIdsLines.length > 0) {
                const multipleIdsChunks = [];
                let currentChunk = "";
                for (const line of multipleIdsLines) {
                    if ((currentChunk.length + line.length + 1) > 3500) {
                        multipleIdsChunks.push(currentChunk);
                        currentChunk = line + "\n";
                    } else {
                        currentChunk += line + "\n";
                    }
                }
                if (currentChunk) multipleIdsChunks.push(currentChunk);

                for (let i = 0; i < multipleIdsChunks.length; i++) {
                    const partSuffix = multipleIdsChunks.length > 1 ? ` (Part ${i + 1}/${multipleIdsChunks.length})` : "";
                    const embed = new EmbedBuilder()
                        .setAuthor({
                            name: `${clanData.name} Multiple IDs${partSuffix}`,
                            iconURL: clanData.badgeUrls.small
                        })
                        .setTitle("Multiple IDs")
                        .setDescription(multipleIdsChunks[i])
                        .setColor(0xf5a623)
                        .setFooter({ text: `${multipleIdsLines.length} user(s) with multiple accounts` })
                        .setTimestamp();
                    allEmbeds.push(embed);
                }
            }

            if (allEmbeds.length > 0) {
                const refreshEmoji = emojiUtils.getEmojiObject("refresh");
                const refreshBtn = new ButtonBuilder()
                    .setCustomId("discordlinks_refresh_" + clanTag.replace("#", ""))
                    .setLabel("Refresh Data")
                    .setStyle(ButtonStyle.Secondary);
                
                if (refreshEmoji) {
                    refreshBtn.setEmoji(refreshEmoji);
                } else {
                    refreshBtn.setEmoji("🔄");
                }
                
                const row = new ActionRowBuilder().addComponents(refreshBtn);

                if (isInteraction) {
                    await source.editReply({ embeds: allEmbeds, components: [row] });
                } else {
                    await source.channel.send({ embeds: allEmbeds, components: [row] });
                }
            }
        } catch (err) {
            console.error(err);
            const status = err?.response?.status || err?.status;
            let errMs = "❌ Error fetching clan data.";
            if (status === 404) {
                errMs = `❌ Clan \`${clanTag}\` not found. Make sure the tag is correct.`;
            } else if (status === 403) {
                errMs = "❌ Access denied. API key may be invalid or IP not whitelisted.";
            } else if (status === 429) {
                errMs = "❌ Rate limited. Please try again in a moment.";
            }
            if (isInteraction) source.editReply(errMs).catch(() => {}); else source.channel.send(errMs).catch(() => {});
        }
    }
};
