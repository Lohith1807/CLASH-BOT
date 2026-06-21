const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const dataManager = require("../../../utils/dataManager.js");

async function fwaFetch(originalUrl) {
    const workerBase = process.env.FWA_WORKER_URL;
    if (!workerBase) throw new Error("FWA_WORKER_URL is not set in .env");

    const tagMatch = originalUrl.match(/[?&]tag=([^&]+)/);
    const workerUrl = tagMatch
        ? `${workerBase}?tag=${tagMatch[1]}`
        : `${workerBase}?url=${encodeURIComponent(originalUrl)}`;

    const res = await axios.get(workerUrl, { timeout: 15000 });
    const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    const isCfBlocked = data.includes("Just a moment") || data.includes("_cf_chl_opt");
    if (isCfBlocked || data.length < 100) throw new Error("Worker returned a blocked/invalid response");
    return data;
}

function stripHtml(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

async function determineMatchType(clanTag, opponentTagFromApi) {
    try {
        const url = `https://points.fwafarm.com/clan?tag=${clanTag.replace("#", "")}`;
        const rawHtml = await fwaFetch(url);
        const bodyText = stripHtml(rawHtml);

        const activeFwaMatch = bodyText.match(/Active FWA\s*:\s*(Yes|No)/i);
        const isActiveFWA = activeFwaMatch ? (activeFwaMatch[1].toLowerCase() === 'yes') : false;

        let matchType = "Mismatch";
        let isOpponentFWA = false;

        if (opponentTagFromApi && opponentTagFromApi !== "N/A") {
            try {
                const oppPointsUrl = `https://points.fwafarm.com/clan?tag=${opponentTagFromApi.replace("#", "")}`;
                const oppBodyText = stripHtml(await fwaFetch(oppPointsUrl));
                if (oppBodyText.match(/Active FWA\s*:\s*Yes/i) || oppBodyText.includes("FWA Points: Clan")) {
                    isOpponentFWA = true;
                }
            } catch (e) { }
        }

        if (isActiveFWA && isOpponentFWA) {
            matchType = "FWA Match";
        } else if (isActiveFWA && !isOpponentFWA) {
            matchType = "Mismatch";
        } else {
            matchType = "Blacklisted Match";
        }
        return matchType;
    } catch (e) {
        return "Unknown";
    }
}

function getDuration(endTime) {
    if (!endTime) return "N/A";
    const formattedDate = endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
    const diff = new Date(formattedDate) - Date.now();
    if (diff <= 0) return "Finished";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
}

function getComposition(members, emoji) {
    if (!members || members.length === 0) return "N/A";
    const counts = {};
    members.forEach(m => {
        const th = m.townhallLevel || m.thLevel;
        if (th) counts[th] = (counts[th] || 0) + 1;
    });
    const sortedTHs = Object.keys(counts).sort((a, b) => b - a);
    if (sortedTHs.length === 0) return "N/A";
    return sortedTHs.map(th => `${emoji.getEmoji('th' + th) || 'TH' + th} \`${counts[th]}\``).join(" ");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("war_search")
        .setDescription("Check the current war status of alliance clans")
        .addStringOption(option =>
            option.setName("clans")
                .setDescription("Select ALL CLANS or a specific clan")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const clanRoles = dataManager.getClanRoles();
        
        const choices = [{ name: "ALL CLANS", value: "ALL" }];
        
        for (const [tag, data] of Object.entries(clanRoles)) {
            if (data.nickName) {
                choices.push({ name: `${data.nickName} (${tag})`, value: tag });
            } else {
                choices.push({ name: tag, value: tag });
            }
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { coc, emoji } = context;
        const target = interaction.options.getString("clans");
        
        const loadingEmoji = emoji.getEmoji("alaram") || "⏳";
        const loadingMsg = target === "ALL" ? "Fetching data for all clans" : "Fetching detailed war data";
        let dotCount = 0;
        const loadingColor = Math.floor(Math.random() * 16777215);
        
        const loadingEmbed = new EmbedBuilder()
            .setColor(loadingColor)
            .setDescription(`${loadingEmoji} ${loadingMsg}`);
            
        await interaction.reply({ embeds: [loadingEmbed] });

        let animationInterval = setInterval(async () => {
            dotCount = (dotCount + 1) % 4;
            const dots = ".".repeat(dotCount);
            const updatedEmbed = new EmbedBuilder()
                .setColor(loadingColor)
                .setDescription(`${loadingEmoji} ${loadingMsg} ${dots}`);
            
            await interaction.editReply({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
        }, 1500);

        if (target === "ALL") {
            const clanRoles = dataManager.getClanRoles();
            const tags = Object.keys(clanRoles).filter(tag => clanRoles[tag].clanType === "fwa");
            
            const results = [];
            // Process in batches of 5
            for (let i = 0; i < tags.length; i += 5) {
                const batch = tags.slice(i, i + 5);
                const batchPromises = batch.map(async (tag) => {
                    try {
                        const clanData = await coc.getClan(tag).catch(() => ({ name: clanRoles[tag].nickName || tag, tag: tag }));
                        const war = await coc.getCurrentWar(tag).catch(() => null);
                        
                        if (!war || war.state === "notInWar") {
                            return { tag, war: null, clanData, matchType: "No war is ongoing" };
                        }
                        
                        let matchType = "Unknown";
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000);
                            matchType = await determineMatchType(tag, war.opponent.tag);
                            clearTimeout(timeoutId);
                        } catch (e) {
                            const savedTypes = dataManager.getWarType();
                            if (savedTypes[tag] && savedTypes[tag].wartype) {
                                matchType = savedTypes[tag].wartype;
                            }
                        }

                        return { tag, war, clanData, matchType };
                    } catch (e) {
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults.filter(r => r !== null));
            }
            
            if (results.length === 0) {
                const noWarEmbed = new EmbedBuilder()
                    .setTitle("No Alliance Clans")
                    .setDescription("Could not fetch data for any FWA clans.")
                    .setColor(0xFF0000);
                clearInterval(animationInterval);
                return await interaction.editReply({ embeds: [noWarEmbed] });
            }
            
            const parroww = emoji.getEmoji('parrow') || '🏹';
            const yarrow = emoji.getEmoji('yarrow') || '➡️';
            const rarroww = emoji.getEmoji('rarroww') || '➡️';
            const cocfight = emoji.getEmoji('cocfight') || '⚔️';
            
            let description = "";
            results.forEach(res => {
                const { tag, war, clanData, matchType } = res;
                const clanNick = clanRoles[tag]?.nickName?.toLowerCase() || "";
                const clanBadge = emoji.getEmoji(clanNick) || "";
                const ourLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tag.replace("#", "")}`;
                
                if (!war || war.state === "notInWar") {
                    description += `${parroww} ${clanBadge} **[${clanData.name}](${ourLink})** vs **NO WAR ONGOING**\n`;
                    description += `${yarrow} **Match type :** ${matchType}\n\n`;
                    return;
                }
                
                const state = war.state;
                const timeStr = state === "preparation" ? "Starts in:" : "End time:";
                const timeVal = getDuration(state === "preparation" ? war.startTime : war.endTime);
                
                const oppClanNick = clanRoles[war.opponent.tag]?.nickName?.toLowerCase() || "";
                const oppBadge = emoji.getEmoji(oppClanNick) || "";
                const oppLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${war.opponent.tag.replace("#", "")}`;
                
                const savedTypes = dataManager.getWarType();
                const savedData = savedTypes[tag];
                let mailText = "Leaders Selection";
                if (matchType === "FWA Match") {
                    const result = savedData?.result || "Unknown";
                    const dot = result === "win" ? (emoji.getEmoji('greendot') || '🟢') : (result === "lose" ? (emoji.getEmoji('reddot') || '🔴') : "");
                    mailText = result === "win" ? `Win ${dot}` : (result === "lose" ? `Lose ${dot}` : "Unknown");
                }
                
                description += `${parroww} ${clanBadge} **[${clanData.name}](${ourLink})** vs ${oppBadge} **[${war.opponent.name}](${oppLink})**\n`;
                
                description += `${yarrow} **Match type :** ${matchType}\n`;
                description += `${rarroww} **War :** ${mailText}\n`;
                description += `${cocfight} **${timeStr}** ${timeVal}\n\n`;
            });
            
            const allEmbed = new EmbedBuilder()
                .setTitle("Alliance Wars")
                .setDescription(description.trim())
                .setColor(0x00FF00)
                .setTimestamp();
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`warsearch_refresh_${target}`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emoji.getEmoji('refresh') || '🔄')
            );
                
            clearInterval(animationInterval);
            return await interaction.editReply({ embeds: [allEmbed], components: [row] });
            
        } else {
            // Specific Clan logic
            try {
                const war = await coc.getCurrentWar(target);
                const clanData = await coc.getClan(target);
                
                if (!war || war.state === "notInWar") {
                    const noWarEmbed = new EmbedBuilder()
                        .setTitle(`${clanData.name || target} War Status`)
                        .setDescription("This clan is not currently in a war.")
                        .setColor(0xFF0000);
                    clearInterval(animationInterval);
                    return await interaction.editReply({ embeds: [noWarEmbed] });
                }
                
                const opponentName = war.opponent.name;
                const opponentTag = war.opponent.tag;
                
                let opponentData = null;
                try { opponentData = await coc.getClan(opponentTag); } catch (e) { }
                
                const matchType = await determineMatchType(target, opponentTag);
                
                const savedTypes = dataManager.getWarType();
                const savedData = savedTypes[target];
                let mailText = "Leaders Selection";
                if (matchType === "FWA Match") {
                    const result = savedData?.result || "Unknown";
                    const dot = result === "win" ? (emoji.getEmoji('greendot') || '🟢') : (result === "lose" ? (emoji.getEmoji('reddot') || '🔴') : "");
                    mailText = result === "win" ? `Win ${dot}` : (result === "lose" ? `Lose ${dot}` : "Unknown");
                }
                
                const clanComp = (war && war.clan?.members) ? getComposition(war.clan.members, emoji) : getComposition(clanData.memberList, emoji);
                const oppComp = (war && war.opponent?.members) ? getComposition(war.opponent.members, emoji) : (opponentData ? getComposition(opponentData.memberList, emoji) : "N/A");
                
                const stateFormatted = war.state === "preparation" ? "In Prep" : (war.state === "inWar" ? "In War" : "War Ended");
                const rarroww = emoji.getEmoji('rarroww') || '➡️';
                
                const singleEmbed = new EmbedBuilder()
                    .setTitle(clanData.name)
                    .setThumbnail(clanData.badgeUrls?.medium || null)
                    .setColor(0xFFA500)
                    .setDescription(
                        `**War Against**\n[${opponentName}](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${opponentTag.replace("#", "")}) (\`${opponentTag}\`)\n\n` +
                        `**War State**\n${stateFormatted} (${war.teamSize} vs ${war.teamSize})\n\n` +
                        `**War Type**\n${matchType}\n**Mail :** ${mailText}\n\n` +
                        `**War Composition**\n**${clanData.name}**\n${clanComp}\n**${opponentName}**\n${oppComp}`
                    )
                    .setTimestamp();
                    
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`warsearch_refresh_${target}`)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emoji.getEmoji('refresh') || '🔄')
                );
                    
                clearInterval(animationInterval);
                return await interaction.editReply({ embeds: [singleEmbed], components: [row] });
                
            } catch (err) {
                clearInterval(animationInterval);
                return await interaction.editReply({ content: "Error fetching war data for that clan. It might not be in the FWA registry or CoC API failed.", embeds: [] });
            }
        }
    }
};
