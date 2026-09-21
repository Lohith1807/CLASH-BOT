const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits , MessageFlags } = require('discord.js');

module.exports = {
    name: "link-summary",
    description: "Get a summary of linked, unlinked, and duplicate accounts for all clans.",
    data: new SlashCommandBuilder()
        .setName('link-summary')
        .setDescription('Get a summary of linked, unlinked, and duplicate accounts for all clans.'),

    async execute(interaction, context) {
        const { coc, data: dataManager, emoji, config } = context;

        // Check if the user has the manage/admin role
        const allowedRoles = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];
        const isAuthorized = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId)) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAuthorized) {
            return interaction.reply({
                content: "❌ You cannot use this command.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        try { await interaction.deferReply().catch(() => {}); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        if (interaction.guild) {
            let lastId = '0';
            while (true) {
                const members = await interaction.guild.members.fetch({ limit: 1000, after: lastId }).catch(() => null);
                if (!members || members.size === 0) break;
                if (members.size < 1000) break;
                const keys = Array.from(members.keys());
                lastId = keys[keys.length - 1];
            }
        }

        const clanRoles = dataManager.getClanRoles();
        const userData = dataManager.getUserData();
        
        const tags = Object.keys(clanRoles);
        if (tags.length === 0) {
            return interaction.editReply("⚠ No clans found in `clanrole.json`.").catch(() => {});
        }

        const tagToUser = {};
        for (const [discordId, accounts] of Object.entries(userData)) {
            if (Array.isArray(accounts)) {
                accounts.forEach(acc => {
                    tagToUser[acc.tag.replace("#", "").toUpperCase()] = discordId;
                });
            }
        }

        const arrow = emoji.getEmoji("arrow") || "➡️";
        const pinkdot = emoji.getEmoji("pinkdot") || "🩷";
        const orangedot = emoji.getEmoji("orangedot") || "🟠";
        const bluedot = emoji.getEmoji("bluedot") || "🔵";
        const mem = emoji.getEmoji("mem") || "👥";

        const outputBlocks = [];

        await interaction.editReply(`⏳ Fetching data for ${tags.length} clans. This might take a moment...`).catch(() => {});

        // Fetch data for all clans in parallel
        const fetchPromises = tags.map(async (tag) => {
            try {
                const clanData = await coc.getClan(tag);
                if (!clanData || !clanData.memberList) return null;

                let linkedCount = 0;
                let notLinkedCount = 0;
                const discordIdAccountCount = {};

                for (const m of clanData.memberList) {
                    const cleanTag = m.tag.replace("#", "").toUpperCase();
                    const discordId = tagToUser[cleanTag];

                    if (discordId) {
                        linkedCount++;
                        discordIdAccountCount[discordId] = (discordIdAccountCount[discordId] || 0) + 1;
                    } else {
                        notLinkedCount++;
                    }
                }

                let duplicateCount = 0;
                for (const count of Object.values(discordIdAccountCount)) {
                    if (count >= 2) {
                        duplicateCount++;
                    }
                }

                let memberRoleCount = 0;
                const clanRoleData = clanRoles[tag];
                if (clanRoleData && clanRoleData.roleId && interaction.guild) {
                    const role = interaction.guild.roles.cache.get(clanRoleData.roleId);
                    if (role) {
                        memberRoleCount = role.members.size;
                    }
                }

                return {
                    name: clanData.name,
                    tag: tag,
                    linkedCount,
                    notLinkedCount,
                    duplicateCount,
                    memberRoleCount
                };
            } catch (err) {
                return {
                    name: clanRoles[tag].nickName || "Unknown Clan",
                    tag: tag,
                    error: true
                };
            }
        });

        const results = await Promise.all(fetchPromises);

        for (const res of results) {
            if (!res) continue;

            if (res.error) {
                outputBlocks.push(`${arrow} **${res.name}** - \`${res.tag}\`\n❌ Failed to fetch data.`);
            } else {
                outputBlocks.push(
                    `${arrow} **${res.name}** - \`${res.tag}\`\n` +
                    `${pinkdot} Linked - ${res.linkedCount}\n` +
                    `${orangedot} Not Linked - ${res.notLinkedCount}\n` +
                    `${bluedot} Duplicate Accounts - ${res.duplicateCount}\n` +
                    `${mem} Member Role Count : ${res.memberRoleCount}`
                );
            }
        }

        const chunks = [];
        let currentChunk = "";

        for (const block of outputBlocks) {
            if (currentChunk.length + block.length + 2 > 4000) {
                chunks.push(currentChunk);
                currentChunk = block;
            } else {
                currentChunk += (currentChunk ? "\n\n" : "") + block;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        if (chunks.length === 0) {
            return interaction.editReply("❌ No data could be processed.").catch(() => {});
        }

        for (let i = 0; i < chunks.length; i++) {
            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle(i === 0 ? "Clan Links Summary" : "Clan Links Summary (Cont.)")
                .setDescription(chunks[i])
                .setTimestamp();

            if (i === 0) {
                await interaction.editReply({ content: null, embeds: [embed] }).catch(() => {});
            } else {
                await interaction.followUp({ embeds: [embed] }).catch(() => {});
            }
        }
    }
};
