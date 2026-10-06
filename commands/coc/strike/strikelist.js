const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strike-list')
        .setDescription('View strike list')
        .addStringOption(option =>
            option.setName('view')
                .setDescription('Select a group or a specific clan')
                .setAutocomplete(true)
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanData = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Order: All Clans → Players List → individual FWA clans (from clanrole.json)
        const choices = [
            { name: "All Clans", value: "all_clans" },
            { name: "Players List (Non-Linked Players)", value: "unlinked_players" },
        ];

        // Add individual clans from clanrole.json using nickName
        for (const [tag, config] of Object.entries(clanData)) {
            const nick = config.nickName || tag;
            choices.push({ name: nick, value: tag });
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { data: dataManager, coc } = context;
        const selection = interaction.options.getString('view');

        try { await interaction.deferReply(); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        let finalStrikeList = [];
        let embedTitle = "";
        const userData = dataManager.getUserData();
        const strikePlayers = dataManager.getStrikePlayers();
        const clanRoles = dataManager.getClanRoles();

        if (selection === 'unlinked_players') {
            // --- Players List: non-linked only ---
            const playersToProcess = Object.values(strikePlayers);
            embedTitle = "🩸 Players List (Non-Linked Players)";
            if (playersToProcess.length === 0) {
                return interaction.editReply({ content: "✅ No non-linked players found with strikes." });
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

        } else if (selection === 'all_clans') {
            // --- All Clans: linked + non-linked players ---
            embedTitle = "🩸 All Clans Strike List";

            // Linked players
            for (const userId in userData) {
                for (const account of userData[userId]) {
                    if (!account.tag) continue; // skip entries with no tag
                    const totalStrikes = account.totalStrikes || account.strikes || 0;
                    if (totalStrikes > 0) {
                        finalStrikeList.push({
                            userId, tag: account.tag, name: account.name,
                            totalStrikes, strikeHistory: account.strikeHistory || [],
                            isUnlinked: false
                        });
                    }
                }
            }

            // Non-linked players
            for (const player of Object.values(strikePlayers)) {
                if (!player.tag) continue; // skip entries with no tag
                const totalStrikes = player.totalStrikes || 0;
                if (totalStrikes > 0) {
                    finalStrikeList.push({
                        ...player,
                        isUnlinked: true
                    });
                }
            }

            if (finalStrikeList.length === 0) {
                return interaction.editReply({ content: "✅ No players found with strikes." });
            }

            // Enrich with live CoC data
            finalStrikeList = await Promise.all(finalStrikeList.map(async (player) => {
                if (!player.tag) return { ...player, clanName: "Unknown", role: "Unknown", townHallLevel: 0 };
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
            // --- Specific clan tag ---
            const tagMap = {};
            for (const userId in userData) {
                for (const account of userData[userId]) {
                    tagMap[account.tag] = { userId, account, isLinked: true };
                }
            }
            for (const unlinkedTag in strikePlayers) {
                if (!tagMap[unlinkedTag]) {
                    tagMap[unlinkedTag] = { account: strikePlayers[unlinkedTag], isLinked: false };
                }
            }

            try {
                const clanInfo = await coc.getClan(selection);
                const clanNick = clanRoles[selection] ? clanRoles[selection].nickName : clanInfo.name;
                embedTitle = `🩸 ${clanNick} — ${clanInfo.name} Strike List`;
                const members = clanInfo.memberList || [];

                for (const member of members) {
                    const mapped = tagMap[member.tag];
                    if (mapped) {
                        const { userId, account, isLinked } = mapped;
                        const totalStrikes = account.totalStrikes || account.strikes || 0;
                        if (totalStrikes > 0) {
                            finalStrikeList.push({
                                userId: isLinked ? userId : null,
                                isUnlinked: !isLinked,
                                tag: account.tag, name: account.name, totalStrikes,
                                strikeHistory: account.strikeHistory || [], clanName: clanInfo.name,
                                role: member.role ? (member.role.charAt(0).toUpperCase() + member.role.slice(1)) : "Member",
                                townHallLevel: member.townHallLevel
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`Error fetching clan ${selection}:`, err.message);
                return interaction.editReply({ content: "❌ Could not fetch clan data. Check the clan tag." });
            }

            if (finalStrikeList.length === 0) {
                return interaction.editReply({ content: "✅ No players found with strikes in this clan." });
            }
        }

        const { getEmoji } = require("../../../utils/emoji.js");
        let pages = [];
        let currentDesc = "";

        for (const p of finalStrikeList) {
            const thEmoji = getEmoji(`th${p.townHallLevel || 0}`);
            const nlTag = p.isUnlinked ? " **(N/L)**" : "";
            const playerLabel = `**${p.name}**${nlTag}`;

            let playerSection = `${thEmoji} ${playerLabel} | ${p.clanName}, ${p.role}\n`;
            playerSection += `No of Strikes: ${p.strikeHistory ? p.strikeHistory.length : 0}, Weight: ${p.totalStrikes}\n`;

            if (p.strikeHistory && p.strikeHistory.length > 0) {
                for (const strike of p.strikeHistory) {
                    playerSection += `\`${strike.id}\` | ${strike.date}\n`;
                    playerSection += `• ${strike.reason}\n`;
                }
            } else {
                playerSection += `• Old strike record\n`;
            }
            playerSection += `\n`;

            if ((currentDesc.length + playerSection.length) > 3500) {
                if (currentDesc.trim().length > 0) {
                    pages.push(currentDesc);
                    currentDesc = "";
                }
            }

            if (playerSection.length > 3500) {
                const lines = playerSection.split("\n");
                for (const line of lines) {
                    if ((currentDesc.length + line.length + 1) > 3500) {
                        if (currentDesc.trim().length > 0) {
                            pages.push(currentDesc);
                            currentDesc = "";
                        }
                    }
                    currentDesc += line + "\n";
                }
            } else {
                currentDesc += playerSection;
            }
        }

        if (currentDesc.trim().length > 0) {
            pages.push(currentDesc);
        }

        if (pages.length === 0) {
            return interaction.editReply({ content: "✅ No strike records to display." });
        }

        const totalPages = pages.length;
        const embeds = pages.map((desc, idx) => {
            return new EmbedBuilder()
                .setTitle(totalPages > 1 ? `${embedTitle} (${idx + 1}/${totalPages})` : embedTitle)
                .setDescription(desc)
                .setColor(0xFF0000)
                .setFooter({ text: `Page ${idx + 1} of ${totalPages} • Total Players: ${finalStrikeList.length}` })
                .setTimestamp();
        });

        const getRow = (currPage, total) => {
            if (total <= 1) return [];
            return [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('strikelist_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currPage === 0),
                    new ButtonBuilder()
                        .setCustomId('strikelist_page')
                        .setLabel(`${currPage + 1}/${total}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('strikelist_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currPage === total - 1)
                )
            ];
        };

        let currentPage = 0;
        const msg = await interaction.editReply({
            embeds: [embeds[currentPage]],
            components: getRow(currentPage, totalPages)
        });

        if (totalPages > 1 && msg && typeof msg.createMessageComponentCollector === 'function') {
            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 15 * 60 * 1000 // 15 minutes
            });

            collector.on('collect', async (i) => {
                try {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({ content: "⚠️ You cannot use these pagination controls.", flags: [MessageFlags.Ephemeral] });
                    }

                    if (i.customId === 'strikelist_prev' && currentPage > 0) {
                        currentPage--;
                    } else if (i.customId === 'strikelist_next' && currentPage < totalPages - 1) {
                        currentPage++;
                    }

                    await i.update({
                        embeds: [embeds[currentPage]],
                        components: getRow(currentPage, totalPages)
                    });
                } catch (btnErr) {
                    if (btnErr.code !== 10062 && btnErr.code !== 40060) {
                        console.error("strikelist button error:", btnErr);
                    }
                }
            });

            collector.on('end', async () => {
                try {
                    await interaction.editReply({ components: [] });
                } catch {}
            });
        }
    }
};
