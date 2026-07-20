const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reapply')
        .setDescription('Process clan leave and assign re-apply roles for a member')
        .addUserOption(option => 
            option.setName('member')
                .setDescription('The member to process')
                .setRequired(true)),

    async execute(interaction, context) {
        const { config, data, coc, emoji } = context;
        const { getEmoji } = emoji;
        const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
        const REAPPLY_ROLE_ID = "1523186839509401701"; // fallback if not in config
        const TARGET_CHANNEL_ID = "1523186791950323824"; // fallback if not in config

        const errorEmbed = (desc) => new EmbedBuilder().setColor("Red").setDescription(`${getEmoji("bluex")} ${desc}`);
        const loadingEmbed = (desc) => new EmbedBuilder().setColor("Blue").setDescription(`${getEmoji("loading")} ${desc}`);
        const successEmbed = (desc) => new EmbedBuilder().setColor("Green").setDescription(`${getEmoji("gtick")} ${desc}`);

        // Permission check
        const allowedRoleNames = ['all leaders', 'executive staff', 'server mod', 't-mod', 'admin', 'moderator'];
        const memberRoles = interaction.member.roles.cache;
        
        const hasConfigRole = 
            memberRoles.has(config.ALL_LEAD_ROLE_ID) || 
            (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) ||
            (config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => memberRoles.has(id)));

        const hasNameRole = memberRoles.some(r => allowedRoleNames.some(allowed => r.name.toLowerCase().includes(allowed)));
        const hasPerms = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles);

        if (!hasConfigRole && !hasNameRole && !hasPerms && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ embeds: [errorEmbed("You do not have the required roles to use this command.")], ephemeral: true });
        }

        const member = interaction.options.getMember('member');
        
        if (!member) {
            return interaction.reply({ embeds: [errorEmbed("Could not resolve the selected member.")], ephemeral: true });
        }

        if (member.user.bot) {
            return interaction.reply({ embeds: [errorEmbed("Bots cannot be processed.")], ephemeral: true });
        }

        const targetChannel = interaction.guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!targetChannel) {
            return interaction.reply({ embeds: [errorEmbed("Target channel not found. Check CHANNEL ID.")], ephemeral: true });
        }

        await interaction.deferReply();

        // Fetch user data
        const userData = data.getUserData();
        const userAccounts = userData[member.id] || [];
        
        if (userAccounts.length === 0) {
            return interaction.editReply({ embeds: [errorEmbed("This user has no linked Clash accounts.")] });
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
            return interaction.editReply({ embeds: [errorEmbed("This user does not currently hold any clan roles.")] });
        }

        await interaction.editReply({ embeds: [loadingEmbed("Fetching live data for all accounts...")] });

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

        // Determine which clans the user is currently in (in-game) across all accounts
        const currentInGameClanTags = new Set(
            validPlayers
                .filter(p => p.clan && monitoredClans[p.clan.tag.toUpperCase()])
                .map(p => p.clan.tag.toUpperCase())
        );

        // Identify which clans the user "left" (they have the Discord role, but no account in the clan)
        const clansLeft = [];
        const clansStillIn = [];
        
        for (const clanInfo of userClanRolesHeld) {
            if (currentInGameClanTags.has(clanInfo.tag)) {
                clansStillIn.push(clanInfo);
            } else {
                clansLeft.push(clanInfo);
            }
        }

        if (clansLeft.length === 0) {
            return interaction.editReply({ embeds: [successEmbed("The user's accounts are still inside the clan(s) for which they hold roles. No action needed.")] });
        }

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
            
            const message = await interaction.editReply({
                embeds: [new EmbedBuilder().setColor("Blue").setDescription(`${getEmoji("rarrow")} **${member.user.username}** has multiple accounts. Select one to process.`)]
                , components: [row]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.customId === "select_reapply_account",
                time: 60000
            });

            collector.on("collect", async (i) => {
                if (i.user.id !== interaction.user.id) {
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
                    interaction.editReply({ embeds: [errorEmbed("Selection timed out.")], components: [] }).catch(() => {});
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
                .setEmoji("1410137736765243432") // bluex
                .setStyle(ButtonStyle.Danger);
                
            const row = new ActionRowBuilder().addComponents(verifyBtn, cancelBtn);

            const message = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

            const collector = message.createMessageComponentCollector({
                filter: i => i.customId === "confirm_reapply" || i.customId === "cancel_reapply",
                time: 300000 // 5 minutes
            });

            collector.on("collect", async (i) => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: `${getEmoji("bluex")} You cannot interact with this.`, ephemeral: true }).catch(() => {});
                    return;
                }
                
                await i.deferUpdate().catch(console.error);
                
                if (i.customId === "cancel_reapply") {
                    collector.stop("cancelled");
                    interaction.editReply({ embeds: [errorEmbed("Re-Application process cancelled.")], components: [] }).catch(console.error);
                    return;
                }

                collector.stop("confirmed");
                executeLeaveLogic(i);
            });

            collector.on("end", (collected, reason) => {
                if (reason !== "confirmed" && reason !== "cancelled") {
                    interaction.editReply({ embeds: [errorEmbed("Confirmation timed out after 5 minutes.")], components: [] }).catch(() => {});
                }
            });
        }

        async function executeLeaveLogic(i) {
            // Action time
            if (clansStillIn.length > 0) {
                // Rule 2: User has another ID still inside any clan
                for (const leftClan of clansLeft) {
                    await member.roles.remove(leftClan.roleId).catch(() => null);
                    if (leftClan.leaderRoleId) {
                        await member.roles.remove(leftClan.leaderRoleId).catch(() => null);
                    }
                }
                
                const leftClanNames = clansLeft.map(c => c.nickName || c.tag).join(", ");
                
                const currentEmbed = (await interaction.fetchReply()).embeds[0];
                const updatedEmbed = EmbedBuilder.from(currentEmbed)
                    .setColor("Orange")
                    .setDescription(
                        currentEmbed.description +
                        `\n\n**${getEmoji("alaram")} Action Completed:**\n` +
                        `Removed role(s) for **${leftClanNames}** because an account left.\n` +
                        `*They still have accounts in other clans, so Re-Apply role was NOT given.*`
                    );

                return interaction.editReply({ 
                    embeds: [updatedEmbed],
                    components: []
                }).catch(console.error);
            } else {
                // Rule 3/4: All IDs have left all clans
                for (const leftClan of clansLeft) {
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
                    mainIdName = parts[1].trim();
                } else if (validPlayers.length > 0) {
                    mainIdName = validPlayers[0].name;
                } else if (userAccounts.length > 0) {
                    mainIdName = userAccounts[0].name;
                } else {
                    mainIdName = currentNick;
                }
                
                let clanPrefix = clansLeft.map(c => (c.nickName || c.tag).toUpperCase()).join(" • ");
                const separator = " | ";
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
                        `${bluedot} You might have left the clan without intimating us.\n` +
                        `${bluedot} You might have dropped out of clan due to inactivity/deviating from rules/or exceeding the minimum set strike points.\n\n` +
                        `${bluedot} Please Open a ticket if you are intrested again to continue with us.`
                    )
                    .setFooter({ text: "💎 - Blood Alliance" });

                await targetChannel.send({
                    content: `Hey <@${member.id}>`,
                    embeds: [embed]
                }).catch(() => null);
                
                const nickNote = nickSuccess ? `\`${newNick}\`` : "*(Failed to change, missing permissions)*";
                
                const currentEmbed = (await interaction.fetchReply()).embeds[0];
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

                return interaction.editReply({ embeds: [updatedEmbed], components: [] }).catch(console.error);
            }
        }
    }
};
