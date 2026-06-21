const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: "playercount",
    description: "List all users and the number of accounts they have linked",
    data: new SlashCommandBuilder()
        .setName('playercount')
        .setDescription('List all users and the number of accounts they have linked'),

    async execute(interaction, context) {
        const { data: dataManager, emoji: emojiUtils, config } = context;
        
        const allowedRoles = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];
        const hasPermission = interaction.member.roles.cache.some(role => allowedRoles.includes(role.id));

        if (!hasPermission) {
            return interaction.reply({ content: "❌ You do not have permission to use this command. Only Admin and Staff can use it.", ephemeral: true });
        }

        await interaction.deferReply();

        const userData = dataManager.getUserData();
        const users = Object.entries(userData);

        if (users.length === 0) {
            return interaction.editReply("⚠️ No user data found.");
        }

        const graphEmoji = emojiUtils.getEmoji("graph");
        const memEmoji = emojiUtils.getEmoji("mem");
        const arrowEmoji = emojiUtils.getEmoji("arrow");
        const larrowEmoji = emojiUtils.getEmojiObject("larrow");
        const rarrowEmoji = emojiUtils.getEmojiObject("rarrow");
        const refreshEmoji = emojiUtils.getEmojiObject("refresh");

        const userCounts = users.map(([id, accounts]) => {
            return {
                id: id,
                count: Array.isArray(accounts) ? accounts.length : 0
            };
        }).filter(u => u.count > 0);

        userCounts.sort((a, b) => b.count - a.count);

        let totalUsers = userCounts.length;
        const perPage = 15;
        let totalPages = Math.ceil(totalUsers / perPage);

        let page = 0;

        const getEmbed = async (pg) => {
            const start = pg * perPage;
            const end = start + perPage;
            const currentUsers = userCounts.slice(start, end);

            let description = `${memEmoji} **Username**\t\t\t\t| **Count**\n`;
            description += "--------------------------------------\n";

            for (let i = 0; i < currentUsers.length; i++) {
                const u = currentUsers[i];
                let discordUser = interaction.client.users.cache.get(u.id);
                if (!discordUser) {
                    discordUser = await interaction.client.users.fetch(u.id).catch(() => null);
                }
                const name = discordUser ? discordUser.username : `Unknown (${u.id})`;
                
                description += `\`${start + i + 1}.\` **${name}**\t\t| **${u.count}**\n`;
            }

            return new EmbedBuilder()
                .setTitle(`${graphEmoji} Alliance Account Counts`)
                .setColor(0x3498DB)
                .setDescription(description)
                .setFooter({ text: `Page ${pg + 1} of ${totalPages} | Total Users: ${totalUsers}` })
                .setTimestamp();
        };

        const getButtons = (pg) => {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pg === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(pg === totalPages - 1),
                new ButtonBuilder()
                    .setCustomId('refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(refreshEmoji || '🔄')
            );
            return [row];
        };

        const initialEmbed = await getEmbed(page);
        const message = await interaction.editReply({
            embeds: [initialEmbed],
            components: getButtons(page)
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            const canInteract = i.member.roles.cache.some(role => allowedRoles.includes(role.id));
            if (!canInteract) {
                return i.reply({ content: "❌ Only Admin and Staff members can interact with these buttons.", ephemeral: true });
            }

            try {
                await i.deferUpdate();
            } catch (err) {
                console.error("Defer update error:", err);
                return;
            }

            if (i.customId === 'prev') {
                page = Math.max(0, page - 1);
                const embed = await getEmbed(page);
                await i.editReply({
                    embeds: [embed],
                    components: getButtons(page)
                });
            } else if (i.customId === 'next') {
                page = Math.min(totalPages - 1, page + 1);
                const embed = await getEmbed(page);
                await i.editReply({
                    embeds: [embed],
                    components: getButtons(page)
                });
            } else if (i.customId === 'refresh') {
                const freshData = dataManager.getUserData();
                const freshUsers = Object.entries(freshData);
                
                const freshCounts = freshUsers.map(([uid, accs]) => ({
                    id: uid,
                    count: Array.isArray(accs) ? accs.length : 0
                })).filter(u => u.count > 0);
                freshCounts.sort((a, b) => b.count - a.count);

                userCounts.length = 0;
                userCounts.push(...freshCounts);
                
                totalUsers = userCounts.length;
                totalPages = Math.ceil(totalUsers / perPage);
                
                page = Math.min(page, Math.max(0, totalPages - 1));

                const embed = await getEmbed(page);
                await i.editReply({
                    embeds: [embed],
                    components: getButtons(page)
                });
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
};
