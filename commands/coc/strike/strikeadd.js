const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const pendingStrikes = new Map(); // Kept for backwards compatibility with old select menus

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strikeadd')
        .setDescription('Add a strike to a player')
        .addStringOption(option =>
            option.setName('playertag')
                .setDescription('The player tag to strike')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('weight')
                .setDescription('Strike weight (1-3)')
                .addChoices(
                    { name: '1 Strike', value: 1 },
                    { name: '2 Strikes', value: 2 },
                    { name: '3 Strikes', value: 3 }
                )
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the strike')
                .setRequired(true)
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
        const { data: dataManager, config, coc, emoji } = context;
        
        const ALLOWED_ROLES = [...config.ADMIN_ROLE_IDS, ...config.STAFF_ROLE_IDS].filter(id => id.trim() !== "");
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const playerTagInput = interaction.options.getString('playertag');
        const reason = interaction.options.getString('reason');
        const weight = interaction.options.getInteger('weight');
        const dmOption = interaction.options.getString('dm');

        const tag = playerTagInput.startsWith("#") ? playerTagInput.toUpperCase() : `#${playerTagInput.toUpperCase()}`;
        
        let cocData = null;
        try {
            cocData = await coc.getPlayer(tag);
        } catch (err) {
            console.error(err);
            return interaction.editReply({ content: `❌ Could not find player with tag \`${tag}\`.` });
        }

        const clanName = cocData.clan ? cocData.clan.name : "No Clan";
        const clanTag = cocData.clan ? cocData.clan.tag : null;
        const playerName = cocData.name;

        const userData = dataManager.getUserData();
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

        let clanNick = "UNK";
        const clanRoles = dataManager.getClanRoles();
        if (clanTag && clanRoles[clanTag] && clanRoles[clanTag].nickName) {
            clanNick = clanRoles[clanTag].nickName.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Ensure it's uppercase alphanumeric
        }

        const counters = dataManager.getStrikeCounters();
        if (!counters[clanNick]) counters[clanNick] = 0;
        counters[clanNick] += 1;
        dataManager.saveStrikeCounters(counters);

        const seqStr = counters[clanNick].toString().padStart(3, '0');
        const strikeId = `${clanNick}${seqStr}`;

        const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
        
        let totalStrikes = 0;

        if (targetUserId) {
            if (targetAccount.totalStrikes === undefined) targetAccount.totalStrikes = targetAccount.strikes || 0;
            if (!targetAccount.strikeHistory) targetAccount.strikeHistory = [];

            targetAccount.totalStrikes += weight;
            totalStrikes = targetAccount.totalStrikes;
            
            targetAccount.strikeHistory.push({
                id: strikeId,
                reason: reason,
                weight: weight,
                strikeCountAdded: weight,
                totalAtTime: totalStrikes,
                addedBy: interaction.user.id,
                clan: clanName,
                date: dateStr
            });

            targetAccount.strikes = totalStrikes; 
            dataManager.saveUserData(userData);
            
            if (totalStrikes >= 6 && !targetAccount.sixStrikeAlertSent) {
                targetAccount.sixStrikeAlertSent = true;
                dataManager.saveUserData(userData);
                await this.sendSixStrikeAlert(interaction, clanTag, playerName, totalStrikes, clanName, dataManager);
            }
        } else {
            const strikePlayers = dataManager.getStrikePlayers();
            if (!strikePlayers[tag]) {
                strikePlayers[tag] = {
                    tag: tag,
                    name: playerName,
                    totalStrikes: 0,
                    strikeHistory: []
                };
            }
            const account = strikePlayers[tag];
            account.totalStrikes += weight;
            totalStrikes = account.totalStrikes;

            account.strikeHistory.push({
                id: strikeId,
                reason: reason,
                weight: weight,
                strikeCountAdded: weight,
                totalAtTime: totalStrikes,
                addedBy: interaction.user.id,
                clan: clanName,
                date: dateStr
            });

            dataManager.saveStrikePlayers(strikePlayers);
            await this.sendUnlinkedAlert(interaction, clanTag, playerName, tag, reason, weight, totalStrikes, dataManager);
        }

        let dmStatus = "Notified in DM";
        if (dmOption === 'yes' && targetUserId) {
            const discordUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
            if (discordUser) {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("⚠️ You received a strike")
                    .setColor(0xFF0000)
                    .setDescription(
                        `${emoji.getEmoji('rarroww')} **Reason:** ${reason}\n` +
                        `${emoji.getEmoji('yarrow')} **Weight:** ${weight}\n` +
                        `${emoji.getEmoji('parrow')} **Total Strikes:** ${totalStrikes}\n` +
                        `${emoji.getEmoji('rarrow')} **Date:** ${dateStr}`
                    )
                    .setTimestamp();
                const sent = await discordUser.send({ embeds: [dmEmbed] }).catch(() => null);
                if (!sent) dmStatus = "DM Failed (Closed DMs)";
            } else {
                dmStatus = "DM Failed (User not found)";
            }
        } else if (dmOption === 'yes' && !targetUserId) {
            dmStatus = "DM Failed (Unlinked Player)";
        } else {
            dmStatus = "Not Notified in DM";
        }

        const playerLink = `[${playerName}](https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${tag.replace('#', '')})`;
        
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription(
                `**Strike added to ${playerLink} [${clanName}] by ${interaction.user}.**\n` +
                `Strike Weight: ${weight}, Total Strikes Now: ${totalStrikes}\n` +
                `Reason: ${reason}`
            )
            .setFooter({ text: `Strike ID: ${strikeId} | ${dmStatus}` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },

    async sendSixStrikeAlert(interaction, clanTag, playerName, totalStrikes, clanName, dataManager) {
        if (!clanTag) return;
        const { EmbedBuilder } = require('discord.js');
        const clanRoles = dataManager.getClanRoles();
        const clanConfig = clanRoles[clanTag];
        if (clanConfig && clanConfig.mailChannelId) {
            const mailChannel = await interaction.client.channels.fetch(clanConfig.mailChannelId).catch(() => null);
            if (mailChannel) {
                const leaderRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === "leader") || 
                                   interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes("leader"));
                const mention = leaderRole ? `<@&${leaderRole.id}>` : "@Leader";
                const alertEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Player reached 6 strikes")
                    .setColor(0xFF0000)
                    .setDescription(
                        `${mention}\n\n` +
                        `**Player:** ${playerName}\n` +
                        `**Clan:** ${clanName}\n` +
                        `**Current Strikes:** ${totalStrikes}`
                    )
                    .setTimestamp();
                await mailChannel.send({ content: mention, embeds: [alertEmbed] }).catch(() => null);
            }
        }
    },

    async sendUnlinkedAlert(interaction, clanTag, playerName, tag, reason, weight, totalStrikes, dataManager) {
        if (!clanTag) return;
        const { EmbedBuilder } = require('discord.js');
        const clanRoles = dataManager.getClanRoles();
        const clanConfig = clanRoles[clanTag];
        if (clanConfig && clanConfig.mailChannelId) {
            const mailChannel = await interaction.client.channels.fetch(clanConfig.mailChannelId).catch(() => null);
            if (mailChannel) {
                const leaderRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === "leader") || 
                                   interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes("leader"));
                const mention = leaderRole ? `<@&${leaderRole.id}>` : "@Leader";
                const alertEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Strike Added (Unlinked Player)")
                    .setColor(0xFF0000)
                    .setDescription(
                        `${mention}\n\n` +
                        `**Player:** ${playerName} (${tag})\n` +
                        `**Reason:** ${reason}\n` +
                        `**Weight:** ${weight}\n` +
                        `**Total Strikes:** ${totalStrikes}\n\n` +
                        `*Note: This player is not in Discord.*`
                    )
                    .setTimestamp();
                await mailChannel.send({ content: `${mention}`, embeds: [alertEmbed] }).catch(() => null);
            }
        }
    },
    
    pendingStrikes
};
