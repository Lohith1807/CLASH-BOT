const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strikelist')
        .setDescription('List players with strikes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('linked')
                .setDescription('View strikes for Discord-linked members')
                .addStringOption(option =>
                    option.setName('clan')
                        .setDescription('Select a clan or "All Clans"')
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlinked')
                .setDescription('View strikes for players not on Discord')
                .addStringOption(option =>
                    option.setName('select')
                        .setDescription('Selection type')
                        .addChoices(
                            { name: 'All Players', value: 'all' },
                            { name: 'Search by Tag', value: 'tag' }
                        )
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Player tag (Required if searching by tag)')
                        .setRequired(false)
                )
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager, coc } = context;
        const clanData = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const choices = [{ name: "All Clans", value: "all" }];

        const clanPromises = Object.keys(clanData).map(async (tag) => {
            try {
                const clanInfo = await coc.getClan(tag);
                return { name: `${clanInfo.name} (${tag})`, value: tag };
            } catch (err) {
                return { name: `Clan (${tag})`, value: tag };
            }
        });

        const clanChoices = await Promise.all(clanPromises);
        choices.push(...clanChoices);

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { data: dataManager, coc } = context;
        const subcommand = interaction.options.getSubcommand();
        
        await interaction.deferReply();

        let finalStrikeList = [];
        let embedTitle = "";

        if (subcommand === 'linked') {
            const userData = dataManager.getUserData();
            const clanFilter = interaction.options.getString('clan');
            const showAll = clanFilter === 'all';
            
            const strikeList = [];
            if (showAll) {
                for (const userId in userData) {
                    for (const account of userData[userId]) {
                        const totalStrikes = account.totalStrikes || account.strikes || 0;
                        if (totalStrikes > 0) {
                            strikeList.push({
                                userId, tag: account.tag, name: account.name,
                                totalStrikes, strikeHistory: account.strikeHistory || []
                            });
                        }
                    }
                }
                embedTitle = "🩸 Blood Alliance Strike List (Linked)";
            } else {
                try {
                    const clanInfo = await coc.getClan(clanFilter);
                    embedTitle = `🩸 ${clanInfo.name} Strike List (Linked)`;
                    const members = clanInfo.memberList || [];
                    const tagMap = {};
                    for (const userId in userData) {
                        for (const account of userData[userId]) tagMap[account.tag] = { userId, account };
                    }
                    for (const member of members) {
                        const linked = tagMap[member.tag];
                        if (linked) {
                            const { userId, account } = linked;
                            const totalStrikes = account.totalStrikes || account.strikes || 0;
                            if (totalStrikes > 0) {
                                strikeList.push({
                                    userId, tag: account.tag, name: account.name, totalStrikes,
                                    strikeHistory: account.strikeHistory || [], clanName: clanInfo.name,
                                    role: member.role ? (member.role.charAt(0).toUpperCase() + member.role.slice(1)) : "Member",
                                    townHallLevel: member.townHallLevel
                                });
                            }
                        }
                    }
                } catch (err) {
                    return interaction.editReply({ content: "❌ Error fetching clan information." });
                }
            }

            if (strikeList.length === 0) {
                return interaction.editReply({ content: "✅ No linked players found with strikes for this selection." });
            }

            if (showAll) {
                finalStrikeList = await Promise.all(strikeList.map(async (player) => {
                    try {
                        const cocData = await coc.getPlayer(player.tag);
                        return {
                            ...player,
                            clanName: cocData.clan ? cocData.clan.name : "No Clan",
                            role: cocData.role ? (cocData.role.charAt(0).toUpperCase() + cocData.role.slice(1)) : "Member",
                            townHallLevel: cocData.townHallLevel
                        };
                    } catch (err) {
                        return { ...player, clanName: "Unknown", role: "Unknown", townHallLevel: 0 };
                    }
                }));
            } else {
                finalStrikeList = strikeList;
            }
        }

        else if (subcommand === 'unlinked') {
            const strikePlayers = dataManager.getStrikePlayers();
            const selectType = interaction.options.getString('select');
            const searchTag = interaction.options.getString('tag');
            
            let playersToProcess = [];
            if (selectType === 'tag') {
                if (!searchTag) return interaction.editReply({ content: "❌ Please provide a tag when searching by tag." });
                const tag = searchTag.startsWith("#") ? searchTag.toUpperCase() : `#${searchTag.toUpperCase()}`;
                if (strikePlayers[tag]) playersToProcess.push(strikePlayers[tag]);
                embedTitle = `🩸 Strike Search: ${tag} (Unlinked)`;
            } else {
                playersToProcess = Object.values(strikePlayers);
                embedTitle = "🩸 All Unlinked Players with Strikes";
            }

            if (playersToProcess.length === 0) {
                return interaction.editReply({ content: "✅ No unlinked players found with strikes." });
            }

            finalStrikeList = await Promise.all(playersToProcess.map(async (player) => {
                try {
                    const cocData = await coc.getPlayer(player.tag);
                    return {
                        ...player, isUnlinked: true,
                        clanName: cocData.clan ? cocData.clan.name : "No Clan",
                        role: cocData.role ? (cocData.role.charAt(0).toUpperCase() + cocData.role.slice(1)) : "Member",
                        townHallLevel: cocData.townHallLevel
                    };
                } catch (err) {
                    return { ...player, isUnlinked: true, clanName: "Unknown", role: "Unknown", townHallLevel: 0 };
                }
            }));
        }

        const { getEmoji } = require("../../../utils/emoji.js");
        let embeds = [];
        let currentEmbed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setColor(0xFF0000)
            .setTimestamp();

        let description = "";
        
        for (const p of finalStrikeList) {
            const thEmoji = getEmoji(`th${p.townHallLevel || 0}`);
            const playerLabel = p.isUnlinked ? `**${p.name}** (${p.tag})` : `<@${p.userId}>`;
            
            let playerSection = `${thEmoji} ${playerLabel} | ${p.clanName}, ${p.role}\n`;
            playerSection += `# of Strikes: ${p.strikeHistory.length}, Weight: ${p.totalStrikes}\n`;

            if (p.strikeHistory && p.strikeHistory.length > 0) {
                for (const strike of p.strikeHistory) {
                    playerSection += `\`${strike.id}\` | ${strike.date}\n`;
                    playerSection += `• ${strike.reason}\n`;
                    playerSection += `  (Added: ${strike.weight}, Total at time: ${strike.totalAtTime || "N/A"})\n\n`;
                }
            } else {
                playerSection += `• Old strike record\n\n`;
            }

            if ((description.length + playerSection.length) > 3800) {
                currentEmbed.setDescription(description);
                embeds.push(currentEmbed);
                currentEmbed = new EmbedBuilder()
                    .setTitle(`${embedTitle} (Continued)`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                description = playerSection;
            } else {
                description += playerSection;
            }
        }

        currentEmbed.setDescription(description);
        embeds.push(currentEmbed);

        await interaction.editReply({ embeds: embeds.slice(0, 10) });
    }
};
