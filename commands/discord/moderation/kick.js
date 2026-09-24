const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The member to kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the kick')
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
            return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: [MessageFlags.Ephemeral] });
        }

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ Could not find that member in this server.', flags: [MessageFlags.Ephemeral] });
        }

        if (!target.kickable) {
            return interaction.reply({ content: '❌ I cannot kick that user. They may have higher permissions than me.', flags: [MessageFlags.Ephemeral] });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot kick yourself.', flags: [MessageFlags.Ephemeral] });
        }

        const confirmEmbed = new EmbedBuilder()
            .setTitle('👢 Confirm Kick')
            .setColor(0xFF8C00)
            .setDescription(
                `Are you sure you want to **kick** ${targetUser} (${targetUser.tag})?\n\n` +
                `**Reason:** ${reason}\n\n` +
                `⚠️ They will be able to rejoin the server with an invite.`
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`kick_confirm_${targetUser.id}_${interaction.id}`)
                .setLabel('👢 Confirm Kick')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`kick_cancel_${interaction.id}`)
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: [MessageFlags.Ephemeral] });

        const filter = i => i.user.id === interaction.user.id && i.customId.endsWith(interaction.id);
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            if (i.customId.startsWith('kick_confirm_')) {
                try {
                    await target.send({
                        embeds: [new EmbedBuilder()
                            .setTitle(`You have been kicked from ${interaction.guild.name}`)
                            .setColor(0xFF8C00)
                            .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
                            .setTimestamp()]
                    }).catch(() => null);

                    const auditReason = `${reason.slice(0, 450)} | Kicked by: ${interaction.user.tag}`;
                    await target.kick(auditReason);

                    const successEmbed = new EmbedBuilder()
                        .setTitle('👢 Member Kicked')
                        .setColor(0xFF8C00)
                        .setDescription(`**${targetUser.tag}** has been kicked from the server.`)
                        .addFields(
                            { name: '🎯 Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                            { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                            { name: '📋 Reason', value: reason, inline: false }
                        )
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setTimestamp();

                    await i.editReply({ embeds: [successEmbed], components: [] });

                    const logChannelId = config.LOG_CHANNEL_ID;
                    if (logChannelId) {
                        const logChannel = interaction.guild.channels.cache.get(logChannelId)
                            || await interaction.guild.channels.fetch(logChannelId).catch(() => null);
                        if (logChannel) await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                } catch (err) {
                    await i.editReply({ content: `❌ Failed to kick: ${err.message}`, embeds: [], components: [] });
                }
            } else {
                await i.editReply({ content: '❎ Kick cancelled.', embeds: [], components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '⏱️ Kick confirmation timed out.', embeds: [], components: [] }).catch(() => null);
            }
        });
    }
};
