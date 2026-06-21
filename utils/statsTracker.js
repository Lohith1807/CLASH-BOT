const { ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = (client, config) => {
    const updateStats = async () => {
        const GUILD_ID = client.guilds.cache.first()?.id;
        if (!GUILD_ID) return;

        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return;

        try {
            await guild.members.fetch({ withPresences: true }).catch(() => {});

            const totalCount = guild.memberCount;

            const botCount = guild.members.cache.filter(m => m.user.bot).size;
            const humanCount = totalCount - botCount;

            const onlineCount = guild.members.cache.filter(m =>
                m.presence?.status === 'online' ||
                m.presence?.status === 'idle' ||
                m.presence?.status === 'dnd'
            ).size;

            const categoryId = config.STATS_CATEGORY_ID;
            if (!categoryId) return;

            const category = guild.channels.cache.get(categoryId);
            if (!category || category.type !== ChannelType.GuildCategory) return;

            const statsConfig = [
                { search: 'Total:', name: `📊 Total: ${totalCount.toLocaleString()}` },
                { search: 'Members:', name: `👥 Members: ${humanCount.toLocaleString()}` },
                { search: 'Bots:', name: `🤖 Bots: ${botCount.toLocaleString()}` },
                { search: 'Online:', name: `🟢 Online: ${onlineCount.toLocaleString()}` }
            ];

            const categoryChannels = guild.channels.cache.filter(c => c.parentId === categoryId);

            for (const item of statsConfig) {
                let channel = categoryChannels.find(c => c.name.includes(item.search));

                if (!channel) {
                    await guild.channels.create({
                        name: item.name,
                        type: ChannelType.GuildVoice,
                        parent: categoryId,
                        permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }]
                    });
                } else {
                    if (channel.name !== item.name) {
                        await channel.setName(item.name).catch(() => { });
                    }
                }
            }
        } catch (error) {
            console.error('Error updating stats:', error.message);
        }
    };

    setInterval(updateStats, 15 * 60 * 1000);

    const init = async () => {
        console.log('📈 Server Stats tracker active.');
        updateStats();
    };

    if (client.isReady()) {
        init();
    } else {
        client.once('ready', init);
    }
};
