const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle , MessageFlags } = require("discord.js");
const { checkPermission } = require("../../../utils/checkPermission.js");
const { isStaffMember, extractCleanPlayerName } = require("../../../utils/reapplyHelper.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reapply')
        .setDescription('Process clan leave and assign re-apply roles for a member')
        .addUserOption(option => 
            option.setName('member')
                .setDescription('The member to process')
                .setRequired(true)),

    async execute(source, arg2, arg3) {
        try {
            const isInteraction = arg3 === undefined;
        const context = isInteraction ? arg2 : arg3;
        const args = isInteraction ? [] : arg2;
        const executorUser = isInteraction ? source.user : (source.author || source.user);
        
        const { config, data, coc, emoji } = context;
        const { getEmoji } = emoji;
        const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
        const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || process.env.REAPPLY_ROLE_ID || "1523186839509401701";
        const TARGET_CHANNEL_ID = config.REAPPLY_CHANNEL_ID || process.env.REAPPLY_CHANNEL_ID || "1523186791950323824";

        const errorEmbed = (desc) => new EmbedBuilder().setColor("Red").setDescription(`${getEmoji("bluex")} ${desc}`);
        const loadingEmbed = (desc) => new EmbedBuilder().setColor("Blue").setDescription(`**${desc}**\n\`\`\`ansi\n\u001b[30m[▱▱▱▱▱]\u001b[0m\n\`\`\``);
        const successEmbed = (desc) => new EmbedBuilder().setColor("Green").setDescription(`${getEmoji("gtick")} ${desc}`);

        let loadingMsg = null;
        const safeReply = async (opts) => {
            if (isInteraction) return source.reply(opts);
            return source.reply(opts);
        };
        const safeDeferReply = async () => {
            if (isInteraction) return source.deferReply();
            loadingMsg = await source.reply({ embeds: [loadingEmbed("Processing...")] });
        };
        const safeEditReply = async (opts) => {
            if (isInteraction) return source.editReply(opts);
            if (loadingMsg) return loadingMsg.edit(opts);
            return source.reply(opts);
        };
        const safeFetchReply = async () => {
            if (isInteraction) return source.fetchReply();
            return loadingMsg;
        };

        if (!checkPermission('reapply', source)) {
            return safeReply({ embeds: [errorEmbed("You do not have the required roles to use this command.")], flags: [MessageFlags.Ephemeral] });
        }

        let member = null;

        if (isInteraction) {
            member = source.options.getMember('member');
        } else {
            if (!args[0]) {
                return safeReply({ embeds: [errorEmbed("Please mention a member or provide their ID.")], flags: [MessageFlags.Ephemeral] });
            }
            const targetId = args[0].replace(/[<@!>]/g, "");
            member = source.guild.members.cache.get(targetId);
        }
        
        if (!member) {
            return safeReply({ embeds: [errorEmbed("Could not resolve the selected member.")], flags: [MessageFlags.Ephemeral] });
        }

        if (member.user.bot) {
            return safeReply({ embeds: [errorEmbed("Bots cannot be processed.")], flags: [MessageFlags.Ephemeral] });
        }

        const targetChannel = source.guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!targetChannel) {
            return safeReply({ embeds: [errorEmbed("Target channel not found. Check CHANNEL ID.")], flags: [MessageFlags.Ephemeral] });
        }

        await safeDeferReply();

        // Fetch user data
        const userData = data.getUserData();
        const userAccounts = userData[member.id] || [];
        
        if (userAccounts.length === 0) {
            return safeEditReply({ embeds: [errorEmbed("This user has no linked Clash accounts.")] });
        }

        const cleanTag = t => (t || "").replace(/^#/, "").toUpperCase();

        const clanRoles = data.getClanRoles();
        const monitoredClans = {};
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId) {
                monitoredClans[cleanTag(tag)] = { ...info, tag: tag.toUpperCase(), rawTag: tag };
                monitoredClans[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase(), rawTag: tag };
            }
        }
        
        const userClanRolesHeld = [];
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId && member.roles.cache.has(info.roleId)) {
                if (!userClanRolesHeld.some(r => r.roleId === info.roleId)) {
                    userClanRolesHeld.push({ ...info, tag: tag.toUpperCase() });
                }
            }
        }

        if (userClanRolesHeld.length === 0) {
            return safeEditReply({ embeds: [errorEmbed("This user does not currently hold any clan roles.")] });
        }

        await safeEditReply({ embeds: [loadingEmbed("Fetching live data for all accounts...")] });

        // Fetch live player data for user's accounts
        const validPlayers = [];
        for (const acc of userAccounts) {
            try {
                const p = await coc.getPlayer(acc.tag);
                if (p) validPlayers.push({ ...p, linkedName: acc.name });
            } catch (err) {
                console.error(`Failed to fetch player ${acc.tag}:`, err.message);
            }
        }

        // Compare live API data against discord roles to find which clans they actually left
        const clansStillIn = [];
        const clansLeft = [];
        
        for (const p of validPlayers) {
            if (p.clan && p.clan.tag) {
                const cTag = cleanTag(p.clan.tag);
                if (monitoredClans[cTag]) {
                    const clanObj = monitoredClans[cTag];
                    if (!clansStillIn.some(c => cleanTag(c.tag) === cleanTag(clanObj.tag) || (c.roleId && clanObj.roleId && c.roleId === clanObj.roleId))) {
                        clansStillIn.push(clanObj);
                    }
                }
            }
        }

        for (const roleInfo of userClanRolesHeld) {
            const isStillInClan = clansStillIn.some(c => 
                (c.roleId && c.roleId === roleInfo.roleId) || 
                cleanTag(c.tag) === cleanTag(roleInfo.tag)
            );
            if (!isStillInClan) {
                clansLeft.push(roleInfo);
            }
        }

        // We will determine which roles to remove in executeLeaveLogic based on the selectedPlayer
        let selectedPlayer = null;

        if (validPlayers.length === 1) {
            selectedPlayer = validPlayers[0];
            promptConfirmation(selectedPlayer);
        } else {
            // Multiple accounts: show dropdown
            const options = [];
            for (const p of validPlayers) {
                const cName = p.clan ? p.clan.name : "None";
                options.push({
                    label: `${p.name} (${p.tag})`,
                    description: `Clan: ${cName}`,
                    value: p.tag
                });
            }
            
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select_reapply_account")
                    .setPlaceholder("Select an account to process leave")
                    .addOptions(options)
            );
            
            const message = await safeEditReply({
                embeds: [new EmbedBuilder().setColor("Blue").setDescription(`${getEmoji("rarrow")} **${member.user.username}** has multiple accounts. Select one to process.`)]
                , components: [row]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.customId === "select_reapply_account",
                time: 60000
            });

            collector.on("collect", async (i) => {
                if (i.user.id !== executorUser.id) {
                    await i.reply({ content: `${getEmoji("bluex")} You cannot use this menu.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                    return;
                }
                await i.deferUpdate().catch(() => {});
                collector.stop("selected");
                selectedPlayer = validPlayers.find(p => p.tag === i.values[0]);
                promptConfirmation(selectedPlayer);
            });

            collector.on("end", (collected, reason) => {
                if (reason !== "selected") {
                    safeEditReply({ embeds: [errorEmbed("Selection timed out.")], components: [] }).catch(() => {});
                }
            });
        }

        async function promptConfirmation(player) {
            const clanName = player.clan ? player.clan.name : "None";
            const thEmoji = emoji.getThEmoji ? emoji.getThEmoji(player.townHallLevel, "👑") : (emoji.getEmoji(`th${player.townHallLevel}`) || "👑");
            const leagueName = player.leagueTier?.name || player.league?.name || "Unranked";
            const leagueEmoji = emoji.getLeagueEmoji(leagueName, "throphy");
            const bluedot = emoji.getEmoji("bluedot") || "🔹";
            const arrow = emoji.getEmoji("arrow") || "➡️";
            
            const gameLink = `https://link.clashofclans.com/en/?action=OpenPlayerProfile&tag=${encodeURIComponent(player.tag)}`;
            const fwaLink = `https://cc.fwafarm.com/cc_n/member.php?tag=${encodeURIComponent(player.tag)}`;

            const confirmEmbed = new EmbedBuilder()
                .setColor("Orange")
                .setDescription(
                    `**═══ Selected Account ═══**\n` +
                    `${thEmoji} **${player.name} • ${player.tag}**\n` +
                    `${bluedot} **Clan:** ${clanName}\n` +
                    `${bluedot} **League:** ${leagueName} ${leagueEmoji}\n\n` +
                    `${arrow} [Open in Game](${gameLink})\n` +
                    `${arrow} [FWA CC](${fwaLink})\n\n` +
                    `Are you sure you want to process the leave for this user?`
                );

            const verifyBtn = new ButtonBuilder()
                .setCustomId("confirm_reapply")
                .setEmoji("1410137697300775026") // tick
                .setStyle(ButtonStyle.Success);
            
            const cancelBtn = new ButtonBuilder()
                .setCustomId("cancel_reapply")
                .setEmoji("1532793683559186613") // gwrong
                .setStyle(ButtonStyle.Danger);
                
            const row = new ActionRowBuilder().addComponents(verifyBtn, cancelBtn);

            const message = await safeEditReply({ embeds: [confirmEmbed], components: [row] });

            const collector = message.createMessageComponentCollector({
                filter: i => i.customId === "confirm_reapply" || i.customId === "cancel_reapply",
                time: 300000 // 5 minutes
            });

            collector.on("collect", async (i) => {
                if (i.user.id !== executorUser.id) {
                    await i.reply({ content: `${getEmoji("bluex")} You cannot interact with this.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                    return;
                }
                
                if (i.customId === "cancel_reapply") {
                    await i.deferUpdate().catch(console.error);
                    collector.stop("cancelled");
                    safeEditReply({ embeds: [errorEmbed("Re-Application process cancelled.")], components: [] }).catch(console.error);
                    return;
                }

                // If confirmed, popup the modal for reason
                const modal = new ModalBuilder()
                    .setCustomId('reapply_reason_modal')
                    .setTitle('Reason for Re-Applying');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('reason_input')
                    .setLabel('Why is the user reapplying?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
                modal.addComponents(firstActionRow);

                await i.showModal(modal).catch(console.error);
                
                try {
                    const submitted = await i.awaitModalSubmit({
                        filter: mi => mi.customId === 'reapply_reason_modal' && mi.user.id === executorUser.id,
                        time: 300000 // 5 mins to fill form
                    });
                    
                    const reason = submitted.fields.getTextInputValue('reason_input');
                    collector.stop("confirmed");
                    
                    if (!submitted.replied && !submitted.deferred) {
                        await submitted.deferUpdate().catch(() => {});
                    }
                    
                    executeLeaveLogic(submitted, reason);
                } catch (err) {
                    if (err.code !== "InteractionCollectorError" && err.code !== 10062 && !err.message?.includes('reason: time')) {
                        console.error("Modal submission error:", err);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason !== "confirmed" && reason !== "cancelled") {
                    safeEditReply({ embeds: [errorEmbed("Confirmation timed out after 5 minutes.")], components: [] }).catch(() => {});
                }
            });
        }

        async function executeLeaveLogic(i, reason) {
            let rolesToRemove = [];
            
            // If the user explicitly selected a player and the API shows them still in a clan, 
            // they are forcefully removing the role for THAT specific clan (API cache fallback).
            if (selectedPlayer && selectedPlayer.clan && selectedPlayer.clan.tag) {
                const cTag = cleanTag(selectedPlayer.clan.tag);
                if (monitoredClans[cTag]) {
                    rolesToRemove.push(monitoredClans[cTag]);
                }
            }
            
            // If the above didn't match (e.g. they already left in-game so selectedPlayer.clan is null)
            // Fallback to removing what the API detects they left
            if (rolesToRemove.length === 0) {
                rolesToRemove = clansLeft;
            }

            if (rolesToRemove.length === 0) {
                return safeEditReply({ embeds: [errorEmbed("Could not determine which clan role to remove. The API shows they haven't left, and their selected account isn't in a monitored clan.")] }).catch(() => {});
            }

            // Determine if they still have OTHER accounts in family clans
            // We consider them "still in" if clansStillIn has elements, 
            // EXCEPT we must exclude the clan they are forcefully leaving from this count.
            const otherClansStillIn = clansStillIn.filter(c => 
                !rolesToRemove.some(r => 
                    (r.roleId && c.roleId && r.roleId === c.roleId) || 
                    cleanTag(r.tag) === cleanTag(c.tag)
                )
            );

            // Save the reason first
            const clanNamesStr = rolesToRemove.map(c => c.nickName || cleanTag(c.tag)).join(", ");
            const reasonsData = data.getReapplyReasons();
            if (!reasonsData[member.id]) reasonsData[member.id] = [];
            
            const accName = selectedPlayer?.name || selectedPlayer?.linkedName || (validPlayers[0] && (validPlayers[0].name || validPlayers[0].linkedName)) || (userAccounts[0] && userAccounts[0].name) || "Unknown";
            const accTag = selectedPlayer?.tag || (validPlayers[0] && validPlayers[0].tag) || (userAccounts[0] && userAccounts[0].tag) || "";

            reasonsData[member.id].push({
                reason: reason,
                timestamp: Math.floor(Date.now() / 1000),
                addedBy: executorUser.id,
                clanName: clanNamesStr,
                status: "ADDED",
                accountName: accName,
                accountTag: accTag
            });
            data.saveReapplyReasons(reasonsData);

            const isStaff = isStaffMember(member, config);

            // Action time
            if (otherClansStillIn.length > 0) {
                // Rule 2: User has another ID still inside any clan
                for (const leftClan of rolesToRemove) {
                    if (leftClan.roleId && member.roles.cache.has(leftClan.roleId)) {
                        await member.roles.remove(leftClan.roleId).catch(() => null);
                    }
                    if (leftClan.leaderRoleId && member.roles.cache.has(leftClan.leaderRoleId)) {
                        await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
                    }
                }
                // Automatically remove from /clan-members data for the leaving clan
                if (data && typeof data.removeClanMember === "function") {
                    for (const leftClan of rolesToRemove) {
                        if (accTag) data.removeClanMember(leftClan.tag, accTag);
                    }
                }
                
                // Update nickname for remaining clans
                const clanRolesList = data.getClanRoles();
                const remainingClanNicks = [];
                for (const c of otherClansStillIn) {
                    if (c.nickName && !remainingClanNicks.includes(c.nickName)) {
                        remainingClanNicks.push(c.nickName);
                    }
                }
                for (const [tag, info] of Object.entries(clanRolesList)) {
                    const isRemoved = rolesToRemove.some(r => 
                        (r.roleId && info.roleId && r.roleId === info.roleId) || 
                        cleanTag(r.tag) === cleanTag(tag)
                    );
                    if (info.roleId && member.roles.cache.has(info.roleId) && !isRemoved) {
                        if (info.nickName && !remainingClanNicks.includes(info.nickName)) {
                            remainingClanNicks.push(info.nickName);
                        }
                    }
                }
                const leavingNicknames = rolesToRemove.map(r => (r.nickName || "").toUpperCase()).filter(Boolean);
                const finalClanNicks = remainingClanNicks.filter(n => !leavingNicknames.includes(n.toUpperCase()));
                
                let nickNote = "*(Skipped: Staff member)*";
                if (!isStaff) {
                    const cleanPlayerName = extractCleanPlayerName(member, validPlayers, userAccounts, clanRolesList);
                    const clanNickStr = finalClanNicks.join(' • ');
                    let newNickname = clanNickStr 
                        ? `BLOOD | ${cleanPlayerName} • ${clanNickStr}` 
                        : `BLOOD | ${cleanPlayerName}`;

                    if (newNickname.length > 32) {
                        newNickname = newNickname.substring(0, 32);
                    }

                    let nickSuccess = true;
                    await member.setNickname(newNickname).catch(err => {
                        console.error("Failed to set nickname:", err);
                        nickSuccess = false;
                    });
                    nickNote = nickSuccess ? `\`${newNickname}\`` : "*(Failed to change, missing permissions)*";
                }
                
                const currentEmbed = (await safeFetchReply()).embeds[0];
                const updatedEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor("Orange")
                    .setDescription(
                        currentEmbed.description +
                        `\n\n**${getEmoji("alaram")} Action Completed:**\n` +
                        `Removed role(s) for **${clanNamesStr}** because an account left.\n` +
                        `*They still have accounts in other clans, so Re-Apply role was NOT given.*\n` +
                        `${getEmoji("parrow")} **Nickname:** ${nickNote}`
                    );

                return safeEditReply({ 
                    embeds: [updatedEmbed],
                    components: []
                }).catch(console.error);
            } else {
                // Rule 3/4: All IDs have left all clans
                for (const leftClan of rolesToRemove) {
                    if (leftClan.roleId && member.roles.cache.has(leftClan.roleId)) {
                        await member.roles.remove(leftClan.roleId).catch(() => null);
                    }
                    if (leftClan.leaderRoleId && member.roles.cache.has(leftClan.leaderRoleId)) {
                        await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
                    }
                }
                
                // Also remove any remaining clan roles held by this member
                for (const [tag, info] of Object.entries(monitoredClans)) {
                    if (info.roleId && member.roles.cache.has(info.roleId)) {
                        await member.roles.remove(info.roleId).catch(() => null);
                    }
                    if (info.leaderRoleId && member.roles.cache.has(info.leaderRoleId)) {
                        await member.roles.remove(info.leaderRoleId).catch(() => null);
                    }
                }

                // Automatically remove from /clan-members data for all left clans / accounts
                if (data && typeof data.removeClanMember === "function") {
                    if (accTag) data.removeClanMember(null, accTag);
                    if (Array.isArray(userAccounts)) {
                        for (const acc of userAccounts) {
                            if (acc.tag) data.removeClanMember(null, acc.tag);
                        }
                    }
                }

                const FAMILY_ROLE_ID = config.FAMILY_ROLE_ID || "1528073821343584387";
                let familyRoleRemoved = false;
                if (member.roles.cache.has(FAMILY_ROLE_ID)) {
                    await member.roles.remove(FAMILY_ROLE_ID).catch(() => null);
                    familyRoleRemoved = true;
                }
                
                if (GLOBAL_ROLE_ID && !member.roles.cache.has(GLOBAL_ROLE_ID)) {
                    await member.roles.add(GLOBAL_ROLE_ID).catch(() => null);
                }
                
                if (!member.roles.cache.has(REAPPLY_ROLE_ID)) {
                    await member.roles.add(REAPPLY_ROLE_ID).catch(() => null);
                }
                
                let nickNote = "*(Skipped: Staff member)*";
                if (!isStaff) {
                    const clanRolesList = data.getClanRoles();
                    const cleanPlayerName = extractCleanPlayerName(member, validPlayers, userAccounts, clanRolesList);

                    let clanPrefix = clansLeft.map(c => (c.nickName || cleanTag(c.tag))).filter(Boolean).join(" • ");
                    if (!clanPrefix) {
                        clanPrefix = rolesToRemove.map(c => (c.nickName || cleanTag(c.tag))).filter(Boolean).join(" • ") || "BLOOD";
                    }

                    const separator = " • BLOOD | ";
                    let maxNameLen = 32 - clanPrefix.length - separator.length;
                    
                    if (maxNameLen <= 0) {
                        clanPrefix = clanPrefix.substring(0, 32 - separator.length - 1).trim();
                        maxNameLen = 1;
                    }
                    
                    let finalPlayerName = cleanPlayerName;
                    if (finalPlayerName.length > maxNameLen) {
                        finalPlayerName = finalPlayerName.substring(0, maxNameLen).trim();
                    }
                    
                    const newNick = `${clanPrefix}${separator}${finalPlayerName}`;
                    
                    let nickSuccess = true;
                    await member.setNickname(newNick).catch(err => {
                        console.error("Failed to change nickname:", err);
                        nickSuccess = false;
                    });

                    nickNote = nickSuccess ? `\`${newNick}\`` : "*(Failed to change, missing permissions)*";
                }

                const bluedot = emoji.getEmoji("bluedot") || "🔹";
                const embed = new EmbedBuilder()
                    .setColor(0x00FFFF) // Cyan color matching the image
                    .setDescription(
                        `This is <#${targetChannel.id}> room. You're here because:\n\n` +
                        `${bluedot} **Reason:** ${reason}\n\n` +
                        `${bluedot} Please Open a ticket if you are intrested again to continue with us.`
                    )
                    .setFooter({ text: `Done by ${executorUser.tag} | 💎 Blood Alliance` });

                await targetChannel.send({
                    content: `Hey <@${member.id}>`,
                    embeds: [embed]
                }).catch(() => null);
                
                const currentEmbed = (await safeFetchReply()).embeds[0];
                let descText = currentEmbed.description +
                    `\n\n**${getEmoji("gtick")} Completed Re-Apply for ${member.user.tag}**\n` +
                    `${getEmoji("rarroww")} **Removed clan roles:** ${clanNamesStr}\n`;
                
                if (familyRoleRemoved) {
                    descText += `${getEmoji("rarroww")} **Removed Family role**\n`;
                }

                descText += `${getEmoji("yarrow")} **Added Re-Apply role**\n` +
                    `${getEmoji("parrow")} **Changed nickname to:** ${nickNote}`;

                const updatedEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor("Green")
                    .setDescription(descText);

                return safeEditReply({ embeds: [updatedEmbed], components: [] }).catch(console.error);
            }
        }
        } catch (err) {
            console.error("Error in reapply.js execute:", err);
            try {
                if (typeof source.reply === "function") {
                    await source.reply(`An error occurred: ${err.message}`);
                }
            } catch (e) {}
        }
    }
};
