const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const pendingStrikes = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strikeadd')
        .setDescription('Add a strike to a player')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('The reason for the strike')
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
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The discord member to strike')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to strike (if not in discord)')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { data: dataManager, config, coc } = context;
        
        const ALLOWED_ROLES = [...config.ADMIN_ROLE_IDS, ...config.STAFF_ROLE_IDS].filter(id => id.trim() !== "");
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('member');
        const playerTagInput = interaction.options.getString('tag');
        const reason = interaction.options.getString('reason');
        const weight = interaction.options.getInteger('weight');

        if (!targetUser && !playerTagInput) {
            return interaction.reply({
                content: "❌ You must provide either a **member** or a **player tag**.",
                ephemeral: true
            });
        }

        const userData = dataManager.getUserData();

        if (targetUser) {
            const linkedAccounts = userData[targetUser.id];

            if (!linkedAccounts || linkedAccounts.length === 0) {
                return interaction.reply({
                    content: `❌ <@${targetUser.id}> does not have any linked Clash of Clans accounts.`,
                    ephemeral: true
                });
            }

            const pendingId = Date.now().toString();
            pendingStrikes.set(pendingId, {
                targetUserId: targetUser.id,
                reason,
                weight,
                addedBy: interaction.user.id
            });

            setTimeout(() => pendingStrikes.delete(pendingId), 5 * 60 * 1000);
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`strikeadd_select_${pendingId}`)
                .setPlaceholder('Select an account to add a strike')
                .addOptions(linkedAccounts.map(acc => ({
                    label: `${acc.name} (${acc.tag})`,
                    description: `Current strikes: ${acc.totalStrikes !== undefined ? acc.totalStrikes : (acc.strikes || 0)}`,
                    value: acc.tag
                })));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return interaction.reply({
                content: `Please select which account of **${targetUser.username}** to add a strike to:\n**Reason:** ${reason}\n**Weight:** ${weight}`,
                components: [row],
                ephemeral: true
            });
        }

        if (playerTagInput) {
            await interaction.deferReply({ ephemeral: true });
            
            const tag = playerTagInput.startsWith("#") ? playerTagInput.toUpperCase() : `#${playerTagInput.toUpperCase()}`;
            
            try {
                const cocData = await coc.getPlayer(tag);
                const clanName = cocData.clan ? cocData.clan.name : "No Clan";
                const clanTag = cocData.clan ? cocData.clan.tag : null;

                const strikeId = Math.random().toString(36).substring(2, 7).toUpperCase();
                const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

                const strikePlayers = dataManager.getStrikePlayers();
                if (!strikePlayers[tag]) {
                    strikePlayers[tag] = {
                        tag: tag,
                        name: cocData.name,
                        totalStrikes: 0,
                        strikeHistory: []
                    };
                }

                const account = strikePlayers[tag];
                account.totalStrikes += weight;
                
                const strikeEntry = {
                    id: strikeId,
                    reason: reason,
                    weight: weight,
                    strikeCountAdded: weight,
                    totalAtTime: account.totalStrikes,
                    addedBy: interaction.user.id,
                    clan: clanName,
                    date: dateStr
                };

                account.strikeHistory.push(strikeEntry);
                dataManager.saveStrikePlayers(strikePlayers);

                await interaction.editReply({ 
                    content: `✅ Added **${weight}** strike(s) to unlinked player **${cocData.name}** (${tag}). Total strikes: **${account.totalStrikes}**` 
                });

                const clanRoles = dataManager.getClanRoles();
                const clanConfig = clanRoles[clanTag];
                
                if (clanConfig && clanConfig.mailChannelId) {
                    const mailChannel = await interaction.client.channels.fetch(clanConfig.mailChannelId).catch(() => null);
                    if (mailChannel) {
                        const guild = interaction.guild;
                        const leaderRole = guild.roles.cache.find(r => r.name.toLowerCase() === "leader") || 
                                           guild.roles.cache.find(r => r.name.toLowerCase().includes("leader"));
                        
                        const mention = leaderRole ? `<@&${leaderRole.id}>` : "@Leader";
                        
                        const alertEmbed = new EmbedBuilder()
                            .setTitle("⚠️ Strike Added (Unlinked Player)")
                            .setColor(0xFF0000)
                            .setDescription(
                                `${mention}\n\n` +
                                `**Player:** ${cocData.name} (${tag})\n` +
                                `**Reason:** ${reason}\n` +
                                `**Weight:** ${weight}\n` +
                                `**Total Strikes:** ${account.totalStrikes}\n\n` +
                                `*Note: This player is not in Discord.*`
                            )
                            .setTimestamp();

                        await mailChannel.send({ content: `${mention}`, embeds: [alertEmbed] }).catch(() => null);
                    }
                }

            } catch (err) {
                console.error(err);
                return interaction.editReply({ content: `❌ Could not find player with tag \`${tag}\`.` });
            }
        }
    },
    
    pendingStrikes
};
