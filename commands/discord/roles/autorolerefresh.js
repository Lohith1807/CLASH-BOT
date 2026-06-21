const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { syncUser } = require('../../../utils/autoRoleManager.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorolerefresh')
        .setDescription('Re-check and sync alliance roles for a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to refresh (defaults to yourself)')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { client, config, coc, data: dataManager } = context;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = interaction.member;

        if (targetUser.id !== interaction.user.id) {
            const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
            const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ You can only refresh your own roles. Staff permission required to refresh others.',
                    ephemeral: true
                });
            }
        }

        await interaction.deferReply({ ephemeral: true });

        const clanRoles = dataManager.getClanRoles();
        const monitoredClans = {};
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.roleId) {
                monitoredClans[tag.toUpperCase()] = info;
            }
        }

        const LOG_CHANNEL_ID = config.AUTOROLE_LOG_CHANNEL_ID || process.env.AUTOROLE_LOG_CHANNEL_ID;
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

        try {
            const result = await syncUser(client, config, coc, dataManager, targetUser.id, monitoredClans, logChannel);

            if (!result) {
                return interaction.editReply({
                    content: `⚠️ Could not check **${targetUser.username}**. They may not have any linked accounts or are not in the server.`
                });
            }

            const guild = await client.guilds.fetch(config.GUILD_ID).catch(() => null);
            const targetMember = guild ? await guild.members.fetch(targetUser.id).catch(() => null) : null;

            const currentAllianceRoles = [];
            if (targetMember) {
                for (const [tag, info] of Object.entries(monitoredClans)) {
                    if (info.roleId && targetMember.roles.cache.has(info.roleId)) {
                        currentAllianceRoles.push(`<@&${info.roleId}> (${info.nickName || tag})`);
                    }
                }
            }

            const userData = dataManager.getUserData();
            const accounts = userData[targetUser.id] || [];

            const accountDetails = await Promise.all(
                accounts.map(async acc => {
                    try {
                        const player = await coc.getPlayer(acc.tag);
                        const clan = player.clan;
                        const inAlliance = clan && monitoredClans[clan.tag.toUpperCase()];
                        return {
                            name: player.name,
                            tag: player.tag,
                            clan: clan ? `${clan.name} (${clan.tag})` : 'No Clan',
                            inAlliance: !!inAlliance,
                            allianceName: inAlliance ? (monitoredClans[clan.tag.toUpperCase()].nickName || clan.tag) : null
                        };
                    } catch (e) {
                        return { name: acc.name || acc.tag, tag: acc.tag, clan: 'API Error', inAlliance: false, allianceName: null };
                    }
                })
            );

            const statusEmbed = new EmbedBuilder()
                .setTitle(`🔍 Role Check — ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setColor(result.hasChanges ? 0xE74C3C : 0x2ECC71)
                .setTimestamp();

            const accountLines = accountDetails.map(a =>
                `${a.inAlliance ? '✅' : '❌'} \`${a.tag}\` — **${a.name}** → ${a.clan}${a.allianceName ? ` *(${a.allianceName})*` : ''}`
            ).join('\n') || 'No linked accounts';
            statusEmbed.addFields({ name: '🔗 Linked Accounts', value: accountLines, inline: false });

            const rolesValue = currentAllianceRoles.length > 0
                ? currentAllianceRoles.join('\n')
                : 'No alliance roles currently held';
            statusEmbed.addFields({ name: '🎭 Current Alliance Roles', value: rolesValue, inline: false });

            if (result.hasChanges) {
                const changeLines = [];
                if (result.rolesAdded?.length > 0) changeLines.push(`**Added:** ${result.rolesAdded.join(', ')}`);
                if (result.rolesRemoved?.length > 0) changeLines.push(`**Removed:** ${result.rolesRemoved.join(', ')}`);
                statusEmbed.addFields({ name: '⚡ Changes Made This Sync', value: changeLines.join('\n'), inline: false });
            } else {
                statusEmbed.addFields({ name: '⚡ Changes', value: 'No role changes made this sync', inline: false });
            }

            await interaction.editReply({ embeds: [statusEmbed] });

        } catch (error) {
            console.error('Error in autorolerefresh:', error);
            await interaction.editReply({
                content: `❌ An error occurred: ${error.message}`
            });
        }
    }
};
