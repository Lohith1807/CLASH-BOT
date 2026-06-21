const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ComponentType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const clanRolesPath = path.join(__dirname, '../../../data/clanrole.json');
const wwPath = path.join(__dirname, '../../../data/ww.json');
const emojiUtils = require('../../../utils/emoji.js');

function formatDaysAgo(dateStr) {
    if (!dateStr) return dateStr;
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return dateStr;

    const [_, dayStr, monthStr, yearStr] = match;
    const d = parseInt(dayStr, 10);
    const m = parseInt(monthStr, 10);
    const y = parseInt(yearStr, 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const subDate = new Date(y, m - 1, d);
    subDate.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - subDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let suffix = "";
    if (diffDays === 0) {
        suffix = " (today)";
    } else if (diffDays === 1) {
        suffix = " (1 day ago)";
    } else if (diffDays > 1) {
        suffix = ` (${diffDays} days ago)`;
    } else if (diffDays === -1) {
        suffix = " (tomorrow)";
    } else if (diffDays < -1) {
        suffix = ` (in ${Math.abs(diffDays)} days)`;
    }

    return dateStr.replace(`${dayStr}/${monthStr}/${yearStr}`, `${dayStr}/${monthStr}/${yearStr}${suffix}`);
}


async function fetchFwaRoster(clanTag) {
    const statsWorkerBase = process.env.FWASTATS_WORKER_URL;
    const url = `https://fwastats.com/Clan/${clanTag.replace("#", "")}/Members.json`;
    const fwaHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": process.env.FWA_COOKIE || ""
    };

    try {
        let res;
        if (statsWorkerBase) {
            res = await fetch(`${statsWorkerBase}?url=${encodeURIComponent(url)}`, {
                headers: { "Fwa-Cookie": process.env.FWA_COOKIE || "" }
            });
        } else {
            res = await fetch(url, { headers: fwaHeaders });
        }
        if (res.ok) {
            return await res.json();
        }
    } catch (fetchErr) {
        console.error("fetchFwaRoster error:", fetchErr);
    }
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ww-player')
        .setDescription('⚙️ Manage tracking players for FWA weight updates')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Select the FWA clan')
                .setAutocomplete(true)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('player1')
                .setDescription('First tracking player tag (Optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('player2')
                .setDescription('Second tracking player tag (Optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('player3')
                .setDescription('Third tracking player tag (Optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('player4')
                .setDescription('Fourth tracking player tag (Optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('player5')
                .setDescription('Fifth tracking player tag (Optional)')
                .setRequired(false)
        ),

    async autocomplete(interaction, context) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        let clanRoles = {};
        try {
            if (fs.existsSync(clanRolesPath)) {
                clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, 'utf8'));
            }
        } catch {}

        const fwaClanTags = Object.keys(clanRoles).filter(tag => clanRoles[tag].clanType !== 'war');
        
        const choices = [];
        for (const tag of fwaClanTags) {
            const nick = clanRoles[tag].nickName || '';
            const label = nick ? `${nick} (${tag})` : tag;
            choices.push({ name: label, value: tag });
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25)).catch(() => {});
    },

    async execute(interaction, context) {
        const { coc } = context;
        await interaction.deferReply({ ephemeral: true });

        const clanTag = interaction.options.getString('clan');

        // Resolve all player inputs (1 to 5)
        const playerInputs = [];
        for (let i = 1; i <= 5; i++) {
            const val = interaction.options.getString(`player${i}`);
            if (val) {
                let pTag = val.toUpperCase().trim().replace(/O/g, '0');
                if (!pTag.startsWith('#')) {
                    pTag = '#' + pTag;
                }
                playerInputs.push(pTag);
            }
        }

        // Resolve clan name
        let clanName = clanTag;
        try {
            if (fs.existsSync(clanRolesPath)) {
                const clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, 'utf8'));
                if (clanRoles[clanTag] && clanRoles[clanTag].nickName) {
                    clanName = clanRoles[clanTag].nickName;
                }
            }
            const cocClan = await coc.getClan(clanTag).catch(() => null);
            if (cocClan) {
                clanName = cocClan.name;
            }
        } catch {}

        // Load ww.json
        let wwData = {};
        if (fs.existsSync(wwPath)) {
            try {
                wwData = JSON.parse(fs.readFileSync(wwPath, 'utf8'));
            } catch {}
        }

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const todayStr = `${day}/${month}/${year}`;

        // If player options are provided, add/update them first
        let addedFeedback = [];
        let failedFeedback = [];
        if (playerInputs.length > 0) {
            const clanData = await fetchFwaRoster(clanTag);
            if (!clanData || !Array.isArray(clanData)) {
                return interaction.editReply({ content: `${emojiUtils.getEmoji("wrongbox")} Failed to fetch members list from FWAStats for clan \`${clanTag}\`.` });
            }

            if (!wwData[clanTag]) {
                wwData[clanTag] = {
                    clanName: clanName,
                    lastUpdated: todayStr,
                    players: {}
                };
            }

            if (!wwData[clanTag].players) {
                wwData[clanTag].players = {};
            }

            let dateUpdated = false;

            for (const playerTag of playerInputs) {
                const formattedPlayerTag = playerTag.toUpperCase().trim();
                const playerObj = clanData.find(p => p.tag && p.tag.toUpperCase().trim() === formattedPlayerTag);

                if (!playerObj) {
                    failedFeedback.push(`\`${playerTag}\` (not in roster)`);
                    continue;
                }

                const currentWeight = parseInt(playerObj.weight, 10);
                const oldWeight = wwData[clanTag].players[playerTag];

                if (oldWeight !== currentWeight) {
                    wwData[clanTag].players[playerTag] = currentWeight;
                    dateUpdated = true;
                }
                addedFeedback.push(`**${playerObj.name}** (${playerTag})`);
            }

            if (dateUpdated) {
                wwData[clanTag].lastUpdated = todayStr;

                // Log update to WW log channel
                try {
                    const logChannel = await interaction.client.channels.fetch("1516719047348326493").catch(() => null);
                    if (logChannel) {
                        await logChannel.send(`${emojiUtils.getEmoji("alaram")} **FWA Weight Update Detected!**\nClan: **${clanName}** (${clanTag})\nNew weight update submitted on: **${todayStr}**`).catch(() => {});
                    }
                } catch (err) {
                    console.error("Failed to send log message on initial add:", err);
                }
            }

            try {
                fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), 'utf8');
            } catch (err) {
                console.error("Error writing ww.json in ww-player command:", err);
                return interaction.editReply({ content: `${emojiUtils.getEmoji("wrongbox")} Failed to write configuration to \`ww.json\`.` });
            }
        }

        const getEmbed = (data, tag, cName) => {
            const record = data[tag];
            const embed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("clancastle")} Tracked Players for ${cName}`)
                .setColor(0x00FF00)
                .setDescription(`These players are used to check for weight updates.\n**Last Updated**: ${record ? formatDaysAgo(record.lastUpdated) : 'Never'}`)
                .setTimestamp();

            if (!record || !record.players || Object.keys(record.players).length === 0) {
                embed.setDescription(`No players are currently tracked for clan **${cName}**.\nUse the \`player1-5\` options in \`/ww-player\` to add players.`);
                return embed;
            }

            const fields = Object.entries(record.players).map(([pTag, weight]) => ({
                name: pTag,
                value: `Saved Weight: **${weight.toLocaleString()}**`,
                inline: true
            }));

            embed.addFields(fields);
            return embed;
        };

        const getComponents = (data, tag, selectedTag) => {
            const record = data[tag];
            if (!record || !record.players || Object.keys(record.players).length === 0) {
                return [];
            }

            const menuRow = new ActionRowBuilder();
            const btnRow = new ActionRowBuilder();

            const menu = new StringSelectMenuBuilder()
                .setCustomId('wwplayer_select')
                .setPlaceholder('Select a player to manage...')
                .addOptions(
                    Object.keys(record.players).map(pTag => ({
                        label: pTag,
                        value: pTag,
                        default: pTag === selectedTag
                    }))
                );
            menuRow.addComponents(menu);

            const updateBtn = new ButtonBuilder()
                .setCustomId('wwplayer_update')
                .setLabel('Update Weight')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(emojiUtils.getEmojiObject('refresh'))
                .setDisabled(!selectedTag);

            const removeBtn = new ButtonBuilder()
                .setCustomId('wwplayer_remove')
                .setLabel('Remove Player')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(emojiUtils.getEmojiObject('delete'))
                .setDisabled(!selectedTag);

            btnRow.addComponents(updateBtn, removeBtn);
            return [menuRow, btnRow];
        };

        let initialContent = "";
        if (playerInputs.length > 0) {
            initialContent = `${emojiUtils.getEmoji("gtick")} processed adding players:\n`;
            if (addedFeedback.length > 0) {
                initialContent += `${emojiUtils.getEmoji("tickbox")} **Added**: ${addedFeedback.join(', ')}\n`;
            }
            if (failedFeedback.length > 0) {
                initialContent += `${emojiUtils.getEmoji("wrongbox")} **Failed**: ${failedFeedback.join(', ')}\n`;
            }
        } else {
            initialContent = `${emojiUtils.getEmoji("clancastle")} Tracked players management list.`;
        }
        const reply = await interaction.editReply({
            content: initialContent,
            embeds: [getEmbed(wwData, clanTag, clanName)],
            components: getComponents(wwData, clanTag, null)
        });

        const collector = reply.createMessageComponentCollector({
            time: 10 * 60 * 1000 // 10 minutes
        });

        let activeSelectedTag = null;

        collector.on('collect', async (i) => {
            try {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} You cannot use these components.`, ephemeral: true });
                }

                if (i.customId === 'wwplayer_select') {
                    activeSelectedTag = i.values[0];
                    await i.update({
                        components: getComponents(wwData, clanTag, activeSelectedTag)
                    });
                } else if (i.customId === 'wwplayer_update') {
                    if (!activeSelectedTag) return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} No player selected!`, ephemeral: true });
                    
                    await i.deferUpdate();
                    
                    const clanData = await fetchFwaRoster(clanTag);
                    if (clanData && Array.isArray(clanData)) {
                        const playerObj = clanData.find(p => p.tag && p.tag.toUpperCase().trim() === activeSelectedTag.toUpperCase().trim());
                        if (playerObj) {
                            const newWeight = parseInt(playerObj.weight, 10);
                            const oldWeight = wwData[clanTag].players[activeSelectedTag];
                            if (newWeight !== oldWeight) {
                                wwData[clanTag].players[activeSelectedTag] = newWeight;
                                wwData[clanTag].lastUpdated = todayStr;

                                // Log update to WW log channel
                                try {
                                    const logChannel = await i.client.channels.fetch("1516719047348326493").catch(() => null);
                                    if (logChannel) {
                                        await logChannel.send(`${emojiUtils.getEmoji("alaram")} **FWA Weight Update Detected!**\nClan: **${clanName}** (${clanTag})\nNew weight update submitted on: **${todayStr}**`).catch(() => {});
                                    }
                                } catch (err) {
                                    console.error("Failed to send log message on manual update:", err);
                                }
                            }
                            
                            fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), 'utf8');
                            
                            await i.editReply({
                                content: `${emojiUtils.getEmoji("gtick")} Successfully updated weight for **${activeSelectedTag}** to **${newWeight.toLocaleString()}**.`,
                                embeds: [getEmbed(wwData, clanTag, clanName)],
                                components: getComponents(wwData, clanTag, activeSelectedTag)
                            });
                        } else {
                            await i.followUp({ content: `${emojiUtils.getEmoji("wrongbox")} Player \`${activeSelectedTag}\` is not in the live roster for **${clanName}**.`, ephemeral: true });
                        }
                    } else {
                        await i.followUp({ content: `${emojiUtils.getEmoji("wrongbox")} Failed to fetch current weights from FWAStats.`, ephemeral: true });
                    }
                } else if (i.customId === 'wwplayer_remove') {
                    if (!activeSelectedTag) return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} No player selected!`, ephemeral: true });
                    
                    await i.deferUpdate();
                    
                    delete wwData[clanTag].players[activeSelectedTag];
                    const removed = activeSelectedTag;
                    activeSelectedTag = null;
                    
                    fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), 'utf8');
                    
                    await i.editReply({
                        content: `${emojiUtils.getEmoji("gtick")} Successfully removed **${removed}** from tracking list.`,
                        embeds: [getEmbed(wwData, clanTag, clanName)],
                        components: getComponents(wwData, clanTag, null)
                    });
                }
            } catch (err) {
                console.error("Collector error in ww-player command:", err);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch {}
        });
    }
};
