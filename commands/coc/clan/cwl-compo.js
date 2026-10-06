const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

const cwlClansPath = path.join(__dirname, "../../../data/cwlclans.json");
const cwlFuturePath = path.join(__dirname, "../../../data/cwlfuture.json");

function loadCwlClans() {
    // Try cwlclans.json first, fall back to cwlfuture.json
    try {
        if (fs.existsSync(cwlClansPath)) {
            const data = JSON.parse(fs.readFileSync(cwlClansPath, 'utf8'));
            if (Object.keys(data).length > 0) return data;
        }
    } catch (e) { /* ignore */ }
    try {
        if (fs.existsSync(cwlFuturePath)) {
            return JSON.parse(fs.readFileSync(cwlFuturePath, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return {};
}

module.exports = {
    name: "cwl-compo",
    description: "Show townhall composition for CWL clans",
    data: new SlashCommandBuilder()
        .setName('cwl-compo')
        .setDescription('Show townhall composition for CWL clans')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Select a CWL clan or "All Clans" for active CWL clans composition')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction, context) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const allClans = loadCwlClans();

        const activeEntries = Object.entries(allClans).filter(([, v]) => v.active === true);

        const choices = [];
        if (activeEntries.length > 0) {
            choices.push({ name: "All Clans", value: "all" });
            for (const [tag, info] of activeEntries) {
                const displayName = `${info.name || 'CWL Clan'} (${tag})`;
                choices.push({ name: displayName, value: tag });
            }
        }

        const filtered = choices.filter(choice =>
            choice.name.toLowerCase().includes(focusedValue) ||
            choice.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(filtered);
    },

    async execute(interaction, context) {
        const { coc, EmbedBuilder, emoji, ActionRowBuilder, ButtonBuilder, ButtonStyle } = context;
        const { getEmoji, getEmojiObject } = emoji;
        const selectedClan = interaction.options.getString('clan');
        const loadingEmoji = getEmoji("alaram") || "⏳";

        const loadingEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setDescription(`${loadingEmoji} Fetching Information...`);

        const sentMessage = await interaction.reply({ embeds: [loadingEmbed], fetchReply: true }).catch(() => null);
        if (!sentMessage) return;

        const allClans = loadCwlClans();

        if (Object.keys(allClans).length === 0) {
            return interaction.editReply({ embeds: [], content: "⚠️ No CWL clans found. Use `/cwl-clan` to add clans." });
        }

        const thEmojis = {
            18: getEmoji("th18"), 17: getEmoji("th17"), 16: getEmoji("th16"),
            15: getEmoji("th15"), 14: getEmoji("th14"), 13: getEmoji("th13"),
            12: getEmoji("th12"), 11: getEmoji("th11"), 10: getEmoji("th10"),
        };

        try {
            if (selectedClan.toLowerCase() === "all") {
                // ── All Clans: ONLY active clans are fetched and shown ──
                const activeClans = Object.entries(allClans).filter(([, v]) => v.active === true);

                if (activeClans.length === 0) {
                    const noActiveEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("⚠️ No Active CWL Clans")
                        .setDescription("No clans are currently marked as **Active** for CWL compo.\nUse `/cwl-clan` (Edit / Remove ➔ **🟢 Active**) to select active clans.");
                    return interaction.editReply({ embeds: [noActiveEmbed], components: [] });
                }

                const results = await Promise.all(
                    activeClans.map(async ([tag, info]) => {
                        try {
                            return { clan: await coc.getClan(tag), tag, info };
                        } catch {
                            return { clan: null, tag, info };
                        }
                    })
                );

                const now = new Date();
                const timeOpts = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
                const timestamp = now.toLocaleString('en-GB', timeOpts).replace(',', '');

                const embeds = [];
                for (const { clan, tag, info } of results) {
                    if (!clan) continue;

                    const thCounts = {};
                    let totalTH = 0;
                    let totalMembers = 0;

                    for (const member of clan.memberList) {
                        const th = member.townHallLevel;
                        thCounts[th] = (thCounts[th] || 0) + 1;
                        totalTH += th;
                        totalMembers++;
                    }

                    const sortedTH = Object.entries(thCounts).sort((a, b) => b[0] - a[0]);
                    let desc = "";
                    for (const [th, count] of sortedTH) {
                        const emojiStr = thEmojis[th] || "🏰";
                        desc += `**TH${th}** ${emojiStr} **${count}**\n`;
                    }

                    const avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";
                    const styleLabel = info.style ? ` (${info.style.charAt(0).toUpperCase() + info.style.slice(1)} CWL)` : "";

                    const embed = new EmbedBuilder()
                        .setTitle(`${clan.name} Townhalls${styleLabel}`)
                        .setDescription(desc || "No data")
                        .setColor(0xFF0000)
                        .setThumbnail(clan.badgeUrls.medium)
                        .setFooter({
                            text: `Accounts: ${totalMembers} | Avg TH: ${avgTH} | Updated: ${timestamp}`,
                        });

                    embeds.push(embed);
                }

                if (embeds.length === 0) {
                    return interaction.editReply({ embeds: [], content: "⚠️ No active CWL clans could be fetched." });
                }

                // Discord allows max 10 embeds per message
                const firstBatch = embeds.slice(0, 10);
                await interaction.editReply({ embeds: firstBatch, components: [] });

                for (let i = 10; i < embeds.length; i += 10) {
                    const batch = embeds.slice(i, i + 10);
                    await interaction.followUp({ embeds: batch });
                }
                return;

            } else {
                // ── Single Clan: same vertical format as /compo ──
                let clanTag = selectedClan.trim();
                if (!clanTag.startsWith('#')) {
                    clanTag = '#' + clanTag.toUpperCase();
                } else {
                    clanTag = clanTag.toUpperCase();
                }

                // Check if it's an active CWL clan
                const activeClans = Object.entries(allClans).filter(([, v]) => v.active === true);
                const activeMap = Object.fromEntries(activeClans);

                if (!activeMap[clanTag]) {
                    const argUpper = selectedClan.toUpperCase();
                    for (const [tag, info] of Object.entries(activeMap)) {
                        if (info.name && info.name.toUpperCase().includes(argUpper)) {
                            clanTag = tag;
                            break;
                        }
                    }
                }

                if (!activeMap[clanTag]) {
                    const errEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("⚠️ Clan Not Active")
                        .setDescription(`Clan \`${selectedClan}\` is not in the active CWL clans list.\nUse \`/cwl-clan\` (Edit / Remove ➔ **🟢 Active**) to activate it.`);
                    return interaction.editReply({ embeds: [errEmbed], components: [] });
                }

                const clan = await coc.getClan(clanTag);

                const thCounts = {};
                let totalTH = 0;
                let totalMembers = 0;

                for (const member of clan.memberList) {
                    const th = member.townHallLevel;
                    thCounts[th] = (thCounts[th] || 0) + 1;
                    totalTH += th;
                    totalMembers++;
                }

                const sortedTH = Object.entries(thCounts).sort((a, b) => b[0] - a[0]);

                let desc = "";
                for (const [th, count] of sortedTH) {
                    const emojiStr = thEmojis[th] || "🏰";
                    desc += `**TH${th}** ${emojiStr} **${count}**\n`;
                }

                const avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";

                const now = new Date();
                const options = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
                const timestamp = now.toLocaleString('en-GB', options).replace(',', '');

                const cwlInfo = allClans[clanTag] || {};
                const styleLabel = cwlInfo.style ? ` (${cwlInfo.style.charAt(0).toUpperCase() + cwlInfo.style.slice(1)} CWL)` : "";

                const embed = new EmbedBuilder()
                    .setTitle(`${clan.name} Townhalls${styleLabel}`)
                    .setDescription(desc || "No data")
                    .setColor(0xFF0000)
                    .setThumbnail(clan.badgeUrls.medium)
                    .setFooter({
                        text: `Accounts: ${totalMembers} | Avg TH: ${avgTH} | Updated: ${timestamp}`,
                    });

                const refreshBtn = new ButtonBuilder()
                    .setCustomId("cwlcompo_refresh_" + clanTag.replace("#", ""))
                    .setLabel("Refresh Data")
                    .setStyle(ButtonStyle.Secondary);

                const refreshEmoji = getEmojiObject("refresh");
                if (refreshEmoji) refreshBtn.setEmoji(refreshEmoji);
                else refreshBtn.setEmoji("🔄");

                const row = new ActionRowBuilder().addComponents(refreshBtn);
                return interaction.editReply({ embeds: [embed], components: [row] });
            }
        } catch (error) {
            console.error("cwl-compo error:", error);
            try {
                const errMsg = error.response?.status === 404
                    ? `❌ Clan not found with tag: \`${selectedClan}\``
                    : "⚠️ There was an error processing the command.";
                const errEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setDescription(errMsg);
                await interaction.editReply({ embeds: [errEmbed], components: [] });
            } catch (e) {
                console.error("cwl-compo error reply failed:", e);
            }
        }
    }
};
