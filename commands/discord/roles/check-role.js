const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits , MessageFlags } = require("discord.js");

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName("check-role")
        .setDescription("Check Discord users with Clan Member role for fake members not in the clan")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
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

        // Staff / Admin Permission check
        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                flags: [MessageFlags.Ephemeral],
            });
        }

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

            for (const [, member] of membersWithRole) {
                const userAccounts = Array.isArray(userData[member.id]) ? userData[member.id] : [];

                if (userAccounts.length === 0) {
                    // No linked CoC account -> Fake Member
                    fakeMembersList.push(`${member.user.username} - No linked CoC account`);
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
                }
            }

            // Sort alphabetically by Discord username
            fakeMembersList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

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
            await interaction.editReply({ embeds: firstBatch });

            // Send subsequent batches if more than 10 embeds
            for (let i = 10; i < embeds.length; i += 10) {
                const nextBatch = embeds.slice(i, i + 10);
                await interaction.followUp({ embeds: nextBatch });
            }

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
