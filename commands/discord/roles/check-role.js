const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { checkPermission } = require('../../../utils/checkPermission.js');
const { processMemberReapply } = require('../../../utils/reapplyHelper.js');

/**
 * Resolves a clan from user input (tag, nickname, or clan name)
 * @param {string} clanInput 
 * @param {Object} clanRoles 
 * @param {Object} coc 
 * @returns {Promise<{ tag: string, info: Object, clanName?: string } | null>}
 */
async function resolveClan(clanInput, clanRoles, coc) {
    if (!clanInput) return null;
    const input = clanInput.trim();
    const upper = input.toUpperCase();
    const withHash = upper.startsWith("#") ? upper : "#" + upper;

    // 1. Direct tag match in clanRoles (with or without hash)
    if (clanRoles[withHash]) {
        return { tag: withHash, info: clanRoles[withHash] };
    }
    if (clanRoles[upper]) {
        return { tag: upper, info: clanRoles[upper] };
    }

    // 2. Exact nickname match (case-insensitive)
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.nickName && info.nickName.trim().toLowerCase() === input.toLowerCase()) {
            return { tag, info };
        }
    }

    // 3. Partial / starts-with nickname match
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.nickName && info.nickName.trim().toLowerCase().startsWith(input.toLowerCase())) {
            return { tag, info };
        }
    }

    // 4. Case-insensitive tag match
    for (const [tag, info] of Object.entries(clanRoles)) {
        if (tag.toLowerCase() === input.toLowerCase() || tag.toLowerCase() === withHash.toLowerCase()) {
            return { tag, info };
        }
    }

    // 5. Match by actual Clan Name in CoC API across registered clans
    const tags = Object.keys(clanRoles);
    for (const tag of tags) {
        try {
            const clan = await coc.getClan(tag).catch(() => null);
            if (clan && clan.name) {
                if (clan.name.toLowerCase() === input.toLowerCase() || clan.name.toLowerCase().includes(input.toLowerCase())) {
                    return { tag, info: clanRoles[tag], clanName: clan.name };
                }
            }
        } catch {}
    }

    return null;
}

/**
 * Checks if a member has the leader role for a specific clan, or is an Administrator.
 * @param {import('discord.js').GuildMember} member
 * @param {Object} clanInfo
 * @param {Object} config
 * @returns {boolean}
 */
function hasClanLeaderRole(member, clanInfo, config) {
    if (!member || !clanInfo) return false;
    const memberRoles = member.roles?.cache;
    if (clanInfo.leaderRoleId && memberRoles) {
        if (typeof memberRoles.has === "function" && memberRoles.has(clanInfo.leaderRoleId)) return true;
        if (typeof memberRoles.some === "function" && memberRoles.some(r => r.id === clanInfo.leaderRoleId)) return true;
    }
    if (Array.isArray(clanInfo.leaders) && clanInfo.leaders.some(m => m.includes(member.id))) {
        return true;
    }
    if (Array.isArray(clanInfo.coLeaders) && clanInfo.coLeaders.some(m => m.includes(member.id))) {
        return true;
    }
    if (member.permissions && typeof member.permissions.has === "function" && member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    if (config?.ADMIN_ROLE_IDS && memberRoles && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) {
        return true;
    }
    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("check-role")
        .setDescription("Check Discord users with Clan Member role for fake members not in the clan")
        .addStringOption(option =>
            option
                .setName("clan")
                .setDescription("Select or enter clan nickname, tag, or name")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focused = interaction.options.getFocused().toLowerCase();

        const choices = [];
        for (const [tag, entry] of Object.entries(clanRoles)) {
            const nick = entry.nickName ? `${entry.nickName} — ` : "";
            const type = entry.clanType ? ` (${entry.clanType.toUpperCase()})` : "";
            const label = `${nick}${tag}${type}`;

            if (
                tag.toLowerCase().includes(focused) ||
                (entry.nickName && entry.nickName.toLowerCase().includes(focused)) ||
                label.toLowerCase().includes(focused)
            ) {
                choices.push({ name: label.slice(0, 100), value: tag });
            }
        }

        await interaction.respond(choices.slice(0, 25)).catch(() => {});
    },

    async execute(interaction, context) {
        const { data: dataManager, config, coc } = context;

        try {
            await interaction.deferReply();
        } catch (err) {
            if (err.code !== 10062) console.error("Error deferring /check-role:", err);
            return;
        }

        try {
            const clanInput = interaction.options.getString("clan");
            const clanRoles = dataManager.getClanRoles();

            // Step 1: Resolve Clan
            const resolved = await resolveClan(clanInput, clanRoles, coc);
            if (!resolved) {
                return interaction.editReply(`❌ Clan not found matching **${clanInput}**. Please provide a valid clan nickname, tag, or name.`);
            }

            const { tag: clanTag, info: clanInfo } = resolved;

            // Permission check: Allowed if user has check-role permission OR is the leader of this specific clan
            const hasGeneralPerm = checkPermission('check-role', interaction);
            const isLeader = hasClanLeaderRole(interaction.member, clanInfo, config);

            if (!hasGeneralPerm && !isLeader) {
                const leaderRoleMention = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
                return interaction.editReply(`❌ You do not have permission to check roles for this clan. Requires ${leaderRoleMention} or Staff permissions.`);
            }

            // Step 2: Validate Clan Member Role configuration
            if (!clanInfo.roleId) {
                const clanDisplayName = clanInfo.nickName ? `${clanInfo.nickName} (${clanTag})` : clanTag;
                return interaction.editReply(`❌ The clan member role has not been configured for clan **${clanDisplayName}**.`);
            }

            const role = await interaction.guild.roles.fetch(clanInfo.roleId).catch(() => null);
            if (!role) {
                return interaction.editReply(`❌ The configured Clan Member role (ID: \`${clanInfo.roleId}\`) was not found in this Discord server.`);
            }

            // Step 3: Fetch Clan Data from CoC API
            let clanData;
            try {
                clanData = await coc.getClan(clanTag);
            } catch (err) {
                if (err?.response?.status === 503) {
                    return interaction.editReply("❌ Clash of Clans API is currently under maintenance. Please try again later.");
                }
                if (err?.response?.status === 404) {
                    return interaction.editReply(`❌ Clan with tag \`${clanTag}\` was not found on Clash of Clans.`);
                }
                return interaction.editReply(`❌ Error fetching clan data from Clash of Clans API: ${err.message || err}`);
            }

            if (!clanData || !clanData.memberList) {
                return interaction.editReply(`❌ Could not retrieve member list for clan \`${clanTag}\`.`);
            }

            // Step 4: Fetch all Discord members to check every member with the role
            // Use cache if full fetch is rate limited
            await interaction.guild.members.fetch().catch(() => {
                // Silently fall back to cache if rate limited
            });

            const membersWithRole = interaction.guild.members.cache.filter(m => m.roles.cache.has(clanInfo.roleId) && !m.user.bot);

            // Build map of clean CoC clan member tags -> member data
            const inGameClanMembers = new Map();
            for (const m of clanData.memberList) {
                const clean = (m.tag || "").replace("#", "").toUpperCase();
                inGameClanMembers.set(clean, m);
            }

            // Step 5: Check Discord ↔ CoC Links to find Fake Members
            const userData = dataManager.getUserData();
            const fakeMembersList = [];
            const fakeMembersData = [];

            for (const [, member] of membersWithRole) {
                const userAccounts = Array.isArray(userData[member.id]) ? userData[member.id] : [];

                if (userAccounts.length === 0) {
                    // No linked CoC account -> Fake Member
                    fakeMembersList.push(`${member.user.username} - No linked CoC account`);
                    fakeMembersData.push({
                        id: member.id,
                        member,
                        username: member.user.username,
                        detail: "No linked CoC account"
                    });
                    continue;
                }

                // Check which linked accounts are actually in the clan
                const inClanAccounts = userAccounts.filter(acc => {
                    const clean = (acc.tag || "").replace("#", "").toUpperCase();
                    return inGameClanMembers.has(clean);
                });

                if (inClanAccounts.length === 0) {
                    // Linked accounts exist, but none are in this clan -> Fake Member
                    const formatted = userAccounts.map(acc => {
                        const cleanTag = (acc.tag || "").replace("#", "");
                        const accName = acc.name || cleanTag;
                        const link = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${cleanTag}`;
                        return `[${accName}](${link})`;
                    }).join(", ");
                    fakeMembersList.push(`${member.user.username} - ${formatted}`);
                    fakeMembersData.push({
                        id: member.id,
                        member,
                        username: member.user.username,
                        detail: userAccounts.map(a => a.name || a.tag).join(", ")
                    });
                }
            }

            // Sort alphabetically by Discord username
            fakeMembersList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            fakeMembersData.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));

            // Step 6: Construct Embed(s)
            const clanTitle = clanData.name || clanInfo.nickName || clanTag;
            const clanBadge = clanData.badgeUrls?.small || clanData.badgeUrls?.medium || null;

            if (fakeMembersList.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`Fake Members — ${clanTitle}`)
                    .setDescription("✅ **No fake members found.** All members with the role are verified in the clan.")
                    .setColor(0x2ECC71)
                    .setFooter({ text: `Clan: ${clanTag}` })
                    .setTimestamp();
                if (clanBadge) embed.setThumbnail(clanBadge);
                return interaction.editReply({ embeds: [embed] });
            }

            // Chunk into multiple embeds if character limit (~3800 chars) is exceeded
            const embeds = [];
            let currentDesc = `**Total Fake Members:** ${fakeMembersList.length}\n\n`;

            for (let i = 0; i < fakeMembersList.length; i++) {
                const line = fakeMembersList[i] + "\n";
                if (currentDesc.length + line.length > 3800) {
                    const embed = new EmbedBuilder()
                        .setTitle(embeds.length === 0 ? `Fake Members — ${clanTitle}` : `Fake Members — ${clanTitle} (Cont.)`)
                        .setDescription(currentDesc.trim())
                        .setColor(0xE74C3C)
                        .setFooter({ text: `Clan: ${clanTag}` })
                        .setTimestamp();
                    if (embeds.length === 0 && clanBadge) embed.setThumbnail(clanBadge);
                    embeds.push(embed);
                    currentDesc = "";
                }
                currentDesc += line;
            }

            if (currentDesc.trim().length > 0) {
                const embed = new EmbedBuilder()
                    .setTitle(embeds.length === 0 ? `Fake Members — ${clanTitle}` : `Fake Members — ${clanTitle} (Cont.)`)
                    .setDescription(currentDesc.trim())
                    .setColor(0xE74C3C)
                    .setFooter({ text: `Clan: ${clanTag}` })
                    .setTimestamp();
                if (embeds.length === 0 && clanBadge) embed.setThumbnail(clanBadge);
                embeds.push(embed);
            }

            // Discord allows up to 10 embeds per message
            const firstBatch = embeds.slice(0, 10);

            // Reapply Fake Members button
            const reapplyBtn = new ButtonBuilder()
                .setCustomId(`checkrole_btn_reapply_${clanTag.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`)
                .setLabel("RE - APPLY")
                .setStyle(ButtonStyle.Danger);


            const initialRow = new ActionRowBuilder().addComponents(reapplyBtn);

            const replyMessage = await interaction.editReply({
                embeds: firstBatch,
                components: [initialRow]
            });

            // Send subsequent batches if more than 10 embeds
            for (let i = 10; i < embeds.length; i += 10) {
                const nextBatch = embeds.slice(i, i + 10);
                await interaction.followUp({ embeds: nextBatch });
            }

            // Set up component collector for the button & dropdown
            const collector = replyMessage.createMessageComponentCollector({
                time: 15 * 60 * 1000 // 15 minutes
            });

            let currentSelectedIds = [];

            collector.on("collect", async (i) => {
                // Permission check: Only leaders of this specific clan (or Admins) can use the reapply button
                if (!hasClanLeaderRole(i.member, clanInfo, config)) {
                    const leaderRoleMention = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : `Clan Leader of **${clanTitle}**`;
                    return i.reply({
                        content: `❌ Only members with the ${leaderRoleMention} role can use the reapply button for this clan.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                // 1. "Reapply Fake Ppl" button clicked -> Show select menu
                if (i.customId.startsWith("checkrole_btn_reapply_")) {
                    const chunkedMenus = [];
                    // Chunk into groups of 25 for Discord select menu limit
                    for (let c = 0; c < fakeMembersData.length && chunkedMenus.length < 4; c += 25) {
                        const chunk = fakeMembersData.slice(c, c + 25);
                        const menuOptions = chunk.map(fm => ({
                            label: (fm.member.displayName || fm.username).slice(0, 50),
                            description: `@${fm.username} • ${fm.detail}`.slice(0, 100),
                            value: fm.id
                        }));

                        const placeholder = fakeMembersData.length > 25
                            ? `Select fake members (${c + 1}-${c + chunk.length})...`
                            : "Select fake member(s) to reapply...";

                        const menu = new StringSelectMenuBuilder()
                            .setCustomId(`checkrole_select_fake_${c}_${Date.now()}`)
                            .setPlaceholder(placeholder)
                            .setMinValues(1)
                            .setMaxValues(menuOptions.length)
                            .addOptions(menuOptions);

                        chunkedMenus.push(new ActionRowBuilder().addComponents(menu));
                    }

                    const cancelBtn = new ButtonBuilder()
                        .setCustomId(`checkrole_cancel_${Date.now()}`)
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("❌");

                    chunkedMenus.push(new ActionRowBuilder().addComponents(cancelBtn));

                    return i.update({
                        embeds: firstBatch,
                        components: chunkedMenus
                    });
                }

                // 2. Select menu changed -> Show confirmation
                if (i.customId.startsWith("checkrole_select_fake_")) {
                    currentSelectedIds = i.values;

                    const memberMentions = currentSelectedIds.map(id => `<@${id}>`).join(", ");
                    const confirmEmbed = new EmbedBuilder()
                        .setColor(0xF39C12)
                        .setTitle(`Confirm Reapply for Fake Members — ${clanTitle}`)
                        .setDescription(
                            `Are you sure you want to reapply the following **${currentSelectedIds.length}** fake member(s)?\n\n` +
                            `👥 **Selected Members:**\n${memberMentions}\n\n` +
                            `📝 **Reason:** \`Left clan and Leaders still keeping him in clan role\`\n\n` +
                            `⚠️ **Actions that will be performed:**\n` +
                            `• Remove **${clanTitle}** clan member role\n` +
                            `• Remove Leader role (if held)\n` +
                            `• If no other family clan accounts: Remove Family role, add **Re-Apply** role & Global role\n` +
                            `• Update nickname format\n` +
                            `• Post notification in <#${config.REAPPLY_CHANNEL_ID || "1523186791950323824"}>\n` +
                            `• Save reapply reason log`
                        )
                        .setTimestamp();

                    const confirmBtn = new ButtonBuilder()
                        .setCustomId(`checkrole_confirm_reapply_${Date.now()}`)
                        .setLabel(`Confirm Reapply (${currentSelectedIds.length})`)
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("✅");

                    const cancelBtn = new ButtonBuilder()
                        .setCustomId(`checkrole_cancel_${Date.now()}`)
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("❌");

                    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

                    return i.update({
                        embeds: [confirmEmbed],
                        components: [row]
                    });
                }

                // 3. Confirm button clicked -> Execute reapply
                if (i.customId.startsWith("checkrole_confirm_reapply_")) {
                    if (!currentSelectedIds || currentSelectedIds.length === 0) {
                        return i.update({
                            content: "❌ No members selected.",
                            embeds: [],
                            components: []
                        });
                    }

                    await i.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x3498DB)
                                .setDescription(`⏳ **Processing reapply for ${currentSelectedIds.length} member(s)... Please wait.**`)
                        ],
                        components: []
                    });

                    const results = [];
                    const reason = "Left clan and Leaders still keeping him in clan role";

                    for (const id of currentSelectedIds) {
                        let targetMember = interaction.guild.members.cache.get(id);
                        if (!targetMember) {
                            targetMember = await interaction.guild.members.fetch(id).catch(() => null);
                        }
                        if (!targetMember) {
                            results.push(`• <@${id}>: ❌ *(Member left server)*`);
                            continue;
                        }

                        try {
                            const res = await processMemberReapply({
                                member: targetMember,
                                clanInfo: { ...clanInfo, tag: clanTag },
                                reason,
                                executorUser: i.user,
                                context
                            });
                            if (res.success) {
                                results.push(`• <@${id}> (${targetMember.user.username}): ✅ ${res.reapplyGiven ? "**Re-Apply role given**" : "Clan role removed *(retained other clan)*"}`);
                            } else {
                                results.push(`• <@${id}>: ⚠️ ${res.message}`);
                            }
                        } catch (err) {
                            results.push(`• <@${id}>: ❌ Error: ${err.message}`);
                        }
                    }

                    const completeEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(`Reapply Completed — ${clanTitle}`)
                        .setDescription(
                            `**Processed ${currentSelectedIds.length} member(s):**\n\n` +
                            results.join("\n") +
                            `\n\n📝 **Reason:** \`${reason}\`\n` +
                            `📢 **Notification Channel:** <#${config.REAPPLY_CHANNEL_ID || "1523186791950323824"}>`
                        )
                        .setFooter({ text: `Executed by ${i.user.tag}` })
                        .setTimestamp();

                    return i.editReply({
                        embeds: [completeEmbed],
                        components: []
                    });
                }

                // 4. Cancel button clicked
                if (i.customId.startsWith("checkrole_cancel_")) {
                    currentSelectedIds = [];
                    return i.update({
                        embeds: firstBatch,
                        components: [initialRow]
                    });
                }
            });

            collector.on("end", async (collected, reason) => {
                if (reason !== "messageDelete") {
                    await replyMessage.edit({ components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("Error in /check-role command:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ An error occurred while executing /check-role." }).catch(() => {});
            } else {
                await interaction.reply({ content: "❌ An error occurred while executing /check-role.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }
        }
    }
};
