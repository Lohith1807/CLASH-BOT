const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

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
        
        const { config, data, coc, emoji } = context;
        const { getEmoji } = emoji;
        const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
        const REAPPLY_ROLE_ID = "1523186839509401701"; // fallback if not in config
        const TARGET_CHANNEL_ID = "1523186791950323824"; // fallback if not in config

        const errorEmbed = (desc) => new EmbedBuilder().setColor("Red").setDescription(`${getEmoji("bluex")} ${desc}`);
        const loadingEmbed = (desc) => new EmbedBuilder().setColor("Blue").setDescription(`**${desc}**\n\`\`\`ansi\n\u001b[30m[▱▱▱▱▱]\u001b[0m\n\`\`\``);
        const successEmbed = (desc) => new EmbedBuilder().setColor("Green").setDescription(`${getEmoji("gtick")} ${desc}`);

        // Permission check
        const allowedRoleNames = ['all leaders', 'executive staff', 'server mod', 't-mod', 'admin', 'moderator'];
        const memberRoles = source.member?.roles?.cache || new Map();
        
        const hasConfigRole = 
            memberRoles.has(config.ALL_LEAD_ROLE_ID) || 
            (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) ||
            (config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => memberRoles.has(id)));

        const hasNameRole = typeof memberRoles.some === 'function' ? memberRoles.some(r => allowedRoleNames.some(allowed => r.name.toLowerCase().includes(allowed))) : false;
        const hasPerms = source.member?.permissions?.has(PermissionFlagsBits.ManageRoles);
        const executorUser = isInteraction ? source.user : source.author;

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

        if (!hasConfigRole && !hasNameRole && !hasPerms && executorUser.id !== source.guild.ownerId) {
            return safeReply({ embeds: [errorEmbed("You do not have the required roles to use this command.")], ephemeral: true });
        }

        let member = null;

        if (isInteraction) {
            member = source.options.getMember('member');
        } else {
            if (!args[0]) {
                return safeReply({ embeds: [errorEmbed("Please mention a member or provide their ID.")], ephemeral: true });
            }
            const targetId = args[0].replace(/[<@!>]/g, "");
            member = source.guild.members.cache.get(targetId);
        }
        
        if (!member) {
            return safeReply({ embeds: [errorEmbed("Could not resolve the selected member.")], ephemeral: true });
        }

        if (member.user.bot) {
            return safeReply({ embeds: [errorEmbed("Bots cannot be processed.")], ephemeral: true });
        }

        const targetChannel = source.guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!targetChannel) {
            return safeReply({ embeds: [errorEmbed("Target channel not found. Check CHANNEL ID.")], ephemeral: true });
        }

        await safeDeferReply();

        // Fetch user data
        const userData = data.getUserData();
        const userAccounts = userData[member.id] || [];
        
        if (userAccounts.length === 0) {
            return safeEditReply({ embeds: [errorEmbed("This user has no linked Clash accounts.")] });
        }

        const clanRoles = data.getClanRoles();
        const monitoredClans = {};
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId) {
                monitoredClans[tag.toUpperCase()] = { ...info, tag: tag.toUpperCase() };
            }
        }
        
        const userClanRolesHeld = [];
        for (const [tag, info] of Object.entries(monitoredClans)) {
            if (member.roles.cache.has(info.roleId)) {
                userClanRolesHeld.push(info);
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
            if (p.clan) {
                const cTag = p.clan.tag.toUpperCase();
                if (monitoredClans[cTag]) {
                    clansStillIn.push(monitoredClans[cTag]);
                }
            }
        }

        for (const roleInfo of userClanRolesHeld) {
            const isStillInClan = clansStillIn.some(c => c.tag === roleInfo.tag);
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
                    await i.reply({ content: `${getEmoji("bluex")} You cannot use this menu.`, ephemeral: true }).catch(() => {});
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
            const thEmoji = emoji.getEmoji(`th${player.townHallLevel}`) || emoji.getEmoji('th8') || "👑";
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
                    await i.reply({ content: `${getEmoji("bluex")} You cannot interact with this.`, ephemeral: true }).catch(() => {});
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
                    
                    await submitted.deferUpdate().catch(console.error);
                    
                    executeLeaveLogic(submitted, reason);
                } catch (err) {
                    if (err.code !== "InteractionCollectorError") {
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
            if (selectedPlayer && selectedPlayer.clan) {
                const cTag = selectedPlayer.clan.tag.toUpperCase();
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
            const otherClansStillIn = clansStillIn.filter(c => !rolesToRemove.some(r => r.tag === c.tag));

            // Save the reason first
            const clanNamesStr = rolesToRemove.map(c => c.nickName || c.tag).join(", ");
            const reasonsData = data.getReapplyReasons();
            if (!reasonsData[member.id]) reasonsData[member.id] = [];
            
            reasonsData[member.id].push({
                reason: reason,
                timestamp: Math.floor(Date.now() / 1000),
                addedBy: executorUser.id,
                clanName: clanNamesStr,
                status: "ADDED"
            });
            data.saveReapplyReasons(reasonsData);

            // Action time
            if (otherClansStillIn.length > 0) {
                // Rule 2: User has another ID still inside any clan
                for (const leftClan of rolesToRemove) {
                    await member.roles.remove(leftClan.roleId).catch(() => null);
                    if (leftClan.leaderRoleId) {
                        await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
                    }
                }
                
                // Update nickname for remaining clans
                const clanRolesList = data.getClanRoles();
                const clanNicks = [];
                for (const [tag, info] of Object.entries(clanRolesList)) {
                    if (info.roleId && member.roles.cache.has(info.roleId) && !rolesToRemove.some(r => r.roleId === info.roleId)) {
                        if (info.nickName && !clanNicks.includes(info.nickName)) {
                            clanNicks.push(info.nickName);
                        }
                    }
                }
                
                const clanNickStr = clanNicks.join(' • ');
                let currentNick = member.nickname || member.user.username;
                let playerName = currentNick;
                if (currentNick.includes("|")) {
                    const parts = currentNick.split("|");
                    playerName = parts[1].split('•')[0].trim();
                } else if (validPlayers.length > 0) {
                    playerName = validPlayers[0].name;
                }

                let newNickname = clanNickStr 
                    ? `BLOOD | ${playerName} • ${clanNickStr}` 
                    : `BLOOD | ${playerName}`;

                if (newNickname.length > 32) {
                    newNickname = newNickname.substring(0, 32);
                }

                await member.setNickname(newNickname).catch(() => null);
                
                const currentEmbed = (await safeFetchReply()).embeds[0];
                const updatedEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor("Orange")
                    .setDescription(
                        currentEmbed.description +
                        `\n\n**${getEmoji("alaram")} Action Completed:**\n` +
                        `Removed role(s) for **${clanNamesStr}** because an account left.\n` +
                        `*They still have accounts in other clans, so Re-Apply role was NOT given.*`
                    );

                return safeEditReply({ 
                    embeds: [updatedEmbed],
                    components: []
                }).catch(console.error);
            } else {
                // Rule 3/4: All IDs have left all clans
                for (const leftClan of rolesToRemove) {
                    await member.roles.remove(leftClan.roleId).catch(() => null);
                    if (leftClan.leaderRoleId) {
                        await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
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
                
                // Change nickname format
                let mainIdName = "Unknown";
                const currentNick = member.nickname || member.user.username;
                if (currentNick.includes("|")) {
                    const parts = currentNick.split("|");
                    mainIdName = parts[1].split("•")[0].trim();
                } else if (validPlayers.length > 0) {
                    mainIdName = validPlayers[0].name;
                } else if (userAccounts.length > 0) {
                    mainIdName = userAccounts[0].name;
                } else {
                    mainIdName = currentNick;
                }
                
                let clanPrefix = clansLeft.map(c => (c.nickName || c.tag)).join(" • ");
                const separator = " • BLOOD | ";
                let maxNameLen = 32 - clanPrefix.length - separator.length;
                
                if (maxNameLen <= 0) {
                    clanPrefix = clanPrefix.substring(0, 32 - separator.length - 1).trim();
                    maxNameLen = 1;
                }
                
                if (mainIdName.length > maxNameLen) {
                    mainIdName = mainIdName.substring(0, maxNameLen).trim();
                }
                
                const newNick = `${clanPrefix}${separator}${mainIdName}`;
                
                let nickSuccess = true;
                await member.setNickname(newNick).catch(err => {
                    console.error("Failed to change nickname:", err);
                    nickSuccess = false;
                });

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
                
                const nickNote = nickSuccess ? `\`${newNick}\`` : "*(Failed to change, missing permissions)*";
                
                const currentEmbed = (await safeFetchReply()).embeds[0];
                let descText = currentEmbed.description +
                    `\n\n**${getEmoji("gtick")} Completed Re-Apply for ${member.user.tag}**\n` +
                    `${getEmoji("rarroww")} **Removed clan roles:** ${clanPrefix}\n`;
                
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
