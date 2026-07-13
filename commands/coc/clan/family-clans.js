const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLeagueEmoji, getCwlLeagueEmoji } = require('../../../utils/emoji.js');
const fs = require('fs');
const path = require('path');

function getCwlClans() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, "../../../data/cwlclans.json"), "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

// CWL league order — highest to lowest
const LEAGUE_ORDER = [
    "Champion League I", "Champion League II", "Champion League III",
    "Master League I", "Master League II", "Master League III",
    "Crystal League I", "Crystal League II", "Crystal League III",
    "Gold League I", "Gold League II", "Gold League III",
    "Silver League I", "Silver League II", "Silver League III",
    "Bronze League I", "Bronze League II", "Bronze League III",
    "Unranked"
];

function getLeagueRank(leagueName) {
    const idx = LEAGUE_ORDER.indexOf(leagueName);
    return idx === -1 ? LEAGUE_ORDER.length : idx;
}

/**
 * Build the CWL clans embed, select menu, and refresh button.
 * Shared between the slash command and the handler refresh button.
 */
async function buildCwlResponse(coc, clanRoles, getEmoji, getEmojiObject) {
    const cwlData = getCwlClans();
    const allTags = Object.keys(cwlData);

    if (allTags.length === 0) return null;

    // Fetch all clans in parallel
    const clanResults = await Promise.all(
        allTags.map(async (tag) => {
            try {
                const clan = await coc.getClan(tag);
                const info = clanRoles[tag] || {};
                const cwlInfo = cwlData[tag] || {};
                return { clan, info, cwlInfo, tag };
            } catch {
                return null;
            }
        })
    );

    const validClans = clanResults.filter(Boolean);
    if (validClans.length === 0) return null;

    // Split clans by family friendly status
    const familyFriendlyClans = validClans.filter(entry => entry.clan.isFamilyFriendly);
    const nonFamilyFriendlyClans = validClans.filter(entry => !entry.clan.isFamilyFriendly);

    let embeds = [];
    let currentText = "";
    let options = [];
    let totalPlayers = 0;
    let totalClans = 0;

    const processClanList = (clans, categoryTitle) => {
        if (clans.length === 0) return;

        // Add a header for the category if the current text is not empty or if it's the beginning
        let categoryHeader = `\n\n**━━━ ${categoryTitle} ━━━**\n`;
        
        // Group clans by warLeague name
        const leagueGroups = {};
        for (const entry of clans) {
            const leagueName = entry.clan.warLeague ? entry.clan.warLeague.name : "Unranked";
            if (!leagueGroups[leagueName]) leagueGroups[leagueName] = [];
            leagueGroups[leagueName].push(entry);
        }

        const sortedLeagues = Object.keys(leagueGroups).sort((a, b) => getLeagueRank(a) - getLeagueRank(b));

        for (const leagueName of sortedLeagues) {
            const leagueClans = leagueGroups[leagueName];
            leagueClans.sort((a, b) => a.clan.name.localeCompare(b.clan.name));

            const leagueEmoji = getCwlLeagueEmoji(leagueName);
            let leagueText = `\n${leagueEmoji} **${leagueName}**\n`;

            if (categoryHeader) {
                leagueText = categoryHeader + leagueText;
                categoryHeader = ""; // Only prepend the header to the first league
            }

            for (const entry of leagueClans) {
                const { clan, info } = entry;
                const clanNick = info.nickName ? info.nickName.toLowerCase() : "";
                const badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cwl");

                const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clan.tag.replace("#", "")}`;
                const clanLine = `[**${clan.name}** (${clan.members}/50)](${clanLink})\n`;

                if (currentText.length + leagueText.length + clanLine.length > 4000) {
                    embeds.push(new EmbedBuilder()
                        .setTitle(embeds.length === 0 ? `${getEmoji("cwl")} CWL Clans` : `${getEmoji("cwl")} CWL Clans (Cont.)`)
                        .setDescription(currentText.trim())
                        .setColor(0x2ECC71));
                    currentText = `\n**${leagueName} (Cont.)**\n`;
                    leagueText = "";
                }

                currentText += leagueText + clanLine;
                leagueText = "";
                totalPlayers += clan.members;
                totalClans++;
            }
        }
    };

    processClanList(familyFriendlyClans, "Family Friendly Clans");
    processClanList(nonFamilyFriendlyClans, "Non-Family Friendly Clans");

    currentText += `\n\n**${totalPlayers} Players | ${totalClans} Clans**`;
    embeds.push(new EmbedBuilder()
        .setTitle(embeds.length === 0 ? `${getEmoji("cwl")} CWL Clans` : `${getEmoji("cwl")} CWL Clans (Cont.)`)
        .setDescription(currentText.trim())
        .setColor(0x2ECC71)
        .setTimestamp());

    const refreshBtn = new ButtonBuilder()
        .setCustomId("familyclans_refresh_cwl")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary);
    const refreshEmoji = getEmojiObject("refresh");
    if (refreshEmoji) refreshBtn.setEmoji(refreshEmoji);
    else refreshBtn.setEmoji("🔄");

    const btnRow = new ActionRowBuilder().addComponents(refreshBtn);

    return { embeds: embeds, components: [btnRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('family-clans')
        .setDescription('Shows the list of FWA, War, or CWL clans.')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Select the clan category to display')
                .setRequired(true)
                .addChoices(
                    { name: 'FWA Clans', value: 'fwa' },
                    { name: 'WAR Clans', value: 'war' },
                    { name: 'CWL Clans', value: 'cwl' }
                )
        ),

    // Export for handler.js reuse
    buildCwlResponse,

    async execute(interaction, context) {
        try {
            const { data: dataManager, coc, emoji } = context;
            const { getEmoji, getEmojiObject } = emoji;

            const category = interaction.options.getString('category');
            await interaction.deferReply();

            const clanRoles = dataManager.getClanRoles();

            if (category === 'fwa') {
                let fwaTags = [];
                for (let cTag in clanRoles) {
                    if (clanRoles[cTag].clanType !== "war") fwaTags.push(cTag);
                }

                let embeds = [];
                let currentText = getEmoji("bluefwa") + " **FWA Clans** are for easy farming and max loot!\n\n**FWA Clans - " + fwaTags.length + "**\n";
                let options = [];
                for (let idx = 0; idx < fwaTags.length; idx++) {
                    try {
                        let tag = fwaTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("whitefwa");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("whitefwa");

                        let clan = await coc.getClan(tag);
                        const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clan.tag.replace("#", "")}`;
                        let clanLine = (idx + 1) + ". " + badgeEmojiStr + " [**" + clan.name + "** (" + clan.members + "/50)](" + clanLink + ")\n";

                        if (currentText.length + clanLine.length > 4000) {
                            embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "FWA Clans" : "FWA Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                            currentText = "";
                        }

                        currentText += clanLine;
                        if (options.length < 25) {
                            options.push({ label: clan.name, description: "FWA | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                        }
                    } catch (err) {
                        let clanLine = (idx + 1) + ". ❌ " + fwaTags[idx] + " - Error\n";
                        if (currentText.length + clanLine.length > 4000) {
                            embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "FWA Clans" : "FWA Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                            currentText = "";
                        }
                        currentText += clanLine;
                    }
                }

                if (currentText) {
                    embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "FWA Clans" : "FWA Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                }

                if (embeds.length === 0) return interaction.editReply("No FWA clans found.");

                if (options.length === 0) {
                    return interaction.editReply({ embeds: embeds });
                }

                let selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("clans10_sel_fwa").setPlaceholder("Select an FWA Clan").addOptions(options)
                );
                
                try {
                    await interaction.editReply({ embeds: embeds, components: [selectRow] });
                } catch (err) {
                    if (err.code === 50035) {
                        options.forEach(opt => delete opt.emoji);
                        let retryRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId("clans10_sel_fwa").setPlaceholder("Select an FWA Clan").addOptions(options)
                        );
                        await interaction.editReply({ embeds: embeds, components: [retryRow] }).catch(e => console.error("Retry failed:", e));
                    } else {
                        throw err;
                    }
                }
            }

            else if (category === 'war') {
                let warTags = [];
                for (let cTag in clanRoles) {
                    if (clanRoles[cTag].clanType === "war") warTags.push(cTag);
                }

                let embeds = [];
                let currentText = getEmoji("cocfight") + " **War Clans** are competitive and focus on winning streaks!\n\n**War Clans - " + warTags.length + "**\n";
                let options = [];
                for (let idx = 0; idx < warTags.length; idx++) {
                    try {
                        let tag = warTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("cocfight");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cocfight");

                        let clan = await coc.getClan(tag);
                        const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clan.tag.replace("#", "")}`;
                        let clanLine = (idx + 1) + ". " + badgeEmojiStr + " [**" + clan.name + "** (" + clan.members + "/50)](" + clanLink + ")\n";

                        if (currentText.length + clanLine.length > 4000) {
                            embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "War Clans" : "War Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                            currentText = "";
                        }

                        currentText += clanLine;
                        if (options.length < 25) {
                            options.push({ label: clan.name, description: "War | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                        }
                    } catch (err) {
                        let clanLine = (idx + 1) + ". ❌ " + warTags[idx] + " - Error\n";
                        if (currentText.length + clanLine.length > 4000) {
                            embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "War Clans" : "War Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                            currentText = "";
                        }
                        currentText += clanLine;
                    }
                }

                if (currentText) {
                    embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "War Clans" : "War Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                }

                if (embeds.length === 0) return interaction.editReply("No War clans found.");

                if (options.length === 0) {
                    return interaction.editReply({ embeds: embeds });
                }

                let selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("clans10_sel_war").setPlaceholder("Select a War Clan").addOptions(options)
                );
                
                try {
                    await interaction.editReply({ embeds: embeds, components: [selectRow] });
                } catch (err) {
                    if (err.code === 50035) {
                        options.forEach(opt => delete opt.emoji);
                        let retryRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder().setCustomId("clans10_sel_war").setPlaceholder("Select a War Clan").addOptions(options)
                        );
                        await interaction.editReply({ embeds: embeds, components: [retryRow] }).catch(e => console.error("Retry failed:", e));
                    } else {
                        throw err;
                    }
                }
            }

            else if (category === 'cwl') {
                const result = await buildCwlResponse(coc, clanRoles, getEmoji, getEmojiObject);
                if (!result) return interaction.editReply("No CWL clans found.");
                await interaction.editReply({ embeds: result.embeds, components: result.components });
            }
        } catch (error) {
            console.error("Error in /family-clans command:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ An error occurred while fetching clan details.").catch(() => { });
            } else {
                await interaction.reply({ content: "❌ An error occurred while fetching clan details.", ephemeral: true }).catch(() => { });
            }
        }
    }
};
