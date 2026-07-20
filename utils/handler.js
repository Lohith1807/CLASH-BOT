const cheerio = require("cheerio");
const proxyFetch = require("./proxyFetch"); // Assuming it's in utils
const ticketHandler = require("./tickets/ticketHandler");
const fs = require("fs");
const path = require("path");

function getCwlClans() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, "../data/cwlclans.json"), "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

async function handleInteraction(interaction, context) {
    const handled = await ticketHandler(interaction, context);
    if (handled) return;

    if (interaction.isButton() && interaction.customId.startsWith("staffpannel_")) {
        const staffPannelCmd = require("../commands/discord/moderation/staff-pannel.js");
        return staffPannelCmd.handleButtonPress(interaction, context);
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith("sync_")) {
        const syncCommand = require("../commands/coc/war/sync.js");
        return syncCommand.handleSyncButton(interaction, context);
    }

    // ── /member-replacements handler ─────────────────────────────────────────
    if (
        (interaction.isButton() || interaction.isStringSelectMenu()) &&
        (interaction.customId.startsWith("memreplace_") || interaction.customId.startsWith("mr_"))
    ) {
        const memberReplacementsCmd = require("../commands/coc/clan/member-replacements.js");
        return memberReplacementsCmd.handleMemberReplacements(interaction, context);
    }
    // ── end /member-replacements handler ────────────────────────────────────

    // ── /cwl-clan edit panel — select menu ───────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === "cwl_clan_edit_sel") {
        const cwlClanCmd = require("../commands/coc/clan/cwl-clan.js");
        return cwlClanCmd.handleSelectMenu(interaction, context);
    }

    // ── /cwl-clan edit panel — buttons ───────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("cwl_clan_edit_")) {
        const cwlClanCmd = require("../commands/coc/clan/cwl-clan.js");
        return cwlClanCmd.handleButton(interaction, context);
    }
    // ── end /cwl-clan edit panel handler ─────────────────────────────────────

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, data: dataManager, coc, config, emoji } = context;
    const { getEmoji, getEmojiObject } = emoji;

    if (interaction.isButton()) {
        const id = interaction.customId;

        if (id.startsWith("sync_")) {
            const syncCommand = require("../commands/coc/war/sync.js");
            return syncCommand.handleSyncButton(interaction, context);
        }

        if (id.startsWith("checkinvite_refresh:")) {
            const checkinvite = require("../commands/discord/moderation/checkinvite.js");
            return checkinvite.handleRefreshButton(interaction, context);
        }

        if (id === "clans10_btn_fwa" || id === "clans10_btn_war" || id === "clans10_btn_cwl") {
            if (interaction.replied || interaction.deferred) return;
            try {
                await interaction.deferReply({ ephemeral: true });
                const clanRoles = dataManager.getClanRoles();

                if (id === "clans10_btn_fwa") {
                    var fwaTags = [];
                    for (var cTag in clanRoles) {
                        if (clanRoles[cTag].clanType !== "war") fwaTags.push(cTag);
                    }

                    var embeds = [];
                    var currentText = getEmoji("bluefwa") + " **FWA Clans** are for easy farming and max loot!\n\n**FWA Clans - " + fwaTags.length + "**\n";
                    var options = [];
                    for (var idx = 0; idx < fwaTags.length; idx++) {
                        try {
                            var tag = fwaTags[idx];
                            var clanInfo = clanRoles[tag] || {};
                            var clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                            var badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("whitefwa");
                            var badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("whitefwa");

                            var clan = await coc.getClan(tag);
                            const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clan.tag.replace("#", "")}`;
                            var clanLine = (idx + 1) + ". " + badgeEmojiStr + " [**" + clan.name + "** (" + clan.members + "/50)](" + clanLink + ")\n";
                            
                            if (currentText.length + clanLine.length > 4000) {
                                embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "FWA Clans" : "FWA Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                                currentText = "";
                            }
                            
                            currentText += clanLine;
                            if (options.length < 25) {
                                options.push({ label: clan.name, description: "FWA | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                            }
                        } catch (err) {
                            var clanLine = (idx + 1) + ". ❌ " + fwaTags[idx] + " - Error\n";
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

                    var selectRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId("clans10_sel_fwa").setPlaceholder("Select an FWA Clan").addOptions(options)
                    );
                    
                    try {
                        await interaction.editReply({ embeds: embeds, components: [selectRow] });
                    } catch (err) {
                        if (err.code === 50035) {
                            options.forEach(opt => delete opt.emoji);
                            var retryRow = new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder().setCustomId("clans10_sel_fwa").setPlaceholder("Select an FWA Clan").addOptions(options)
                            );
                            await interaction.editReply({ embeds: embeds, components: [retryRow] }).catch(e => console.error("Retry failed:", e));
                        } else {
                            throw err;
                        }
                    }
                }

                else if (id === "clans10_btn_war") {
                    var warTags = [];
                    for (var cTag in clanRoles) {
                        if (clanRoles[cTag].clanType === "war") warTags.push(cTag);
                    }

                    var embeds = [];
                    var currentText = getEmoji("cocfight") + " **War Clans** are competitive and focus on winning streaks!\n\n**War Clans - " + warTags.length + "**\n";
                    var options = [];
                    for (var idx = 0; idx < warTags.length; idx++) {
                        try {
                            var tag = warTags[idx];
                            var clanInfo = clanRoles[tag] || {};
                            var clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                            var badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("cocfight");
                            var badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cocfight");

                            var clan = await coc.getClan(tag);
                            const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${clan.tag.replace("#", "")}`;
                            var clanLine = (idx + 1) + ". " + badgeEmojiStr + " [**" + clan.name + "** (" + clan.members + "/50)](" + clanLink + ")\n";
                            
                            if (currentText.length + clanLine.length > 4000) {
                                embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "War Clans" : "War Clans (Cont.)").setDescription(currentText).setColor(0xE74C3C));
                                currentText = "";
                            }
                            
                            currentText += clanLine;
                            if (options.length < 25) {
                                options.push({ label: clan.name, description: "War | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                            }
                        } catch (err) {
                            var clanLine = (idx + 1) + ". ❌ " + warTags[idx] + " - Error\n";
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

                    var selectRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId("clans10_sel_war").setPlaceholder("Select a War Clan").addOptions(options)
                    );
                    
                    try {
                        await interaction.editReply({ embeds: embeds, components: [selectRow] });
                    } catch (err) {
                        if (err.code === 50035) {
                            options.forEach(opt => delete opt.emoji);
                            var retryRow = new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder().setCustomId("clans10_sel_war").setPlaceholder("Select a War Clan").addOptions(options)
                            );
                            await interaction.editReply({ embeds: embeds, components: [retryRow] }).catch(e => console.error("Retry failed:", e));
                        } else {
                            throw err;
                        }
                    }
                }

                else if (id === "clans10_btn_cwl") {
                    const familyClansCmd = require("../commands/coc/clan/family-clans.js");
                    const result = await familyClansCmd.buildCwlResponse(coc, clanRoles, getEmoji, getEmojiObject);
                    if (!result) return interaction.editReply("No CWL clans found.");
                    await interaction.editReply({ embeds: result.embeds, components: result.components });
                }

            } catch (error) {
                if (error.code === 10062 || error.code === 40060) return; // Ignore Unknown Interaction / Already Acknowledged
                console.error("Clans dashboard button error:", error);
                try { await interaction.editReply({ content: "❌ Error processing request." }); } catch (e) {}
            }
            return;
        }

        // ── CWL Clans refresh button ──────────────────────────────────────────
        if (id === "familyclans_refresh_cwl") {
            if (interaction.replied || interaction.deferred) return;
            try {
                await interaction.deferUpdate();
                const clanRoles = dataManager.getClanRoles();
                const familyClansCmd = require("../commands/coc/clan/family-clans.js");
                const result = await familyClansCmd.buildCwlResponse(coc, clanRoles, getEmoji, getEmojiObject);
                if (!result) return interaction.editReply({ content: "No CWL clans found.", embeds: [], components: [] });
                await interaction.editReply({ embeds: result.embeds, components: result.components });
            } catch (err) {
                console.error("CWL refresh error:", err);
                try { await interaction.followUp({ content: "❌ Error refreshing CWL clans.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("count_accounts:")) {
            const parts = id.split(":");
            const targetUserId = parts[1];
            
            try { await interaction.deferReply({ ephemeral: true }); } catch (e) { return; }

            const userData = dataManager.getUserData();
            const accounts = userData[targetUserId] || [];

            if (accounts.length === 0) {
                return interaction.editReply({ content: "❌ No accounts linked for this user." });
            }

            const fetchPromises = accounts.map(acc => coc.getPlayer(acc.tag).catch(() => null));
            const playerDetails = await Promise.all(fetchPromises);

            const thCounts = {};
            let totalAccounts = 0;
            playerDetails.forEach(p => {
                if (p && p.townHallLevel) {
                    thCounts[p.townHallLevel] = (thCounts[p.townHallLevel] || 0) + 1;
                    totalAccounts++;
                }
            });

            const sortedTHs = Object.keys(thCounts).sort((a, b) => b - a);

            let desc = "";
            sortedTHs.forEach(th => {
                const thEmoji = getEmoji("th" + th) || "🏰";
                desc += `${thEmoji} **TH${th}**: ${thCounts[th]}\n`;
            });

            if (!desc) desc = "Could not fetch Town Hall levels.";

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Town Hall Breakdown`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setColor(0x2ecc71)
                .setDescription(`**Total Accounts Checked:** ${totalAccounts}\n\n${desc}`)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (id.startsWith("refresh_accounts:") || id.startsWith("prev_accounts:") || id.startsWith("next_accounts:")) {
            const parts = id.split(":");
            const action = parts[0];
            const targetUserId = parts[1];
            let page = parts.length > 2 ? parseInt(parts[2]) : 0;
            if (isNaN(page)) page = 0;

            const userData = dataManager.getUserData();
            const accounts = userData[targetUserId] || [];

            try { await interaction.deferUpdate(); } catch(e) { return; }

            if (accounts.length === 0) {
                return interaction.editReply({ content: "❌ No accounts linked for this user.", embeds: [], components: [] });
            }

            if (action === "prev_accounts") {
                page = Math.max(0, page - 1);
            } else if (action === "next_accounts") {
                const totalPages = Math.ceil(accounts.length / 15);
                page = Math.min(totalPages - 1, page + 1);
            }

            try {
                const playerAccountsCmd = require("../commands/coc/profile/playeraccounts.js");
                const targetUser = await interaction.client.users.fetch(targetUserId);
                const embed = await playerAccountsCmd.buildAccountEmbed(targetUser, accounts, coc, emoji, page);
                
                let components = [];
                if (playerAccountsCmd.buildComponents) {
                    components = playerAccountsCmd.buildComponents(targetUserId, accounts.length, page, emoji);
                } else {
                    const refreshButton = new ButtonBuilder()
                        .setCustomId(`refresh_accounts:${targetUserId}:${page}`)
                        .setEmoji(emoji.getEmojiObject('refresh') || '🔄')
                        .setStyle(ButtonStyle.Secondary);
                    const row = new ActionRowBuilder().addComponents(refreshButton);
                    components = [row];
                }

                await interaction.editReply({ embeds: [embed], components: components });
            } catch (err) {
                console.error("Error refreshing player accounts:", err);
                await interaction.followUp({ content: "❌ Error refreshing account details.", ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (id.startsWith("profile_prev:") || id.startsWith("profile_next:")) {
            const parts = id.split(":");
            const action = parts[0];
            const targetUserId = parts[1];
            let page = parts.length > 2 ? parseInt(parts[2]) : 0;
            if (isNaN(page)) page = 0;

            const userData = dataManager.getUserData();
            const accountsList = userData[targetUserId] || [];

            try { await interaction.deferUpdate(); } catch(e) { return; }

            if (accountsList.length === 0) {
                return interaction.editReply({ content: "❌ No accounts linked for this user.", embeds: [], components: [] });
            }

            const perPage = 5;
            const totalPages = Math.ceil(accountsList.length / perPage) || 1;

            if (action === "profile_prev") {
                page = page > 0 ? page - 1 : totalPages - 1;
            } else if (action === "profile_next") {
                page = (page + 1) % totalPages;
            }

            try {
                const profileCmd = require("../commands/coc/profile/profile.js");
                const targetUser = await interaction.client.users.fetch(targetUserId);
                
                const accounts = await profileCmd.getProfileAccounts(targetUserId, userData, coc, emoji);
                const embed = profileCmd.buildProfileEmbed(targetUser, accounts, page);
                const components = profileCmd.buildProfileComponents(targetUserId, page, emoji.getEmojiObject("larrow"), emoji.getEmojiObject("rarrow"), accounts.length);

                await interaction.editReply({ embeds: [embed], components: components });
            } catch (err) {
                console.error("Error refreshing profile accounts:", err);
                await interaction.followUp({ content: "❌ Error refreshing profile details.", ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (id.startsWith("wclans_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            const isFwa = id.startsWith("wclans_refresh_fwa_");
            const cleanTag = id.replace("wclans_refresh_fwa_", "").replace("wclans_refresh_war_", "").replace("wclans_refresh_", "");
            const clanTag = "#" + cleanTag;

            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                const clan = await coc.getClan(clanTag);
                if (isFwa) {
                    const clanRoles = dataManager.getClanRoles();
                    const clansCmd = require("../commands/coc/clan/clan.js");
                    const embed = await clansCmd.buildClanEmbed(clanTag, clanRoles, clan, context);
                    if (embed) {
                        const refreshEmoji = getEmojiObject("refresh");
                        const refreshBtn = new ButtonBuilder()
                            .setCustomId("wclans_refresh_fwa_" + cleanTag)
                            .setLabel("Refresh Data")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(refreshEmoji || "🔄");
                        const btnRow = new ActionRowBuilder().addComponents(refreshBtn);
                        await interaction.editReply({ embeds: [embed], components: [btnRow] });
                    }
                } else {
                    const totalWars = clan.warWins + (clan.warLosses || 0);
                    const winRatio = totalWars > 0 ? (clan.warWins / totalWars).toFixed(2) : "0.00";
                    const link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clan.tag.replace("#", "");
                    const locationStr = clan.location && clan.location.name ? "🌐 " + clan.location.name : "N/A";
                    const leaderMember = clan.memberList.find(m => m.role === "leader");
                    const leaderName = leaderMember ? leaderMember.name : "Unknown";

                    const embed = new EmbedBuilder()
                        .setTitle(clan.name)
                        .setThumbnail(clan.badgeUrls.medium)
                        .setColor(Math.floor(Math.random() * 0xffffff))
                        .setDescription(
                            "Tag: [" + clan.tag + "](" + link + ")\n" +
                            "Trophies: " + getEmoji("throphy") + " " + clan.clanPoints + " | " + getEmoji("clancastle") + " " + (clan.clanCapitalPoints || 0) + "\n" +
                            "Required Trophies: " + getEmoji("throphy") + " " + clan.requiredTrophies + "\n" +
                            "Location: " + locationStr + "\n\n" +
                            "Leader: " + leaderName + "\n" +
                            "Level: " + clan.clanLevel + "\n" +
                            "Members: " + getEmoji("mem") + " " + clan.members + "/50\n\n" +
                            "CWL: " + (clan.warLeague ? clan.warLeague.name : "N/A") + "\n" +
                            "Wars Won: " + getEmoji("uparrow") + " " + clan.warWins + "\n" +
                            "Wars Lost: " + getEmoji("downarrow") + " " + (clan.warLosses || 0) + "\n" +
                            "War Streak: " + getEmoji("graph") + " " + clan.warWinStreak + "\n" +
                            "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
                            "Description: " + (clan.description || "No description provided.")
                        )
                        .setTimestamp();

                    const selectRow = buildClanSelectRow(clan, getEmojiObject, StringSelectMenuBuilder, ActionRowBuilder);
                    const buttonRow = buildRefreshButton(clan, getEmojiObject, ButtonBuilder, ButtonStyle, ActionRowBuilder);

                    await interaction.editReply({ embeds: [embed], components: [selectRow, buttonRow] });
                }
            } catch (err) {
                console.error(err);
                await interaction.followUp({ content: "❌ Error refreshing clan data.", ephemeral: true }).catch(function() {});
            }
            return;
        }

        if (id === "clans_info_fwa") {
            const fwaEmbed = new EmbedBuilder()
                .setTitle(getEmoji("question") + " What is FWA?")
                .setColor(0x3498DB)
                .setDescription(
                    "The **Farming War Alliance (FWA)** is a group of over 600+ clans that participate in 'lazy wars' to maximize loot and XP with minimal effort.\n\n" +
                    getEmoji("whitefwa") + " **How it works:** All clans use a standardized 'easy-to-three-star' base design. Winners are determined based on a match system, ensuring everyone gets high loot and clan XP without using expensive armies or heroes.\n\n" +
                    "✅ **Benefits:** Fast progression, easy loot, and hero upgrades are always available since you don't need them for war!"
                )
                .setTimestamp();
            return interaction.reply({ embeds: [fwaEmbed], ephemeral: true });
        }

        if (id === "clans_info_cwl") {
            const cwlEmbed = new EmbedBuilder()
                .setTitle(getEmoji("cwl") + " How we conduct CWL")
                .setColor(0xF1C40F)
                .setDescription(
                    "**Blood Alliance CWL Approach:**\n\n" +
                    "🔹 **FWA Clans:** We conduct **Lazy CWL**. This means we don't worry about winning; we just focus on getting the 8-star minimum for max medals. No stress, just rewards!\n\n" +
                    "🔹 **War Clans:** We conduct **Serious CWL**. These clans push for promotion and require full hero availability and strategic attacks.\n\n" +
                    "🎫 Check your clan's specific pins for sign-up details!"
                )
                .setTimestamp();
            return interaction.reply({ embeds: [cwlEmbed], ephemeral: true });
        }

        if (id === "clans_info_stats") {
            try {
                await interaction.deferReply({ ephemeral: true });
                const clanRoles = dataManager.getClanRoles();
                const clanTags = Object.keys(clanRoles);
                
                const clansData = await Promise.all(
                    clanTags.map(async (tag) => {
                        try {
                            const clan = await coc.getClan(tag);
                            const warLog = await coc.getWarLog(tag).catch(() => ({ items: [] }));
                            const currentWar = await coc.getCurrentWar(tag).catch(() => ({ state: "notInWar" }));
                            return { clan, warLog, currentWar, tag };
                        } catch (e) {
                            return null;
                        }
                    })
                );

                let embeds = [];
                clansData.forEach((dataObj) => {
                    if (!dataObj) return;
                    const { clan, warLog, currentWar, tag } = dataObj;
                    const roleInfo = clanRoles[tag];
                    const clanType = roleInfo ? (roleInfo.clanType || "fwa") : "fwa";
                    const tagNoHash = tag.replace("#", "");

                    let spotStatus = "";
                    if (clan.members >= 50) {
                        spotStatus = "🔴 Full";
                    } else if (clan.members >= 48) {
                        spotStatus = "🟡 Limited";
                    } else {
                        spotStatus = "🟢 Available";
                    }

                    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    const recentWars = (warLog.items || []).filter(w => {
                        const endTime = w.endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6");
                        return new Date(endTime).getTime() > sevenDaysAgo;
                    }).length;

                    const isWarActive = (currentWar && currentWar.state !== "notInWar") || recentWars >= 1;
                    const warStatus = isWarActive ? `Yes ${getEmoji("gtick")}` : `No ${getEmoji("bluex")}`;

                    const clanTypeText = clanType === "war" ? "war" : "fwa";

                    let embed = new EmbedBuilder()
                        .setAuthor({ 
                            name: `${clan.name} - ${clan.tag}`, 
                            iconURL: clan.badgeUrls ? clan.badgeUrls.small : null, 
                            url: `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tagNoHash}` 
                        })
                        .setDescription(
                            `**Spots :** ${spotStatus}\n` +
                            `**Active Wars :** ${warStatus}\n` +
                            `**Clan Type :** ${clanTypeText}\n` +
                            `**Open in Game:** [Click here](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${tagNoHash})`
                        )
                        .setColor(clanType === "war" ? 0xE74C3C : 0x3498DB); // Red for War, Blue for FWA

                    embeds.push(embed);
                });

                if (embeds.length === 0) {
                    return interaction.editReply({ content: "❌ No clan data available." });
                }

                if (embeds.length > 10) {
                    await interaction.editReply({ embeds: embeds.slice(0, 10) });
                    for (let i = 10; i < embeds.length; i += 10) {
                        await interaction.followUp({ embeds: embeds.slice(i, i + 10), ephemeral: true });
                    }
                } else {
                    await interaction.editReply({ embeds: embeds });
                }
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: "❌ Error fetching alliance statistics." });
            }
            return;
        }

        if (id.startsWith("clan_availability_")) {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + id.replace("clan_availability_", "");

            try { await interaction.deferReply({ ephemeral: true }); } catch(e) { return; }

            try {
                const clan = await coc.getClan(clanTag);
                const members = clan.members;
                const maxMembers = 50;
                const spotsLeft = maxMembers - members;

                let responseEmbed = new EmbedBuilder().setTimestamp();

                const clanRoles = dataManager.getClanRoles();
                const roleInfo = clanRoles[clanTag] || {};
                const isFwa = roleInfo.clanType === "fwa";

                if (spotsLeft > 0) {
                    let clanDescription = 
                        getEmoji("mem") + " **Members:** " + members + "/" + maxMembers + "\n" +
                        getEmoji("gtick") + " **Availability:** " + spotsLeft + " Spot" + (spotsLeft > 1 ? "s" : "") + " Left\n\n";
                    
                    if (isFwa) {
                        clanDescription += 
                            getEmoji("whitefwa") + " **Fwa Clan**\n" +
                            getEmoji("cwl") + " **Lazy cwl**\n";
                    } else {
                        clanDescription += 
                            getEmoji("cocfight") + " **War Clan**\n" +
                            getEmoji("cwl") + " **Serious cwl**\n";
                    }

                    clanDescription += getEmoji("alaram") + " **Very Active**";

                    responseEmbed.setTitle(getEmoji("sheild") + " " + clan.name)
                        .setColor(0x2ECC71) // Green
                        .setDescription(clanDescription);
                } else {
                    responseEmbed.setTitle(getEmoji("sheild") + " " + clan.name)
                        .setColor(0xE74C3C) // Red
                        .setDescription(
                            getEmoji("mem") + " **Members:** " + members + "/" + maxMembers + "\n" +
                            getEmoji("tickred") + " **Clan Full**\n\n" +
                            "**Try:**"
                        );

                    const clanRoles = dataManager.getClanRoles();
                    const otherTags = Object.keys(clanRoles).filter(tag => tag !== clanTag);
                    
                    const otherClansData = await Promise.all(
                        otherTags.map(tag => coc.getClan(tag).catch(() => null))
                    );

                    const availableClans = otherClansData.filter(c => c && c.members < 50);

                    if (availableClans.length > 0) {
                        let suggestions = "";
                        availableClans.forEach(c => {
                            const left = 50 - c.members;
                            const clanInfo = clanRoles[c.tag] || {};
                            const clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                            const badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("arrow");
                            suggestions += badgeEmojiStr + " **" + c.name + "** (" + left + " spot" + (left > 1 ? "s" : "") + ")\n";
                        });
                        responseEmbed.addFields({ name: "Clans with Space", value: suggestions });
                    } else {
                        responseEmbed.addFields({ name: "Note", value: "All alliance clans are currently full!" });
                    }
                }

                await interaction.editReply({ embeds: [responseEmbed] });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: "❌ Error checking clan availability." });
            }
            return;
        }
        if (id.startsWith("discordlinks_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + id.replace("discordlinks_refresh_", "");

            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                const linkedlistclanCmd = require("../commands/coc/profile/linkedlistclan.js");
                await linkedlistclanCmd.run(interaction, clanTag, context, true, true);
            } catch (err) {
                console.error(err);
                try { await interaction.followUp({ content: "❌ Error refreshing discord links.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("clan_cc_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + id.replace("clan_cc_refresh_", "");
            
            try { await interaction.deferUpdate(); } catch(e) { return; }
            
            try {
                const clanccCmd = require("../commands/coc/clan/clancc.js");
                const embeds = await clanccCmd.buildClanCCEmbeds(clanTag, coc, dataManager, emoji);
                if (embeds) {
                    await interaction.editReply({ embeds });
                } else {
                    await interaction.followUp({ content: "❌ Error refreshing clan CC data.", ephemeral: true }).catch(() => {});
                }
            } catch (err) {
                console.error(err);
                try { await interaction.followUp({ content: "❌ Error refreshing clan CC data.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("warsearch_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            const target = id.replace("warsearch_refresh_", "");
            
            try { await interaction.deferUpdate(); } catch(e) { return; }
            
            try {
                const warsearchCmd = require("../commands/coc/war/war_search.js");
                const mockInteraction = {
                    options: { getString: () => target },
                    reply: async (data) => await interaction.editReply(data).catch(()=>{}),
                    editReply: async (data) => await interaction.editReply(data).catch(()=>{}),
                    followUp: async (data) => await interaction.followUp(data).catch(()=>{}),
                };
                await warsearchCmd.execute(mockInteraction, context);
            } catch (err) {
                console.error(err);
            }
            return;
        }

        if (id.startsWith("compo_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            var compoTag = "#" + id.replace("compo_refresh_", "");

            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                var clan = await coc.getClan(compoTag);

                var thEmojis = {
                    18: getEmoji("th18"), 17: getEmoji("th17"), 16: getEmoji("th16"),
                    15: getEmoji("th15"), 14: getEmoji("th14"), 13: getEmoji("th13"),
                    12: getEmoji("th12"), 11: getEmoji("th11")
                };
                var thCounts = {};
                var totalTH = 0;
                var totalMembers = 0;

                clan.memberList.forEach(function(m) {
                    thCounts[m.townHallLevel] = (thCounts[m.townHallLevel] || 0) + 1;
                    totalTH += m.townHallLevel;
                    totalMembers++;
                });

                var sortedTH = Object.entries(thCounts).sort(function(a, b) { return b[0] - a[0]; });
                var desc = "";
                sortedTH.forEach(function(entry) {
                    var emojiStr = thEmojis[entry[0]] || "🏰";
                    desc += "**TH" + entry[0] + "** " + emojiStr + " **" + entry[1] + "**\n";
                });

                var avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";

                var now = new Date();
                var options = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
                var timestamp = now.toLocaleString('en-GB', options).replace(',', '');

                var compoEmbed = new EmbedBuilder()
                    .setTitle(clan.name + " Townhalls")
                    .setDescription(desc || "No data")
                    .setColor(0xFF0000)
                    .setThumbnail(clan.badgeUrls.medium)
                    .setFooter({ text: "Accounts: " + totalMembers + " | Avg TH: " + avgTH + " | Updated: " + timestamp });

                var refreshEmoji = getEmojiObject("refresh");
                var compoBtn = new ButtonBuilder()
                    .setCustomId("compo_refresh_" + compoTag.replace("#", ""))
                    .setLabel("Refresh Data")
                    .setStyle(ButtonStyle.Secondary);

                if (refreshEmoji) { compoBtn.setEmoji(refreshEmoji); }
                else { compoBtn.setEmoji("🔄"); }

                var compoBtnRow = new ActionRowBuilder().addComponents(compoBtn);
                await interaction.editReply({ embeds: [compoEmbed], components: [compoBtnRow] });
            } catch (err) {
                console.error(err);
                try { await interaction.followUp({ content: "❌ Error refreshing compo data.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("ww_submit_update_")) {
            const cleanTag = id.replace("ww_submit_update_", "").toUpperCase();
            const clanTag = "#" + cleanTag;
            
            try {
                const wwPath = path.join(__dirname, "../data/ww.json");
                let wwData = {};
                if (fs.existsSync(wwPath)) {
                    try {
                        wwData = JSON.parse(fs.readFileSync(wwPath, "utf8"));
                    } catch (e) {}
                }
                
                let clanName = clanTag;
                try {
                    const clan = await coc.getClan(clanTag);
                    if (clan && clan.name) {
                        clanName = clan.name;
                    }
                } catch (e) {}

                // Clean up case-mismatched duplicates
                const lowerTag = clanTag.toLowerCase();
                const cleanTagKey = cleanTag; // without hash
                const keysToDelete = [lowerTag, cleanTagKey, cleanTagKey.toLowerCase()];
                for (const key of keysToDelete) {
                    if (key !== clanTag && wwData[key]) {
                        delete wwData[key];
                    }
                }

                if (!wwData[clanTag]) {
                    wwData[clanTag] = { clanName: clanName, lastUpdated: "" };
                } else {
                    wwData[clanTag].clanName = clanName;
                }

                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const year = now.getFullYear();
                const todayStr = `${day}/${month}/${year}`;
                
                wwData[clanTag].lastUpdated = todayStr;
                
                fs.writeFileSync(wwPath, JSON.stringify(wwData, null, 2), "utf8");
                
                const disabledBtn = new ButtonBuilder()
                    .setCustomId(`ww_submit_update_${cleanTag}`)
                    .setLabel("Submitted")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(getEmojiObject("gtick") || "✅")
                    .setDisabled(true);
                const actionRow = new ActionRowBuilder().addComponents(disabledBtn);

                await interaction.update({ components: [actionRow] });
                await interaction.followUp({ content: `${getEmoji("gtick")} Successfully updated war weight submission time for ${clanTag} to ${todayStr}!`, ephemeral: true });

                try {
                    const logChannel = await interaction.client.channels.fetch("1516719047348326493").catch(() => null);
                    if (logChannel) {
                        await logChannel.send(`📢 **FWA Weight Update Detected!**\nClan: **${wwData[clanTag].clanName || clanTag}** (${clanTag})\nNew weight update submitted on: **${todayStr}**`).catch(() => {});
                    }
                } catch (err) {
                    console.error("Failed to send log message:", err);
                }
            } catch (err) {
                console.error(err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "❌ Error updating war weight submission time.", ephemeral: true }).catch(()=>{});
                }
            }
            return;
        }

        if (id === "calc_war_weight_btn") {
            const modal = new ModalBuilder()
                .setCustomId('war_weight_modal')
                .setTitle('Calculate War Weight');

            const weightInput = new TextInputBuilder()
                .setCustomId('weight_input')
                .setLabel('Enter gold or elixir capacity')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 31800')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(weightInput);
            modal.addComponents(firstActionRow);

            return interaction.showModal(modal);
        }

        if (id.startsWith("scanclan_refresh_")) {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + id.replace("scanclan_refresh_", "");

            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                const scanClanCmd = require("../commands/coc/war/scan-clan.js");
                const result = await scanClanCmd.buildScanClanEmbeds(clanTag, coc, dataManager, emoji);
                if (result && result.embeds) {
                    await scanClanCmd.sendBatchedEmbeds(interaction, result.embeds);
                } else {
                    await interaction.followUp({ content: "❌ Error refreshing war roster.", ephemeral: true }).catch(() => {});
                }
            } catch (err) {
                console.error(err);
                try { await interaction.followUp({ content: "❌ Error refreshing war roster.", ephemeral: true }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("scanclan_lastwars_")) {
            if (interaction.replied || interaction.deferred) return;
            const cleanTag = id.replace("scanclan_lastwars_", "");
            const clanTag = "#" + cleanTag;

            try { await interaction.deferReply({ ephemeral: true }); } catch(e) { return; }

            try {
                const scanClanCmd = require("../commands/coc/war/scan-clan.js");
                const scanData = dataManager.getScanWar();
                const wars = scanData[clanTag] || [];

                if (wars.length === 0) {
                    return interaction.editReply({ content: "📜 No stored wars found for this clan." });
                }

                const options = wars.map((w, i) => {
                    const timeAgo = scanClanCmd.getTimeAgo(w.endTime);
                    const label = `${w.opponentName}`.slice(0, 50);
                    const desc = `${timeAgo} | ${w.opponentTag}`.slice(0, 100);
                    return {
                        label: label,
                        description: desc,
                        value: `${cleanTag}_${i}`
                    };
                }).slice(0, 25);

                const { StringSelectMenuBuilder: SSM, ActionRowBuilder: ARB } = require('discord.js');
                const selectRow = new ARB().addComponents(
                    new SSM()
                        .setCustomId(`scanclan_warselect_${cleanTag}`)
                        .setPlaceholder("Select a past war to view...")
                        .addOptions(options)
                );

                await interaction.editReply({ content: "📜 **Select a past war to view the roster:**", components: [selectRow] });
            } catch (err) {
                console.error(err);
                try { await interaction.editReply({ content: "❌ Error loading past wars." }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("change_main:")) {
            const parts = id.split(":");
            const targetUserId = parts[1];
            const page = parts[2] || 0;
            
            const isOwner = interaction.user.id === targetUserId;
            const hasAdmin = interaction.member && interaction.member.roles && interaction.member.roles.cache.some(r => config.ADMIN_ROLE_IDS.includes(r.id));
            const hasStaff = interaction.member && interaction.member.roles && interaction.member.roles.cache.some(r => config.STAFF_ROLE_IDS.includes(r.id));
            
            if (!isOwner && !hasAdmin && !hasStaff) {
                return interaction.reply({ content: "❌ You do not have permission to change this user's main ID.", ephemeral: true });
            }
            
            const userData = dataManager.getUserData();
            const accounts = userData[targetUserId] || [];
            if (accounts.length <= 1) {
                return interaction.reply({ content: "❌ This user doesn't have multiple accounts to choose from.", ephemeral: true });
            }
            
            const options = accounts.map(acc => ({
                label: (acc.name || acc.tag).substring(0, 100),
                description: `Tag: ${acc.tag}`,
                value: acc.tag
            }));
            
            const selectOptions = options.slice(0, 25);
            
            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`select_main:${targetUserId}:${page}`)
                    .setPlaceholder("Select new main account...")
                    .addOptions(selectOptions)
            );
            
            return interaction.reply({ content: "Select the account to set as Main:", components: [selectRow], ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;

        if (id.startsWith("select_main:")) {
            const parts = id.split(":");
            const targetUserId = parts[1];
            const page = parseInt(parts[2]) || 0;
            const selectedTag = interaction.values[0];
            
            const userData = dataManager.getUserData();
            const accounts = userData[targetUserId] || [];
            
            const selectedIndex = accounts.findIndex(a => a.tag === selectedTag);
            if (selectedIndex > -1) {
                const selectedAccount = accounts.splice(selectedIndex, 1)[0];
                accounts.unshift(selectedAccount);
                dataManager.saveUserData(userData);
                
                await interaction.update({ content: `✅ Main account updated to **${selectedTag}**! Please run the \`;p\` command again to see the changes.`, components: [] });
            } else {
                await interaction.update({ content: `❌ Could not find account.`, components: [] });
            }
            return;
        }

        if (id === "clans10_sel_fwa" || id === "clans10_sel_war" || id === "clans10_sel_cwl") {
            if (interaction.replied || interaction.deferred) return;
            const clans1 = require("../commands/coc/clan/clan.js");
            var selectedTag = "#" + interaction.values[0];

            try { 
                await interaction.deferReply({ ephemeral: true }); 
            } catch(e) { 
                if (e.code === 10062 || e.code === 40060) return;
                console.error("Error deferring select menu:", e);
                return; 
            }

            try {
                var clanRoles = dataManager.getClanRoles();
                var clanData = await coc.getClan(selectedTag);
                var clanEmbed;

                var availBtnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("clan_availability_" + selectedTag.replace("#", ""))
                        .setLabel("Availability")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(getEmojiObject("sheild") || "🛡️")
                );

                if (id === "clans10_sel_fwa") {
                    clanEmbed = await clans1.buildClanEmbed(selectedTag, clanRoles, clanData, context);
                    await interaction.editReply({ embeds: [clanEmbed], components: [availBtnRow] });
                }

                else if (id === "clans10_sel_war") {
                    clanEmbed = await clans1.buildWarClanEmbed(selectedTag, context);
                    
                    var warSelectRow = buildClanSelectRow(clanData, getEmojiObject, StringSelectMenuBuilder, ActionRowBuilder);
                    var warButtonRow = buildRefreshButton(clanData, getEmojiObject, ButtonBuilder, ButtonStyle, ActionRowBuilder);
                    
                    warButtonRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId("clan_availability_" + selectedTag.replace("#", ""))
                            .setLabel("Availability")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(getEmojiObject("sheild") || "🛡️")
                    );

                    await interaction.editReply({ embeds: [clanEmbed], components: [warSelectRow, warButtonRow] });
                }

                else if (id === "clans10_sel_cwl") {
                    const cwlData = getCwlClans();
                    clanEmbed = await clans1.buildCwlClanEmbed(selectedTag, cwlData, clanData, context);
                    await interaction.editReply({ embeds: [clanEmbed], components: [availBtnRow] });
                }


            } catch(err) {
                console.error("Error in clans10 select menu:", err);
                try { await interaction.editReply({ content: "❌ Error fetching clan data.", embeds: [], components: [] }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("scanclan_warselect_")) {
            if (interaction.replied || interaction.deferred) return;
            const selectedValue = interaction.values[0];
            const parts = selectedValue.split("_");
            const warIndex = parseInt(parts[parts.length - 1]);
            const cleanTag = selectedValue.replace(`_${warIndex}`, "");
            const clanTag = "#" + cleanTag;

            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                const scanClanCmd = require("../commands/coc/war/scan-clan.js");
                const scanData = dataManager.getScanWar();
                const wars = scanData[clanTag] || [];

                if (isNaN(warIndex) || warIndex < 0 || warIndex >= wars.length) {
                    return interaction.editReply({ content: "❌ War data not found.", components: [] });
                }

                const storedWar = wars[warIndex];
                let clanName = clanTag;
                let clanBadgeUrl = null;
                let liveClan = null;
                try {
                    liveClan = await coc.getClan(clanTag);
                    clanName = liveClan.name;
                    clanBadgeUrl = liveClan.badgeUrls?.large || liveClan.badgeUrls?.medium;
                } catch(e) {}

                const pastWar = warIndex < wars.length - 1 ? wars[warIndex + 1] : null;
                const result = await scanClanCmd.buildStoredWarEmbeds(clanTag, clanName, clanBadgeUrl, storedWar, pastWar, liveClan, dataManager, emoji);
                await scanClanCmd.sendBatchedEmbeds(interaction, result.embeds, []);
            } catch (err) {
                console.error(err);
                try { await interaction.editReply({ content: "❌ Error loading past war data.", components: [] }); } catch(e) {}
            }
            return;
        }

        if (id.startsWith("strikeadd_select_")) {
            const pendingId = id.replace("strikeadd_select_", "");
            const strikeaddFile = require("../commands/coc/strike/strikeadd.js");
            const pendingData = strikeaddFile.pendingStrikes.get(pendingId);

            if (!pendingData) return interaction.update({ content: "❌ Pending strike data expired or not found. Please try again.", components: [] });

            const { targetUserId, reason, weight, addedBy } = pendingData;
            const playerTag = interaction.values[0];
            const userData = dataManager.getUserData();

            if (!userData[targetUserId]) return interaction.update({ content: "❌ User data not found.", components: [] });

            const account = userData[targetUserId].find(function(acc) { return acc.tag === playerTag; });
            if (!account) return interaction.update({ content: "❌ Account not found.", components: [] });

            if (account.totalStrikes === undefined) account.totalStrikes = account.strikes || 0;
            if (!account.strikeHistory) account.strikeHistory = [];
            
            let clanName = "Unknown Clan";
            let clanTag = null;
            let role = "Member";
            try {
                const cocData = await coc.getPlayer(playerTag);
                clanName = cocData.clan ? cocData.clan.name : "No Clan";
                clanTag = cocData.clan ? cocData.clan.tag : null;
                role = cocData.role ? (cocData.role.charAt(0).toUpperCase() + cocData.role.slice(1)) : "Member";
            } catch (err) {
                console.error("Error fetching player data:", err);
            }

            const strikeId = Math.random().toString(36).substring(2, 7).toUpperCase();
            const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

            account.totalStrikes = (account.totalStrikes || account.strikes || 0) + weight;

            const strikeEntry = {
                id: strikeId,
                reason: reason,
                weight: weight,
                strikeCountAdded: weight,
                totalAtTime: account.totalStrikes,
                addedBy: addedBy,
                clan: clanName,
                date: dateStr
            };

            account.strikes = account.totalStrikes;
            account.strikeHistory.push(strikeEntry);

            dataManager.saveUserData(userData);
            strikeaddFile.pendingStrikes.delete(pendingId);

            await interaction.update({ content: "✅ Added **" + weight + "** strike(s) to **" + account.name + "** (" + account.tag + "). Total strikes: **" + account.totalStrikes + "**", components: [] });

            const targetUser = await interaction.client.users.fetch(targetUserId).catch(function() { return null; });
            if (targetUser) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("⚠️ You received a strike")
                    .setColor(0xFF0000)
                    .setDescription(
                        "**Reason:** " + reason + "\n" +
                        "**Weight:** " + weight + "\n" +
                        "**Strikes Added:** " + weight + "\n" +
                        "**Total Strikes:** " + account.totalStrikes + "\n" +
                        "**Date:** " + dateStr
                    )
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] }).catch(function() { return null; });
            }

            if (account.totalStrikes >= 6 && !account.sixStrikeAlertSent) {
                account.sixStrikeAlertSent = true;
                dataManager.saveUserData(userData);

                const clanRoles = dataManager.getClanRoles();
                const clanConfig = clanRoles[clanTag];
                
                if (clanConfig && clanConfig.mailChannelId) {
                    const mailChannel = await interaction.client.channels.fetch(clanConfig.mailChannelId).catch(function() { return null; });
                    if (mailChannel) {
                        const guild = interaction.guild;
                        const leaderRole = guild.roles.cache.find(function(r) { return r.name.toLowerCase() === "leader"; }) || 
                                           guild.roles.cache.find(function(r) { return r.name.toLowerCase().includes("leader"); });
                        
                        const mention = leaderRole ? "<@&" + leaderRole.id + ">" : "@Leader";
                        
                        const alertEmbed = new EmbedBuilder()
                            .setTitle("⚠️ Player reached 6 strikes")
                            .setColor(0xFF0000)
                            .setDescription(
                                mention + "\n\n" +
                                "**Player:** " + account.name + "\n" +
                                "**Clan:** " + clanName + "\n" +
                                "**Current Strikes:** " + account.totalStrikes
                            )
                            .setTimestamp();

                        await mailChannel.send({ content: mention, embeds: [alertEmbed] }).catch(function() { return null; });
                    }
                }
            }
            return;
        }

        if (id.startsWith("strikeremove_select_")) {
            const parts = id.split("_");
            const targetUserId = parts[2];
            const removeCount = parseInt(parts[3]);
            const playerTag = interaction.values[0];
            const userData = dataManager.getUserData();

            if (!userData[targetUserId]) return interaction.update({ content: "❌ User data not found.", components: [] });

            const account = userData[targetUserId].find(function(acc) { return acc.tag === playerTag; });
            if (!account) return interaction.update({ content: "❌ Account not found.", components: [] });

            if (account.totalStrikes === undefined) account.totalStrikes = account.strikes || 0;

            if (account.totalStrikes <= 0) {
                return interaction.update({ content: "⚠️ **" + account.name + "** has 0 strikes.", components: [] });
            }

            const actualRemove = Math.min(removeCount, account.totalStrikes);
            let remainingToRemove = actualRemove;

            if (account.strikeHistory && account.strikeHistory.length > 0) {
                while (remainingToRemove > 0 && account.strikeHistory.length > 0) {
                    const lastStrike = account.strikeHistory[account.strikeHistory.length - 1];
                    if (lastStrike.weight <= remainingToRemove) {
                        remainingToRemove -= lastStrike.weight;
                        account.strikeHistory.pop();
                    } else {
                        lastStrike.weight -= remainingToRemove;
                        lastStrike.strikeCountAdded = lastStrike.weight;
                        remainingToRemove = 0;
                    }
                }
            }
            
            account.totalStrikes -= actualRemove;
            account.strikes = account.totalStrikes;
            if (account.totalStrikes < 6) account.sixStrikeAlertSent = false;

            dataManager.saveUserData(userData);
            await interaction.update({ content: "✅ Removed **" + actualRemove + "** strike(s) from **" + account.name + "** (" + account.tag + "). Current strikes: **" + account.totalStrikes + "**", components: [] });
            return;
        }

        if (id === "clans_dashboard_select") {
            if (interaction.replied || interaction.deferred) return;

            var selectedValue = interaction.values[0];
            var isFwa = selectedValue.startsWith("fwa_");
            var isWar = selectedValue.startsWith("war_");
            var clanTag = "#" + selectedValue.replace("fwa_", "").replace("war_", "");

            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (e) {
                console.error("Failed to defer clans_dashboard_select:", e.message);
                return;
            }

            try {
                var clan = await coc.getClan(clanTag);

                if (isFwa) {
                    var clanDataFile = dataManager.getClanRoles();
                    var stored = clanDataFile[clanTag] || { leaders: [], coLeaders: [] };
                    var tagNoHash = clanTag.replace("#", "");
                    var tagWithHash = encodeURIComponent("#" + tagNoHash);

                    var fwaDesc =
                        getEmoji("whitefwa") + " **FWA** " + getEmoji("whitefwa") + "\n" +
                        getEmoji("fwalead") + " **Accepting:** " + getEmoji("th18") + " " + getEmoji("th17") + " " + getEmoji("th16") + " " + getEmoji("th15") + " " + getEmoji("th14") + "\n" +
                        getEmoji("ccw") + " **Clan Capital:** " + (clan.clanCapital ? clan.clanCapital.capitalHallLevel : "?") + "\n" +
                        getEmoji("clancastle") + " **Clan Level:** " + clan.clanLevel + "\n" +
                        getEmoji("cwl") + " **CWL:** Lazy Cwl\n\n" +
                        getEmoji("arrow") + " **Open in Game:** [Click Here](https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + tagNoHash + ")\n" +
                        getEmoji("coc") + " **Clash of Stats:** [Click Here](https://www.clashofstats.com/clans/" + tagNoHash + ")\n" +
                        getEmoji("arrow") + " **CC Link:** [Click Here](https://cc.fwafarm.com/cc_n/clan.php?tag=" + tagWithHash + ")\n\n" +
                        getEmoji("crown") + " **Leaders**:\n" + (stored.leaders.join("\n") || "None") + "\n" +
                        getEmoji("crown") + " **Co-Leaders**:\n" + (stored.coLeaders.join("\n") || "None") + "\n\n";

                    if (fwaDesc.length > 4096) {
                        fwaDesc = fwaDesc.slice(0, 4093) + "...";
                    }

                    var fwaEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle(clan.name + " (" + clanTag + ")")
                        .setThumbnail(clan.badgeUrls.large)
                        .setDescription(fwaDesc)
                        .setTimestamp();

                    var fwaBtnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("clan_availability_" + clanTag.replace("#", ""))
                            .setLabel("Availability")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(getEmojiObject("sheild"))
                    );

                    await interaction.editReply({ embeds: [fwaEmbed], components: [fwaBtnRow] });

                } else if (isWar) {
                    var totalWars = clan.warWins + (clan.warLosses || 0);
                    var winRatio = totalWars > 0 ? (clan.warWins / totalWars).toFixed(2) : "0.00";
                    var link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clan.tag.replace("#", "");
                    var locationStr = clan.location && clan.location.name ? "🌐 " + clan.location.name : "N/A";
                    var leaderMember = clan.memberList.find(function(m) { return m.role === "leader"; });
                    var leaderName = leaderMember ? leaderMember.name : "Unknown";

                    var warEmbed = new EmbedBuilder()
                        .setTitle(clan.name)
                        .setThumbnail(clan.badgeUrls.medium)
                        .setColor(Math.floor(Math.random() * 0xffffff))
                        .setDescription(
                            "Tag: [" + clan.tag + "](" + link + ")\n" +
                            "Trophies: " + getEmoji("throphy") + " " + clan.clanPoints + " | " + getEmoji("clancastle") + " " + (clan.clanCapitalPoints || 0) + "\n" +
                            "Required Trophies: " + getEmoji("throphy") + " " + clan.requiredTrophies + "\n" +
                            "Location: " + locationStr + "\n\n" +
                            "Leader: " + leaderName + "\n" +
                            "Level: " + clan.clanLevel + "\n" +
                            "Members: " + getEmoji("mem") + " " + clan.members + "/50\n\n" +
                            "CWL: " + (clan.warLeague ? clan.warLeague.name : "N/A") + "\n" +
                            "Wars Won: " + getEmoji("uparrow") + " " + clan.warWins + "\n" +
                            "Wars Lost: " + getEmoji("downarrow") + " " + (clan.warLosses || 0) + "\n" +
                            "War Streak: " + getEmoji("graph") + " " + clan.warWinStreak + "\n" +
                            "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
                            "Description: " + (clan.description || "No description provided.")
                        )
                        .setTimestamp();

                    var warSelectRow = buildClanSelectRow(clan, getEmojiObject, StringSelectMenuBuilder, ActionRowBuilder);
                    var warButtonRow = buildRefreshButton(clan, getEmojiObject, ButtonBuilder, ButtonStyle, ActionRowBuilder);
                    
                    warButtonRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId("clan_availability_" + clanTag.replace("#", ""))
                            .setLabel("Availability")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(getEmojiObject("sheild"))
                    );

                    await interaction.editReply({ embeds: [warEmbed], components: [warSelectRow, warButtonRow] });
                }
            } catch (err) {
                console.error(err);
                try { await interaction.editReply({ content: "❌ Error fetching clan details." }); } catch(e) {}
            }
            return;
        }

        if (id === "wclans_list_select") {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + interaction.values[0];
            
            try { await interaction.deferUpdate(); } catch(e) { return; }

            try {
                const clan = await coc.getClan(clanTag);
                
                const totalWars = clan.warWins + (clan.warLosses || 0);
                const winRatio = totalWars > 0 ? (clan.warWins / totalWars).toFixed(2) : "0.00";
                const link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clan.tag.replace("#", "");
                const locationStr = clan.location && clan.location.name ? "🌐 " + clan.location.name : "N/A";
                const leaderMember = clan.memberList.find(function(m) { return m.role === "leader"; });
                const leaderName = leaderMember ? leaderMember.name : "Unknown";

                const embed = new EmbedBuilder()
                    .setTitle(clan.name)
                    .setThumbnail(clan.badgeUrls.medium)
                    .setColor(Math.floor(Math.random() * 0xffffff))
                    .setDescription(
                        "Tag: [" + clan.tag + "](" + link + ")\n" +
                        "Trophies: " + getEmoji("throphy") + " " + clan.clanPoints + " | " + getEmoji("clancastle") + " " + (clan.clanCapitalPoints || 0) + "\n" +
                        "Required Trophies: " + getEmoji("throphy") + " " + clan.requiredTrophies + "\n" +
                        "Location: " + locationStr + "\n\n" +
                        "Leader: " + leaderName + "\n" +
                        "Level: " + clan.clanLevel + "\n" +
                        "Members: " + getEmoji("mem") + " " + clan.members + "/50\n\n" +
                        "CWL: " + (clan.warLeague ? clan.warLeague.name : "N/A") + "\n" +
                        "Wars Won: " + getEmoji("uparrow") + " " + clan.warWins + "\n" +
                        "Wars Lost: " + getEmoji("downarrow") + " " + (clan.warLosses || 0) + "\n" +
                        "War Streak: " + getEmoji("graph") + " " + clan.warWinStreak + "\n" +
                        "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
                        "Description: " + (clan.description || "No description provided.")
                    )
                    .setTimestamp();

                const selectRow = buildClanSelectRow(clan, getEmojiObject, StringSelectMenuBuilder, ActionRowBuilder);
                const buttonRow = buildRefreshButton(clan, getEmojiObject, ButtonBuilder, ButtonStyle, ActionRowBuilder);

                await interaction.editReply({ embeds: [embed], components: [selectRow, buttonRow] });
            } catch (err) {
                console.error(err);
                await interaction.followUp({ content: "❌ Error fetching details for this clan.", ephemeral: true }).catch(function() {});
            }
            return;
        }

        // ── /wwpanel clan dropdown handler ──────────────────────────────────────
        if (id === "wwpanel_clan_select") {
            if (interaction.replied || interaction.deferred) return;

            const clanTag = "#" + interaction.values[0].toUpperCase();

            try {
                await interaction.deferReply({ ephemeral: true });
            } catch (e) {
                if (e.code === 10062 || e.code === 40060) return; // Unknown Interaction / Already Acknowledged
                console.error("wwpanel defer error:", e);
                return;
            }

            try {
                const { ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
                const fwaData = require("./fwadata.js");

                let pages;
                const guild = interaction.guild || interaction.client.guilds.cache.get('1153720899715993681');
                try {
                    pages = await fwaData(clanTag, { ...context, guild });
                } catch (fetchErr) {
                    console.error("wwpanel fwadata error:", fetchErr);
                    return interaction.editReply({ content: `❌ Failed to fetch FWA weight data for \`${clanTag}\`. Check the clan tag or try again later.` });
                }

                if (!pages || pages.length === 0) {
                    return interaction.editReply({ content: `❌ No weight data found for \`${clanTag}\`.` });
                }

                let currentPage = 0;
                const leftEmoji = getEmojiObject("larrow");
                const rightEmoji = getEmojiObject("rarrow");
                const refreshEmoji = getEmojiObject("refresh");

                const getRow = (page, maxPages) => {
                    const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
                    const row = new ARB();

                    const prevBtn = new BB()
                        .setCustomId('wwpanel_prev')
                        .setStyle(BS.Primary)
                        .setDisabled(page === 0 || maxPages <= 1);
                    if (leftEmoji && leftEmoji.id) prevBtn.setEmoji({ id: leftEmoji.id, animated: leftEmoji.animated });
                    else prevBtn.setEmoji('⬅️');

                    const nextBtn = new BB()
                        .setCustomId('wwpanel_next')
                        .setStyle(BS.Primary)
                        .setDisabled(page === maxPages - 1 || maxPages <= 1);
                    if (rightEmoji && rightEmoji.id) nextBtn.setEmoji({ id: rightEmoji.id, animated: rightEmoji.animated });
                    else nextBtn.setEmoji('➡️');

                    const refreshBtn = new BB()
                        .setCustomId('wwpanel_refresh')
                        .setStyle(BS.Secondary);
                    if (refreshEmoji && refreshEmoji.id) refreshBtn.setEmoji({ id: refreshEmoji.id, animated: refreshEmoji.animated });
                    else refreshBtn.setEmoji('🔄');

                    row.addComponents(prevBtn, nextBtn, refreshBtn);
                    return row;
                };

                // Send first page as ephemeral reply
                const msg = await interaction.editReply({
                    embeds: [pages[currentPage]],
                    components: [getRow(currentPage, pages.length)]
                });

                if (!pages || pages.length === 0) return;

                // Set up button collector on the follow-up message
                const collector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    filter: (i) => (i.customId === 'wwpanel_prev' || i.customId === 'wwpanel_next' || i.customId === 'wwpanel_refresh') && i.user.id === interaction.user.id,
                    time: 30 * 60 * 1000 // 30 minutes
                });

                collector.on("collect", async (i) => {
                    try {
                        if (i.customId === 'wwpanel_refresh') {
                            try {
                                pages = await fwaData(clanTag, { ...context, guild });
                            } catch (fetchErr) {
                                console.error("wwpanel fwadata refresh error:", fetchErr);
                                return;
                            }
                            if (currentPage >= pages.length) {
                                currentPage = pages.length - 1;
                            }
                            if (currentPage < 0) currentPage = 0;
                        } else if (i.customId === 'wwpanel_next' && currentPage < pages.length - 1) {
                            currentPage++;
                        } else if (i.customId === 'wwpanel_prev' && currentPage > 0) {
                            currentPage--;
                        }
                        await i.update({
                            embeds: [pages[currentPage]],
                            components: [getRow(currentPage, pages.length)]
                        });
                    } catch (btnErr) {
                        if (btnErr.code !== 10062 && btnErr.code !== 40060) console.error("wwpanel button error:", btnErr);
                    }
                });

                collector.on("end", async () => {
                    try {
                        await interaction.editReply({ components: [] });
                    } catch {
                        // Silently ignore if message was deleted or expired
                    }
                });

            } catch (err) {
                console.error("wwpanel select error:", err);
                try {
                    await interaction.editReply({ content: "❌ Failed to load weight report. Please try again." });
                } catch {}
            }
            return;
        }
        // ── end wwpanel handler ────────────────────────────────────────────────

        if (id.startsWith("wclans_select_")) {
            if (interaction.replied || interaction.deferred) return;
            const clanTag = "#" + id.replace("wclans_select_", "");
            const selection = interaction.values[0];

            try { await interaction.deferReply({ ephemeral: true }); } catch(e) { return; }

            try {
                const clan = await coc.getClan(clanTag);
                const embed = new EmbedBuilder().setColor(Math.floor(Math.random() * 0xffffff)).setTimestamp();

                if (selection === "tags_roles") {
                    var lines = [];
                    clan.memberList.forEach(function(m, i) {
                        var roleName = m.role.replace("admin", "Elder").replace("coLeader", "Co-Leader");
                        lines.push("`" + (i + 1) + ".` **" + m.name + "**\n╰ `" + m.tag + "` | " + roleName);
                    });
                    var membersStr = lines.join("\n");
                    var desc = membersStr.length > 4000 ? membersStr.substring(0, 4000) + "..." : membersStr;
                    embed.setTitle(getEmoji("mem") + " " + clan.name + " - Player Tags & Roles")
                         .setDescription(desc || "No members found.");
                } 
                else if (selection === "trophies_league") {
                    var lines = [];
                    clan.memberList.forEach(function(m, i) {
                        var leagueName = m.league ? m.league.name : "No League";
                        lines.push("`" + (i + 1) + ".` **" + m.name + "**\n╰ " + getEmoji("throphy") + " " + m.trophies + " | " + leagueName);
                    });
                    var membersStr = lines.join("\n");
                    var desc = membersStr.length > 4000 ? membersStr.substring(0, 4000) + "..." : membersStr;
                    embed.setTitle(getEmoji("throphy") + " " + clan.name + " - Trophies & League")
                         .setDescription(desc || "No members found.");
                }
                else if (selection === "joining") {
                    var sortedMembers = clan.memberList.slice().sort(function(a, b) {
                        var aNew = (a.donations === 0 && a.donationsReceived === 0);
                        var bNew = (b.donations === 0 && b.donationsReceived === 0);
                        if (aNew && !bNew) return -1;
                        if (!aNew && bNew) return 1;
                        return 0;
                    });

                    var lines = [];
                    sortedMembers.forEach(function(m, i) {
                        var isNew = (m.donations === 0 && m.donationsReceived === 0);
                        var status = isNew ? "🆕 New Joined" : "✅ Active Member";
                        lines.push("`" + (i + 1) + ".` **" + m.name + "**\n╰ " + status + " | Tags: `" + m.tag + "`");
                    });
                    var membersStr = lines.join("\n");
                    var desc = membersStr.length > 4000 ? membersStr.substring(0, 4000) + "..." : membersStr;
                    embed.setTitle(getEmoji("alaram") + " " + clan.name + " - Last Joining Date")
                         .setDescription(desc || "No members found.");
                }
                else if (selection === "progress") {
                    var lines = [];
                    clan.memberList.forEach(function(m, i) {
                        lines.push("`" + (i + 1) + ".` **" + m.name + "**\n╰ Level: " + m.expLevel + " | TH: " + m.townHallLevel + " | " + getEmoji("drop") + " " + m.donations);
                    });
                    var membersStr = lines.join("\n");
                    var desc = membersStr.length > 4000 ? membersStr.substring(0, 4000) + "..." : membersStr;
                    embed.setTitle(getEmoji("graph") + " " + clan.name + " - Player Progress")
                         .setDescription(desc || "No members found.");
                }
                else if (selection === "attacks_defenses") {
                    var lines = [];
                    clan.memberList.forEach(function(m, i) {
                        lines.push("`" + (i + 1) + ".` **" + m.name + "**\n╰ Attacks Won: `" + (m.attacks || 0) + "` | Defenses Won: `" + (m.defenses || 0) + "`");
                    });
                    var membersStr = lines.join("\n");
                    var desc = membersStr.length > 4000 ? membersStr.substring(0, 4000) + "..." : membersStr;
                    embed.setTitle(getEmoji("cocfight") + " " + clan.name + " - Attacks & Defenses")
                         .setDescription(desc || "No members found.");
                }
                else if (selection === "warlog") {
                    try {
                        const data = await coc.getWarLog(clanTag);
                        const logs = data.items || [];
                        var logText = "";
                        logs.slice(0, 10).forEach(function(log) {
                            var result;
                            if (log.result === "win") {
                                result = getEmoji("gtick") + " Win";
                            } else if (log.result === "lose") {
                                result = getEmoji("tickred") + " Loss";
                            } else {
                                result = "⚖️ Tie";
                            }
                            var opponentName = log.opponent ? log.opponent.name : "Unknown Opponent";
                            var opponentTag = log.opponent ? log.opponent.tag : "";
                            logText += "**" + result + "** vs " + opponentName + " (" + opponentTag + ")\n" +
                                       getEmoji("bluestar") + " " + log.clan.stars + " - " + log.opponent.stars + " | " + getEmoji("sheild") + " " + log.clan.destructionPercentage.toFixed(1) + "% - " + log.opponent.destructionPercentage.toFixed(1) + "%\n\n";
                        });
                        embed.setTitle(getEmoji("cwl") + " " + clan.name + " - War History").setDescription(logText || "War log is private or empty.");
                    } catch (e) {
                        embed.setTitle(getEmoji("cwl") + " " + clan.name + " - War History").setDescription("❌ Could not fetch war log. It might be private.");
                    }
                }

                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: "❌ Error fetching details for this clan." });
            }
            return;
        }
    }

    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === "war_weight_modal") {
            const weightStr = interaction.fields.getTextInputValue('weight_input');
            const weight = parseInt(weightStr.replace(/,/g, '').trim(), 10);

            if (isNaN(weight)) {
                return interaction.reply({ content: "⚠️ Invalid number entered. Please enter a valid number.", ephemeral: true });
            }

            const total = weight * 5;
            const resEmbed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle("War Weight Calculation")
                .setDescription(`**Entered Weight:** ${weightStr}\n**Total War Weight:** ${total.toLocaleString()}`);

            return interaction.reply({ embeds: [resEmbed], ephemeral: true });
        }

        if (id.startsWith("delete_user_modal:")) {
            const userId = id.split(":")[1];
            const deleteCmd = require("../commands/discord/channel/delete.js");
            return deleteCmd.handleModalSubmit(interaction, context, userId);
        }

        if (id.startsWith("wwtrack_edit_modal:")) {
            const parts = id.split(":");
            const clanTag = parts[1];
            const oldPlayerTag = parts[2];
            const wwTrackCmd = require("../commands/coc/war/ww-tracklist.js");
            return wwTrackCmd.handleModalSubmit(interaction, context, clanTag, oldPlayerTag);
        }

        if (id.startsWith("cwl_clan_modal_") || id.startsWith("cwl_clan_modal_update:")) {
            const cwlClanCmd = require("../commands/coc/clan/cwl-clan.js");
            return cwlClanCmd.handleModalSubmit(interaction, context);
        }
    }

    return false;
}

function buildClanSelectRow(clan, getEmojiObject, StringSelectMenuBuilder, ActionRowBuilder) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("wclans_select_" + clan.tag.replace("#", ""))
            .setPlaceholder("Select to see more details...")
            .addOptions([
                { label: "Player Tags & Roles", description: "View player tags and clan roles", value: "tags_roles", emoji: getEmojiObject("mem") },
                { label: "Trophies & League", description: "View current trophies and leagues", value: "trophies_league", emoji: getEmojiObject("throphy") },
                { label: "Last Joining Date", description: "View when members joined the clan", value: "joining", emoji: getEmojiObject("alaram") },
                { label: "Player Progress", description: "View player levels and progress", value: "progress", emoji: getEmojiObject("graph") },
                { label: "Attacks & Defenses", description: "View combat statistics", value: "attacks_defenses", emoji: getEmojiObject("cocfight") },
                { label: "War History", description: "View recent clan war logs", value: "warlog", emoji: getEmojiObject("cwl") }
            ])
    );
}

function buildRefreshButton(clan, getEmojiObject, ButtonBuilder, ButtonStyle, ActionRowBuilder) {
    var refreshEmoji = getEmojiObject("refresh");
    var btn = new ButtonBuilder()
        .setCustomId("wclans_refresh_war_" + clan.tag.replace("#", ""))
        .setLabel("Refresh Data")
        .setStyle(ButtonStyle.Secondary);

    if (refreshEmoji) {
        btn.setEmoji(refreshEmoji);
    } else {
        btn.setEmoji("🔄");
    }

    return new ActionRowBuilder().addComponents(btn);
}


module.exports = { handleInteraction };
