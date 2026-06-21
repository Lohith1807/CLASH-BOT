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
        .setName('kick')
        .setDescription('Kick a member from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
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
        const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

        if (
            !interaction.member.permissions.has(PermissionFlagsBits.KickMembers) &&
            !interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))
        ) {
            return interaction.reply({ content: '❌ You do not have permission to kick members.', ephemeral: true });
        }

        const target = interaction.options.getMember('target');
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) {
            return interaction.reply({ content: '❌ Could not find that member in this server.', ephemeral: true });
        }

        if (!target.kickable) {
            return interaction.reply({ content: '❌ I cannot kick that user. They may have higher permissions than me.', ephemeral: true });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });
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

        await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });

        const filter = i => i.user.id === interaction.user.id && i.customId.endsWith(interaction.id);
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async i => {
            if (i.customId.startsWith('kick_confirm_')) {
                try {
                    await target.send({
                        embeds: [new EmbedBuilder()
                            .setTitle(`You have been kicked from ${interaction.guild.name}`)
                            .setColor(0xFF8C00)
                            .setDescription(`**Reason:** ${reason}\n**Moderator:** ${interaction.user.tag}`)
                            .setTimestamp()]
                    }).catch(() => null);

                    await target.kick(`${reason} | Kicked by: ${interaction.user.tag}`);

                    const successEmbed = new EmbedBuilder()
                        .setTitle('👢 Member Kicked')
                        .setColor(0xFF8C00)
                        .setDescription(`**${targetUser.tag}** has been kicked from the server.`)
                        .addFields(
                            { name: '🎯 Target', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                            { name: '👮 Moderator', value: `${interaction.user.tag}`, inline: true },
                            { name: '📋 Reason', value: reason, inline: false }
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
                    await i.update({ content: `❌ Failed to kick: ${err.message}`, embeds: [], components: [] });
                }
            } else {
                await i.update({ content: '❎ Kick cancelled.', embeds: [], components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '⏱️ Kick confirmation timed out.', embeds: [], components: [] }).catch(() => null);
            }
        });
    }
};
