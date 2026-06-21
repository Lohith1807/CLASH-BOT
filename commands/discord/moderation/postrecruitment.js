const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('postrecruitment')
        .setDescription('Manually post a recruitment ad for a clan')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('The clan to post recruitment for (Only shows clans with auto-post disabled)')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('spots')
                .setDescription('Number of spots available (e.g. 5)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('townhalls')
                .setDescription('Required TH levels separated by comma (e.g. 15,16)')
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const choices = [];
        for (const [tag, roleInfo] of Object.entries(clanRoles)) {
            if (roleInfo.autoPostRecruitment === false) {
                const name = roleInfo.nickName || tag;
                if (name.toLowerCase().includes(focusedValue) || tag.toLowerCase().includes(focusedValue)) {
                    choices.push({ name: `${name} (${tag})`, value: tag });
                }
            }
        }
        
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction, context) {
        const { options, guild, member } = interaction;
        const { coc, data: dataManager, emoji: emojiUtils, config } = context;
        const { getEmoji } = emojiUtils;
        const leaderEmoji = getEmoji("fwalead");

        const tag = options.getString('clan');
        const spotsInput = options.getInteger('spots');
        const thInput = options.getString('townhalls');

        const clanRoles = dataManager.getClanRoles();
        const roleInfo = clanRoles[tag];

        if (!roleInfo) {
            return interaction.reply({ content: "❌ Clan not found in configuration.", ephemeral: true });
        }

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only Staff or Admins can use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const clan = await coc.getClan(tag);
            const isFwa = roleInfo.clanType === "fwa";

            const thLevels = thInput.split(',').map(s => s.trim());
            const thEmojiStr = thLevels.map(lvl => getEmoji(`th${lvl}`) || `TH${lvl}`).join(' ');

            const clanIcon = isFwa ? getEmoji("whitefwa") : getEmoji("cocfight");
            const cwlType = isFwa ? "Lazy CWL" : "Serious CWL";
            const clanTypeText = isFwa ? "FWA Clan" : "WarClan";

            const embed = new EmbedBuilder()
                .setTitle(`${getEmoji("gtick")} RECRUITMENT OPEN`)
                .setColor(0x2ECC71)
                .setDescription(
                    `${clanIcon} **${clan.name}** is now recruiting!\n\n` +
                    `${leaderEmoji} **Accepting:** ${thEmojiStr}\n` +
                    `${getEmoji("mem")} **Spots opened:** ${spotsInput}\n` +
                    `${getEmoji("coc")} **${clanTypeText}**\n` +
                    `${getEmoji("cwl")} **${cwlType}**\n\n` +
                    `${getEmoji("heart")} **Open a ticket to apply.**`
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_recruit:${tag}`)
                    .setLabel(`Join ${clan.name}`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(getEmoji('coc') || '🛡️')
            );

            const RECRUIT_CHANNEL_ID = process.env.RECRUIT_CHANNEL_ID || config.RECRUIT_CHANNEL_ID;
            const channel = await guild.channels.fetch(RECRUIT_CHANNEL_ID).catch(() => null);

            if (!channel) {
                return interaction.editReply({ content: "❌ Recruitment channel not found. Please check bot configuration." });
            }

            const sentMsg = await channel.send({ embeds: [embed], components: [row] });

            const recruitmentManager = require('../../../utils/recruitmentManager');
            const statusData = recruitmentManager.getStatusData();
            statusData[tag] = {
                status: "open",
                messageId: sentMsg.id,
                openedAt: Date.now()
            };
            recruitmentManager.saveStatusData(statusData);

            await interaction.editReply({ content: `✅ Recruitment ad for **${clan.name}** has been posted to ${channel}!` });

        } catch (err) {
            console.error("Manual recruitment post error:", err);
            await interaction.editReply({ content: `❌ Error posting recruitment: ${err.message}` });
        }
    }
};
