const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('strikeremove')
        .setDescription('Remove a strike from a player')
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of strikes to remove')
                .setRequired(true)
                .setMinValue(1)
        )
        .addUserOption(option =>
            option.setName('member')
                .setDescription('The discord member to remove strike from')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to remove strike from')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { data: dataManager, config } = context;

        const ALLOWED_ROLES = [...config.ADMIN_ROLE_IDS, ...config.STAFF_ROLE_IDS].filter(id => id.trim() !== "");
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('member');
        const playerTagInput = interaction.options.getString('tag');
        const count = interaction.options.getInteger('count');

        if (!targetUser && !playerTagInput) {
            return interaction.reply({
                content: "❌ You must provide either a **member** or a **player tag**.",
                ephemeral: true
            });
        }

        if (targetUser) {
            const userData = dataManager.getUserData();
            const linkedAccounts = userData[targetUser.id];

            if (!linkedAccounts || linkedAccounts.length === 0) {
                return interaction.reply({
                    content: `❌ <@${targetUser.id}> does not have any linked Clash of Clans accounts.`,
                    ephemeral: true
                });
            }

            const accountsWithStrikes = linkedAccounts.filter(acc => (acc.totalStrikes || acc.strikes || 0) > 0);

            if (accountsWithStrikes.length === 0) {
                return interaction.reply({
                    content: `⚠️ <@${targetUser.id}> has no accounts with strikes.`,
                    ephemeral: true
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`strikeremove_select_${targetUser.id}_${count}`)
                .setPlaceholder(`Select an account to remove ${count} strike(s)`)
                .addOptions(accountsWithStrikes.map(acc => ({
                    label: `${acc.name} (${acc.tag})`,
                    description: `Current strikes: ${acc.totalStrikes || acc.strikes || 0}`,
                    value: acc.tag
                })));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return interaction.reply({
                content: `Please select which account of **${targetUser.username}** to remove **${count}** strike(s) from:`,
                components: [row],
                ephemeral: true
            });
        }

        if (playerTagInput) {
            const tag = playerTagInput.startsWith("#") ? playerTagInput.toUpperCase() : `#${playerTagInput.toUpperCase()}`;
            const strikePlayers = dataManager.getStrikePlayers();
            
            if (!strikePlayers[tag]) {
                return interaction.reply({ content: `❌ No strike records found for player tag \`${tag}\`.`, ephemeral: true });
            }

            const account = strikePlayers[tag];
            if (account.totalStrikes <= 0) {
                return interaction.reply({ content: `⚠️ Player **${account.name}** (${tag}) currently has 0 strikes.`, ephemeral: true });
            }

            const actualRemove = Math.min(count, account.totalStrikes);
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
            dataManager.saveStrikePlayers(strikePlayers);

            return interaction.reply({
                content: `✅ Removed **${actualRemove}** strike(s) from unlinked player **${account.name}** (${tag}). Current strikes: **${account.totalStrikes}**`,
                ephemeral: true
            });
        }
    }
};
