const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const emojiUtils = require('../../../utils/emoji.js');

const clanRolesPath = path.join(__dirname, '../../../data/clanrole.json');
const wwPath = path.join(__dirname, '../../../data/ww.json');

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
        .setName('ww-tracklist')
        .setDescription('📋 Manage FWA tracked players per clan interactively')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, context) {
        const { coc } = context;
        await interaction.deferReply({ ephemeral: true });

        // Load wwData
        let wwData = {};
        if (fs.existsSync(wwPath)) {
            try {
                wwData = JSON.parse(fs.readFileSync(wwPath, 'utf8'));
            } catch {}
        }

        if (Object.keys(wwData).length === 0) {
            return interaction.editReply({ content: `${emojiUtils.getEmoji("wrongbox")} No clans are currently configured in \`ww.json\`. Use \`/ww-player\` to add player tags first.` });
        }

        const getClansSelectComponent = () => {
            const menu = new StringSelectMenuBuilder()
                .setCustomId('wwtrack_clan_select')
                .setPlaceholder('Select a tracked clan...')
                .addOptions(
                    Object.entries(wwData).map(([tag, clan]) => ({
                        label: clan.clanName || tag,
                        description: tag,
                        value: tag
                    }))
                );
            return [new ActionRowBuilder().addComponents(menu)];
        };

        const getClansEmbed = () => {
            return new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("clancastle")} Tracked Clans List`)
                .setColor(0x00FF00)
                .setDescription(`Select a clan from the dropdown menu below to view and manage its tracked players.\n\n**Total Configured Clans**: ${Object.keys(wwData).length}`)
                .setTimestamp();
        };

        const reply = await interaction.editReply({
            embeds: [getClansEmbed()],
            components: getClansSelectComponent()
        });

        const collector = reply.createMessageComponentCollector({
            time: 15 * 60 * 1000 // 15 minutes
        });

        let currentClanTag = null;
        let playerNames = {};

        collector.on('collect', async (i) => {
            try {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} You cannot use these components.`, ephemeral: true });
                }

                // Reload wwData dynamically to keep in sync with updates
                if (fs.existsSync(wwPath)) {
                    try {
                        wwData = JSON.parse(fs.readFileSync(wwPath, 'utf8'));
                    } catch {}
                }

                if (i.customId === 'wwtrack_clan_select') {
                    currentClanTag = i.values[0];
                    const record = wwData[currentClanTag];
                    const clanName = record?.clanName || currentClanTag;

                    await i.update({
                        content: `${emojiUtils.getEmoji("loading")} Fetching tracked player names for **${clanName}**...`,
                        embeds: [],
                        components: []
                    });

                    // Fetch player names from CoC API
                    playerNames = {};
                    const fetchPromises = Object.keys(record.players || {}).map(async (pTag) => {
                        try {
                            const p = await coc.getPlayer(pTag).catch(() => null);
                            playerNames[pTag] = p ? p.name : "Unknown Player";
                        } catch {
                            playerNames[pTag] = "Unknown Player";
                        }
                    });
                    await Promise.all(fetchPromises);

                    await i.editReply(renderClanDetails(currentClanTag));
                }

                else if (i.customId === 'wwtrack_back_btn') {
                    currentClanTag = null;
                    await i.update({
                        content: `${emojiUtils.getEmoji("clancastle")} Tracked players management list.`,
                        embeds: [getClansEmbed()],
                        components: getClansSelectComponent()
                    });
                }

                else if (i.customId.startsWith('wwtrack_edit_btn:')) {
                    const clanTag = i.customId.split(':')[1];
                    const record = wwData[clanTag];
                    
                    if (!record || !record.players || Object.keys(record.players).length === 0) {
                        return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} No players configured to edit.`, ephemeral: true });
                    }

                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`wwtrack_edit_select:${clanTag}`)
                        .setPlaceholder('Select a player to edit...')
                        .addOptions(
                            Object.keys(record.players).map(pTag => ({
                                label: `${playerNames[pTag] || 'Unknown'} (${pTag})`,
                                value: pTag
                            }))
                        );

                    const cancelBtn = new ButtonBuilder()
                        .setCustomId(`wwtrack_back_to_details:${clanTag}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojiUtils.getEmojiObject('wrongbox'));

                    const row1 = new ActionRowBuilder().addComponents(menu);
                    const row2 = new ActionRowBuilder().addComponents(cancelBtn);

                    await i.update({
                        content: `${emojiUtils.getEmoji("arrow")} **Select a player tag to edit**:`,
                        components: [row1, row2]
                    });
                }

                else if (i.customId.startsWith('wwtrack_edit_select:')) {
                    const clanTag = i.customId.split(':')[1];
                    const selectedTag = i.values[0];

                    const modal = new ModalBuilder()
                        .setCustomId(`wwtrack_edit_modal:${clanTag}:${selectedTag}`)
                        .setTitle(`Edit Tracked Player`);

                    const textInput = new TextInputBuilder()
                        .setCustomId('new_player_tag')
                        .setLabel(`New Player Tag`)
                        .setPlaceholder(selectedTag)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(selectedTag);

                    modal.addComponents(new ActionRowBuilder().addComponents(textInput));

                    await i.showModal(modal);
                }

                else if (i.customId.startsWith('wwtrack_remove_btn:')) {
                    const clanTag = i.customId.split(':')[1];
                    const record = wwData[clanTag];

                    if (!record || !record.players || Object.keys(record.players).length === 0) {
                        return i.reply({ content: `${emojiUtils.getEmoji("wrongbox")} No players configured to remove.`, ephemeral: true });
                    }

                    const menu = new StringSelectMenuBuilder()
                        .setCustomId(`wwtrack_remove_select:${clanTag}`)
                        .setPlaceholder('Select a player to remove...')
                        .addOptions(
                            Object.keys(record.players).map(pTag => ({
                                label: `${playerNames[pTag] || 'Unknown'} (${pTag})`,
                                value: pTag
                            }))
                        );

                    const cancelBtn = new ButtonBuilder()
                        .setCustomId(`wwtrack_back_to_details:${clanTag}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojiUtils.getEmojiObject('wrongbox'));

                    const row1 = new ActionRowBuilder().addComponents(menu);
                    const row2 = new ActionRowBuilder().addComponents(cancelBtn);

                    await i.update({
                        content: `${emojiUtils.getEmoji("delete")} **Select a player tag to remove**:`,
                        components: [row1, row2]
                    });
                }

                else if (i.customId.startsWith('wwtrack_remove_select:')) {
                    const clanTag = i.customId.split(':')[1];
                    const selectedTag = i.values[0];
                    const pName = playerNames[selectedTag] || 'Unknown';

                    const yesBtn = new ButtonBuilder()
                        .setCustomId(`wwtrack_remove_confirm_yes:${clanTag}:${selectedTag}`)
                        .setLabel('Yes, Delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojiUtils.getEmojiObject('gtick'));

                    const noBtn = new ButtonBuilder()
                        .setCustomId(`wwtrack_remove_confirm_no:${clanTag}:${selectedTag}`)
                        .setLabel('No, Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojiUtils.getEmojiObject('wrongbox'));

                    const embed = new EmbedBuilder()
                        .setTitle(`${emojiUtils.getEmoji("question")} Confirm Deletion`)
                        .setColor(0xFF0000)
                        .setDescription(`Are you sure you want to remove tracked player **${pName}** (${selectedTag}) from **${wwData[clanTag]?.clanName || clanTag}**?`);

                    await i.update({
                        content: ``,
                        embeds: [embed],
                        components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)]
                    });
                }

                else if (i.customId.startsWith('wwtrack_remove_confirm_yes:')) {
                    const parts = i.customId.split(':');
                    const clanTag = parts[1];
                    const playerTag = parts[2];
                    const pName = playerNames[playerTag] || playerTag;

                    if (wwData[clanTag] && wwData[clanTag].players) {
                        delete wwData[clanTag].players[playerTag];
                        delete playerNames[playerTag];
                        
                        try {
                            fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), 'utf8');
                        } catch {}
                    }

                    await i.update({
                        content: `${emojiUtils.getEmoji("gtick")} Successfully removed **${pName}** (${playerTag}) from tracking.`,
                        ...renderClanDetails(clanTag)
                    });
                }

                else if (i.customId.startsWith('wwtrack_remove_confirm_no:') || i.customId.startsWith('wwtrack_back_to_details:')) {
                    const clanTag = i.customId.split(':')[1];
                    await i.update({
                        content: `${emojiUtils.getEmoji("wrongbox")} Action cancelled.`,
                        ...renderClanDetails(clanTag)
                    });
                }
            } catch (err) {
                console.error("ww-tracklist collector error:", err);
            }
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch {}
        });

        function renderClanDetails(clanTag) {
            const record = wwData[clanTag];
            const clanName = record?.clanName || clanTag;

            const embed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("clancastle")} Tracked Players: ${clanName}`)
                .setColor(0x0055FF)
                .setFooter({ text: `Last Submitted Date: ${formatDaysAgo(record?.lastUpdated) || 'Never'}` });

            let desc = "";
            if (!record || !record.players || Object.keys(record.players).length === 0) {
                desc = `No players are currently tracked for this clan.`;
            } else {
                desc = Object.entries(record.players).map(([pTag, weight]) => {
                    const name = playerNames[pTag] || "Unknown Player";
                    return `${emojiUtils.getEmoji("mem")} **${name}** (${pTag}) — Weight: **${weight.toLocaleString()}**`;
                }).join('\n');
            }

            embed.setDescription(desc);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wwtrack_edit_btn:${clanTag}`)
                    .setLabel('Edit / Update')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emojiUtils.getEmojiObject('refresh')),
                new ButtonBuilder()
                    .setCustomId(`wwtrack_remove_btn:${clanTag}`)
                    .setLabel('Remove Tag')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojiUtils.getEmojiObject('delete')),
                new ButtonBuilder()
                    .setCustomId(`wwtrack_back_btn`)
                    .setLabel('Back to Clans')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojiUtils.getEmojiObject('larrow'))
            );

            return {
                content: `${emojiUtils.getEmoji("clancastle")} Tracked players management list for **${clanName}**.`,
                embeds: [embed],
                components: [row]
            };
        }
    },

    async handleModalSubmit(interaction, context, clanTag, oldPlayerTag) {
        const newPlayerTag = interaction.fields.getTextInputValue('new_player_tag').toUpperCase().trim().replace(/O/g, '0');
        const formattedNewTag = newPlayerTag.startsWith('#') ? newPlayerTag : '#' + newPlayerTag;
        
        await interaction.deferUpdate();

        // 1. Fetch Members.json from FWAStats for clanTag to get the new player's current weight
        const statsWorkerBase = process.env.FWASTATS_WORKER_URL;
        const url = `https://fwastats.com/Clan/${clanTag.replace("#", "")}/Members.json`;
        const fwaHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Cookie": process.env.FWA_COOKIE || ""
        };

        let clanData = null;
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
                clanData = await res.json();
            }
        } catch {}

        if (!clanData || !Array.isArray(clanData)) {
            return interaction.followUp({ content: `${emojiUtils.getEmoji("wrongbox")} Failed to fetch members list from FWAStats for clan \`${clanTag}\`.`, ephemeral: true });
        }

        const playerObj = clanData.find(p => p.tag && p.tag.toUpperCase().trim() === formattedNewTag);
        if (!playerObj) {
            return interaction.followUp({ content: `${emojiUtils.getEmoji("wrongbox")} Could not find player with tag \`${formattedNewTag}\` in the FWAStats members list for this clan.`, ephemeral: true });
        }

        const currentWeight = parseInt(playerObj.weight, 10);

        // 2. Read and update ww.json
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

        if (wwData[clanTag] && wwData[clanTag].players) {
            const oldWeight = wwData[clanTag].players[oldPlayerTag];
            delete wwData[clanTag].players[oldPlayerTag];
            wwData[clanTag].players[formattedNewTag] = currentWeight;

            if (oldWeight !== currentWeight || oldPlayerTag !== formattedNewTag) {
                wwData[clanTag].lastUpdated = todayStr;

                // Log update to WW log channel
                try {
                    const logChannel = await interaction.client.channels.fetch("1516719047348326493").catch(() => null);
                    if (logChannel) {
                        await logChannel.send(`${emojiUtils.getEmoji("alaram")} **FWA Weight Update Detected!**\nClan: **${wwData[clanTag].clanName || clanTag}** (${clanTag})\nNew weight update submitted on: **${todayStr}**`).catch(() => {});
                    }
                } catch (err) {
                    console.error("Failed to send log message on modal edit:", err);
                }
            }

            try {
                fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), 'utf8');
            } catch {}
        }

        // 3. Re-fetch and re-render the view
        const { coc } = context;
        const clanName = wwData[clanTag]?.clanName || clanTag;

        const playerNames = {};
        const fetchPromises = Object.keys(wwData[clanTag].players || {}).map(async (pTag) => {
            try {
                const player = await coc.getPlayer(pTag).catch(() => null);
                playerNames[pTag] = player ? player.name : "Unknown Player";
            } catch {
                playerNames[pTag] = "Unknown Player";
            }
        });
        await Promise.all(fetchPromises);

        const getClanDetailsEmbed = (cTag) => {
            const record = wwData[cTag];
            const embed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("clancastle")} Tracked Players: ${clanName}`)
                .setColor(0x0055FF)
                .setFooter({ text: `Last Submitted Date: ${formatDaysAgo(record?.lastUpdated) || 'Never'}` });

            const desc = Object.entries(record.players || {}).map(([pTag, weight]) => {
                const name = playerNames[pTag] || "Unknown Player";
                return `${emojiUtils.getEmoji("mem")} **${name}** (${pTag}) — Weight: **${weight.toLocaleString()}**`;
            }).join('\n') || "No players tracked.";

            embed.setDescription(desc);
            return embed;
        };

        const getComponents = (cTag) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wwtrack_edit_btn:${cTag}`)
                    .setLabel('Edit / Update')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emojiUtils.getEmojiObject('refresh')),
                new ButtonBuilder()
                    .setCustomId(`wwtrack_remove_btn:${cTag}`)
                    .setLabel('Remove Tag')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojiUtils.getEmojiObject('delete')),
                new ButtonBuilder()
                    .setCustomId(`wwtrack_back_btn`)
                    .setLabel('Back to Clans')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(emojiUtils.getEmojiObject('larrow'))
            );
            return [row];
        };

        await interaction.editReply({
            content: `${emojiUtils.getEmoji("gtick")} Successfully edited player tag from **${oldPlayerTag}** to **${formattedNewTag}**.`,
            embeds: [getClanDetailsEmbed(clanTag)],
            components: getComponents(clanTag)
        });
    }
};
