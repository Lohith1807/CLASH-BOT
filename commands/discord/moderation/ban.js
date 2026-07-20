const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('delete_days')
                .setDescription('Number of days of messages to delete (0–7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { config } = context;
        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        if (!targetUser) {
            return interaction.reply({ content: '❌ Could not find that user.', ephemeral: true });
        }

        if (target && !target.bannable) {
            return interaction.reply({ content: '❌ I cannot ban that user. They may have higher permissions than me.', ephemeral: true });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot ban yourself.', ephemeral: true });
        }

        const confirmEmbed = new EmbedBuilder()
            .setTitle('🔨 Confirm Ban')
            .setColor(0xFF0000)
            .setDescription(
                `Are you sure you want to **ban** ${targetUser} (${targetUser.tag})?\n\n` +
                `**Reason:** ${reason}\n` +
                `**Delete Message History:** ${deleteDays} day(s)\n\n` +
                `⚠️ This will permanently remove them from the server.`
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ban_confirm_${targetUser.id}_${interaction.id}`)
                .setLabel('🔨 Confirm Ban')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`ban_cancel_${interaction.id}`)
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });

        const filter = i => i.user.id === interaction.user.id && i.customId.endsWith(interaction.id);
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId.startsWith('ban_confirm_')) {
                try {
                    if (target) {
                        await target.send({
                            embeds: [new EmbedBuilder()
                                .setTitle(`You have been banned from ${interaction.guild.name}`)
                                .setColor(0xFF0000)
                                .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
                                .setTimestamp()]
                        }).catch(() => null);
                    }

                    await interaction.guild.members.ban(targetUser.id, {
                        reason: `${reason} | Banned by: ${interaction.user.tag}`,
                        deleteMessageSeconds: deleteDays * 86400
                    });

                    const successEmbed = new EmbedBuilder()
                        .setTitle('🔨 Member Banned')
                        .setColor(0xFF0000)
                        .setDescription(`**${targetUser.tag}** has been banned from the server.`)
                        .addFields(
                            { name: '🎯 Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                            { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                            { name: '📋 Reason', value: reason, inline: false },
                            { name: '🗑️ Messages Deleted', value: `${deleteDays} day(s)`, inline: true }
                        )
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    await i.update({ embeds: [successEmbed], components: [] });

                    const logChannelId = config.LOG_CHANNEL_ID;
                    if (logChannelId) {
                        const logChannel = interaction.guild.channels.cache.get(logChannelId);
                        if (logChannel) await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                } catch (err) {
                    await i.update({ content: `❌ Failed to ban: ${err.message}`, embeds: [], components: [] });
                }
            } else {
                await i.update({ content: '❎ Ban cancelled.', embeds: [], components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '⏱️ Ban confirmation timed out.', embeds: [], components: [] }).catch(() => null);
            }
        });
    }
};
