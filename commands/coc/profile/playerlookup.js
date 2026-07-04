const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

function formatRole(role) {
    if (!role) return "None";
    switch (role.toLowerCase()) {
        case "leader": return "Leader";
        case "coleader": return "Co-Leader";
        case "admin": return "Elder";
        case "member": return "Member";
        default: return role;
    }
}

async function getPlayerEmbed(tag, context) {
    const { EmbedBuilder, emoji: emojiUtils, coc, data: dataManager } = context;
    const data = await coc.getPlayer(tag);
    const userData = dataManager.getUserData();

    let linkedUserText = "Not linked to Alliance";
    for (const [id, accounts] of Object.entries(userData)) {
        if (accounts.some(acc => acc.tag.toUpperCase() === tag.toUpperCase())) {
            linkedUserText = `<@${id}>`;
            break;
        }
    }

    const cocwarEmoji = emojiUtils.getEmoji("cocfight");
    const arrowEmoji = emojiUtils.getEmoji("arrow");
    const throphyEmoji = emojiUtils.getEmoji("throphy");
    const uparrowEmoji = emojiUtils.getEmoji("uparrow");
    const downarrowEmoji = emojiUtils.getEmoji("downarrow");
    const graphEmoji = emojiUtils.getEmoji("graph");
    const cgEmoji = emojiUtils.getEmoji("clangames");
    const capitalgoldEmoji = emojiUtils.getEmoji("capitalgold");
    const ccEmoji = emojiUtils.getEmoji("clancastle");
    const xpEmoji = emojiUtils.getEmoji("xp");
    const cocEmoji = emojiUtils.getEmoji("coc");
    const whitefwaEmoji = emojiUtils.getEmoji("whitefwa");
    const sheildEmoji = emojiUtils.getEmoji("sheild");

    const thEmoji = emojiUtils.getEmoji(`th${data.townHallLevel}`) || "🏰";
    
    const leagueName = data.leagueTier?.name || data.league?.name || "Unranked";
    const dynLeagueEmoji = emojiUtils.getLeagueEmoji(leagueName, "throphy");

    const openInGame = `[Open in Game](https://link.clashofclans.com/en/?action=OpenPlayerProfile&tag=${encodeURIComponent(data.tag)})`;
    const fwaLink = `[Chocolate Clash](https://cc.fwafarm.com/cc_n/member.php?tag=${encodeURIComponent(data.tag)})`;

    const thImages = {
        11: "https://images-ext-1.discordapp.net/external/s4kOlzYIsU1oiUcyMxsjlrilmed2yhcJo1GzmLr9NBc/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-11.png?format=webp&quality=lossless&width=236&height=263",
        12: "https://images-ext-1.discordapp.net/external/PJBaOL8V_NLzuWrr3EQK54KO-l9iCVMm2AyDJcOvFps/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-12.png?format=webp&quality=lossless&width=229&height=254",
        13: "https://images-ext-1.discordapp.net/external/cnrNFhgjVfVCCYxYCInKziyJs4xqfShmw1rvQKP0gpI/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-13.png?format=webp&quality=lossless&width=255&height=263",
        14: "https://images-ext-1.discordapp.net/external/bekXanAALUUMv_M_tKV8TtRCh682CqWcxPMY4sHxeBE/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-14.png?format=webp&quality=lossless&width=255&height=271",
        15: "https://images-ext-1.discordapp.net/external/7n_mhahmF5iXGgrv7Ps2itUZQIDva-WeUTO2cGydh7Y/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-15.png?format=webp&quality=lossless&width=250&height=275",
        16: "https://images-ext-1.discordapp.net/external/3KA43gX30pOW3X8wugaS8eP5RswjPeNX07yqa12dh8s/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-16.png?format=webp&quality=lossless&width=690&height=864",
        17: "https://images-ext-1.discordapp.net/external/MILVrSQyhUmOWrxNJKMtcXTKmZcv37Yp3US-OmQ1lqI/https/assets.clashk.ing/home-base/town-hall-pics/town-hall-17.png?format=webp&quality=lossless&width=1030&height=1030",
        18: "https://cdn.discordapp.com/emojis/1440691198024224920.png"
    };

    const defaultThumbnail = "https://static.wikia.nocookie.net/clashofclans/images/6/6d/Town_Hall1.png";
    const thumbnailUrl = thImages[data.townHallLevel] || defaultThumbnail;

    return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`Clash of Clans - ${data.name}™`)
        .setThumbnail(thumbnailUrl)
        .setDescription(
            `**════ Profile Info ════**\n` +
            `**Tag:** \`${data.tag}\`\n` +
            `**Clan:** ${data.clan?.name || "None"} ${data.clan?.tag ? `(\`${data.clan.tag}\`)` : ""}\n` +
            `**Role:** ${formatRole(data.role)}\n` +
            `**League:** ${leagueName} ${dynLeagueEmoji}\n` +
            `**Linked to:** ${linkedUserText}\n` +
            `${thEmoji}:${data.townHallLevel}\t\t ${xpEmoji}:${data.expLevel}\t\t\n\n` +

            `**— Battles & Trophies —**\n` +
            `${throphyEmoji} **Trophies:** ${data.builderBaseTrophies || 0} / ${data.trophies || 0}\n` +
            `${cocwarEmoji} **Attack Wins:** ${data.attackWins || 0}\n` +
            `${sheildEmoji} **Defense Wins:** ${data.defenseWins || 0}\n` +
            `${cocEmoji} **War Stars:** ${data.warStars || 0}\n\n` +

            `**— Donations —**\n` +
            `${uparrowEmoji} **Donated:** ${data.donations}\n` +
            `${downarrowEmoji} **Received:** ${data.donationsReceived}\n` +
            `${graphEmoji} **Ratio:** ${(data.donations / (data.donationsReceived || 1)).toFixed(2)}\n\n` +

            `**— Key Achievements —**\n` +
            `${ccEmoji} **Total Donations:** ${data.achievements?.find(a => a.name === "Friend in Need")?.value || 0}\n` +
            `${throphyEmoji} **Best Trophies:** ${data.bestTrophies || 0}\n` +
            `${cgEmoji} **Clan Games:** ${data.achievements?.find(a => a.name === "Games Champion")?.value || 0}\n` +
            `${cocwarEmoji} **Capital Gold Raided:** ${data.achievements?.find(a => a.name === "Most Valuable Clanmate")?.value || 0}\n` +
            `${capitalgoldEmoji} **Capital Gold Donated:** ${data.achievements?.find(a => a.name === "Clan Capital Contributions")?.value || 0}\n\n` +

            `${arrowEmoji} ${openInGame}\n` +
            `${whitefwaEmoji} ${fwaLink}`
        )
        .setTimestamp();
}

module.exports = {
    name: "playerlookup",
    description: "Lookup a player by tag or Discord user with account selection dropdown",
    data: new SlashCommandBuilder()
        .setName('playerlookup')
        .setDescription('Lookup a player by tag or Discord user with account selection dropdown')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('The player tag to lookup')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The Discord user to lookup')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { data: dataManager, coc, emoji: emojiUtils } = context;
        const tagOption = interaction.options.getString('tag');
        const userOption = interaction.options.getUser('user');

        if (!tagOption && !userOption) {
            return interaction.reply({ content: "❌ Please provide either a `tag` or a `user`.", ephemeral: true });
        }

        await interaction.deferReply();

        const userData = dataManager.getUserData();
        let targetUserId = null;
        let initialTag = null;

        if (userOption) {
            targetUserId = userOption.id;
            const accounts = userData[targetUserId] || [];
            if (accounts.length === 0) {
                return interaction.editReply(`⚠️ <@${targetUserId}> has no linked Clash of Clans accounts.`);
            }
            initialTag = accounts[0].tag; // Default to first account
        } else {
            let tag = tagOption.startsWith('#') ? tagOption : `#${tagOption}`;
            tag = tag.toUpperCase();
            initialTag = tag;

            for (const [id, accounts] of Object.entries(userData)) {
                if (accounts.some(acc => acc.tag.toUpperCase() === tag)) {
                    targetUserId = id;
                    break;
                }
            }
        }

        let mainEmbed;
        try {
            mainEmbed = await getPlayerEmbed(initialTag, context);
        } catch (err) {
            return interaction.editReply(`❌ Error fetching data for \`${initialTag}\`: ${err.message}`);
        }

        const components = [];
        if (targetUserId) {
            const allAccounts = userData[targetUserId] || [];
            if (allAccounts.length > 1) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('lookup_select_account')
                    .setPlaceholder('Choose another account to view...')
                    .addOptions(allAccounts.slice(0, 25).map(acc => ({
                        label: acc.name,
                        description: acc.tag,
                        value: acc.tag,
                        default: acc.tag.toUpperCase() === initialTag.toUpperCase()
                    })));

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }
        }

        const message = await interaction.editReply({
            embeds: [mainEmbed],
            components: components
        });

        if (components.length > 0) {
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: "❌ You cannot use this menu.", ephemeral: true });
                }

                try {
                    await i.deferUpdate();
                    const selectedTag = i.values[0];
                    const newEmbed = await getPlayerEmbed(selectedTag, context);

                    const updatedOptions = userData[targetUserId].slice(0, 25).map(acc => ({
                        label: acc.name,
                        description: acc.tag,
                        value: acc.tag,
                        default: acc.tag === selectedTag
                    }));
                    
                    const updatedMenu = new StringSelectMenuBuilder()
                        .setCustomId('lookup_select_account')
                        .setPlaceholder('Choose another account to view...')
                        .addOptions(updatedOptions);

                    await i.editReply({
                        embeds: [newEmbed],
                        components: [new ActionRowBuilder().addComponents(updatedMenu)]
                    });
                } catch (err) {
                    console.error("Selection error:", err);
                    await i.followUp({ content: "❌ Error switching accounts.", ephemeral: true }).catch(() => {});
                }
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => {});
            });
        }
    }
};
