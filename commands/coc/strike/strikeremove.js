const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getEmoji } = require('../../../utils/emoji.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strike-remove')
        .setDescription('Remove a strike from a player')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to remove strike from')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of strike weight to remove')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('dm')
                .setDescription('Send DM to user?')
                .addChoices(
                    { name: 'Yes', value: 'yes' },
                    { name: 'No', value: 'no' }
                )
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { data: dataManager, config, coc } = context;

        const ALLOWED_ROLES = [...config.ADMIN_ROLE_IDS, ...config.STAFF_ROLE_IDS].filter(id => id.trim() !== "");
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
            return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
        }

        await interaction.deferReply();

        const playerTagInput = interaction.options.getString('tag');
        const count = interaction.options.getInteger('count');
        const dmOption = interaction.options.getString('dm');

        const tag = playerTagInput.startsWith("#") ? playerTagInput.toUpperCase() : `#${playerTagInput.toUpperCase()}`;

        // Fetch live CoC data
        let cocData = null;
        try {
            cocData = await coc.getPlayer(tag);
        } catch (err) {
            return interaction.editReply({ content: `❌ Could not find player with tag \`${tag}\`.` });
        }

        const playerName = cocData.name;
        const clanName = cocData.clan ? cocData.clan.name : "No Clan";
        const clanTag = cocData.clan ? cocData.clan.tag : null;

        const userData = dataManager.getUserData();
        const strikePlayers = dataManager.getStrikePlayers();

        // Find if the player is linked to a Discord user
        let targetUserId = null;
        let targetAccount = null;
        for (const [uId, accounts] of Object.entries(userData)) {
            const acc = accounts.find(a => a.tag === tag);
            if (acc) {
                targetUserId = uId;
                targetAccount = acc;
                break;
            }
        }

        let previousStrikes = 0;
        let newStrikes = 0;
        let actualRemove = 0;

        if (targetAccount) {
            // --- Linked player ---
            if (targetAccount.totalStrikes === undefined) targetAccount.totalStrikes = targetAccount.strikes || 0;
            if (!targetAccount.strikeHistory) targetAccount.strikeHistory = [];

            if (targetAccount.totalStrikes <= 0) {
                return interaction.editReply({ content: `⚠️ **${playerName}** currently has 0 strikes.` });
            }

            previousStrikes = targetAccount.totalStrikes;
            actualRemove = Math.min(count, previousStrikes);
            let remainingToRemove = actualRemove;

            while (remainingToRemove > 0 && targetAccount.strikeHistory.length > 0) {
                const lastStrike = targetAccount.strikeHistory[targetAccount.strikeHistory.length - 1];
                if (lastStrike.weight <= remainingToRemove) {
                    remainingToRemove -= lastStrike.weight;
                    targetAccount.strikeHistory.pop();
                } else {
                    lastStrike.weight -= remainingToRemove;
                    lastStrike.strikeCountAdded = lastStrike.weight;
                    remainingToRemove = 0;
                }
            }

            targetAccount.totalStrikes -= actualRemove;
            targetAccount.strikes = targetAccount.totalStrikes;
            if (targetAccount.totalStrikes < 6) targetAccount.sixStrikeAlertSent = false;
            newStrikes = targetAccount.totalStrikes;
            dataManager.saveUserData(userData);

        } else if (strikePlayers[tag]) {
            // --- Unlinked player ---
            const account = strikePlayers[tag];
            if (account.totalStrikes <= 0) {
                return interaction.editReply({ content: `⚠️ Player **${playerName}** currently has 0 strikes.` });
            }

            previousStrikes = account.totalStrikes;
            actualRemove = Math.min(count, previousStrikes);
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
            newStrikes = account.totalStrikes;
            dataManager.saveStrikePlayers(strikePlayers);

        } else {
            return interaction.editReply({ content: `❌ No strike records found for player tag \`${tag}\`.` });
        }

        // --- DM ---
        let dmStatus = "Not Notified in DM";
        if (dmOption === 'yes' && targetUserId) {
            const discordUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
            if (discordUser) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("✅ Strike Removed")
                    .setColor(0x2ECC71)
                    .setDescription(
                        `${getEmoji('rarroww')} **Strikes Removed:** ${actualRemove}\n` +
                        `${getEmoji('yarrow')} **Previous Strikes:** ${previousStrikes}\n` +
                        `${getEmoji('parrow')} **Current Strikes:** ${newStrikes}\n` +
                        `${getEmoji('rarrow')} **Date:** ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`
                    )
                    .setTimestamp();
                const sent = await discordUser.send({ embeds: [dmEmbed] }).catch(() => null);
                dmStatus = sent ? "Notified in DM" : "DM Failed (Closed DMs)";
            } else {
                dmStatus = "DM Failed (User not found)";
            }
        } else if (dmOption === 'yes' && !targetUserId) {
            dmStatus = "DM Failed (Unlinked Player)";
        }

        // --- Clan mail channel notification ---
        if (clanTag) {
            const clanRoles = dataManager.getClanRoles();
            const clanConfig = clanRoles[clanTag];
            if (clanConfig && clanConfig.mailChannelId) {
                const mailChannel = await interaction.client.channels.fetch(clanConfig.mailChannelId).catch(() => null);
                if (mailChannel) {
                    const leaderRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === "leader") ||
                                       interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes("leader"));
                    const mention = leaderRole ? `<@&${leaderRole.id}>` : "@Leader";
                    const alertEmbed = new EmbedBuilder()
                        .setTitle("🟢 Strike Removed")
                        .setColor(0x2ECC71)
                        .setDescription(
                            `${mention}\n\n` +
                            `${getEmoji('rarroww')} **Player:** ${playerName} (${tag})\n` +
                            `${getEmoji('yarrow')} **Clan:** ${clanName}\n` +
                            `${getEmoji('parrow')} **Removed By:** ${interaction.user}\n` +
                            `${getEmoji('uparrow')} **Strikes Removed:** ${actualRemove}\n` +
                            `${getEmoji('downarrow')} **Current Strikes:** ${newStrikes}`
                        )
                        .setTimestamp();
                    await mailChannel.send({ content: mention, embeds: [alertEmbed] }).catch(() => null);
                }
            }
        }

        // --- Final reply ---
        const playerLink = `[${playerName}](https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${tag.replace('#', '')})`;
        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(
                `${getEmoji('rarroww')} **Strike removed from ${playerLink} [${clanName}] by ${interaction.user}.**\n` +
                `${getEmoji('yarrow')} Removed: ${actualRemove}, Current Strikes: ${newStrikes}`
            )
            .setFooter({ text: `${dmStatus}` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};
