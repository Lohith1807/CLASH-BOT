const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const clanEntry      = require('../../../utils/tickets/embeds/clanEntry');
const repApply       = require('../../../utils/tickets/embeds/repApply');
const staffApply     = require('../../../utils/tickets/embeds/staffApply');
const allianceJoin   = require('../../../utils/tickets/embeds/allianceJoin');
const helpAssistance = require('../../../utils/tickets/embeds/helpAssistance');
const warClanEntry   = require('../../../utils/tickets/embeds/warClanEntry');

const CWL_STAFF_ROLE_ID = '1448265928503726161';

// Map option values to ticket config
const TICKET_MAP = {
    fwa:             { type: 'FWA-Entry',       embed: clanEntry,      appId: 'fwa-entry'       },
    war:             { type: 'War-Entry',        embed: warClanEntry,   appId: 'war-entry'       },
    rep:             { type: 'Rep-Apply',        embed: repApply,       appId: 'rep-apply'       },
    staff:           { type: 'Staff-Apply',      embed: staffApply,     appId: 'staff-apply'     },
    alliance_join:   { type: 'Alliance-Join',    embed: allianceJoin,   appId: 'alliance-join'   },
    help_general:    { type: 'Help-Assistance',  embed: helpAssistance, appId: 'help-assistance' },
    help_cwl:        { type: 'cwl-assistance',   embed: helpAssistance, appId: 'help-assistance', cwlOnly: true  },
    help_clan_change:{ type: 'clan-assistance',  embed: helpAssistance, appId: 'help-assistance' },
};

const EMOJI_NAMES = { book: 'book', mem: 'mem', delete: 'delete' };

module.exports = {
    name: 'create-ticket',
    description: 'Manually create a ticket for a user (Admin/Staff only)',

    data: new SlashCommandBuilder()
        .setName('create-ticket')
        .setDescription('Manually create a ticket for a user (Admin/Staff only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to open the ticket for')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('The type of ticket to create')
                .setRequired(true)
                .addChoices(
                    { name: 'FWA Entry',             value: 'fwa'              },
                    { name: 'War Entry',              value: 'war'              },
                    { name: 'Rep Apply',              value: 'rep'              },
                    { name: 'Staff Apply',            value: 'staff'            },
                    { name: 'Alliance Join',          value: 'alliance_join'    },
                    { name: 'Help - General Support', value: 'help_general'     },
                    { name: 'Help - CWL Assistance',  value: 'help_cwl'         },
                    { name: 'Help - Clan Change',     value: 'help_clan_change' }
                )
        ),

    async execute(interaction, context) {
        const { config, emoji: emojiUtils } = context;
        const { guild, member } = interaction;

        // Permission check
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS  && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            return interaction.reply({
                content: 'Only Admins or Staff can use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        const targetUser     = interaction.options.getUser('user');
        const ticketTypeKey  = interaction.options.getString('type');
        const ticketConfig   = TICKET_MAP[ticketTypeKey];

        if (!ticketConfig) {
            return interaction.editReply({ content: 'Unknown ticket type.' });
        }

        const CATEGORY_ID = config.TICKET_CATEGORY_ID;
        const { type: ticketType, embed: embedModule, appId, cwlOnly } = ticketConfig;

        // ticketType already has the correct prefix (cwl-assistance, clan-assistance, Help-Assistance)
        const resolvedChannelName = (ticketType + '-' + targetUser.username).toLowerCase();

        // Duplicate check
        const existingChannel = guild.channels.cache.find(
            c => c.name === resolvedChannelName
        );
        if (existingChannel) {
            return interaction.editReply({
                content: `**${targetUser.username}** already has an open ticket of this type: ${existingChannel}`
            });
        }

        // Resolve emojis from emoji.js (sync, no API call)
        const emojis = {};
        for (const [key, name] of Object.entries(EMOJI_NAMES)) {
            emojis[key] = emojiUtils.getEmojiObject(name) || { id: null, name };
        }

        // Channel permission overwrites
        const overwrites = [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], type: 0 },
            {
                id: targetUser.id,
                type: 1,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ],
            }
        ];

        if (cwlOnly) {
            // CWL: restrict to CWL staff role + server mod + admins only
            overwrites.push({
                id: CWL_STAFF_ROLE_ID,
                type: 0,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
            });
            const serverModRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? config.STAFF_ROLE_IDS[0].trim() : null;
            if (serverModRoleId) {
                overwrites.push({ id: serverModRoleId, type: 0, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
            }
            if (config.ADMIN_ROLE_IDS && Array.isArray(config.ADMIN_ROLE_IDS)) {
                config.ADMIN_ROLE_IDS.forEach(roleId => {
                    if (roleId && roleId.trim() && !overwrites.find(o => o.id === roleId.trim())) {
                        overwrites.push({ id: roleId.trim(), type: 0, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
                    }
                });
            }
        } else {
            // All other types: add all staff roles
            if (config.STAFF_ROLE_IDS && Array.isArray(config.STAFF_ROLE_IDS)) {
                config.STAFF_ROLE_IDS.forEach((roleId, index) => {
                    if (roleId && roleId.trim()) {
                        // help_general: only server mod (0) + t-mod (1) — exec staff (2+) excluded
                        if (ticketTypeKey === 'help_general' && index >= 2) return;
                        overwrites.push({ id: roleId.trim(), type: 0, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
                    }
                });
            }
            // Extra exe-staff overwrite for general help and clan change
            if (ticketTypeKey === 'help_general' || ticketTypeKey === 'help_clan_change') {
                overwrites.push({
                    id: '1514535148119392377',
                    type: 0,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                });
            }
        }

        try {
            const channel = await guild.channels.create({
                name: resolvedChannelName,
                type: ChannelType.GuildText,
                topic: targetUser.id,
                parent: CATEGORY_ID,
                permissionOverwrites: overwrites,
            });

            const welcomeEmbed = embedModule.getEmbed(emojis);

            // Override title for help sub-types
            if (ticketTypeKey === 'help_cwl') {
                welcomeEmbed.setTitle('CWL Assistance');
            } else if (ticketTypeKey === 'help_clan_change') {
                welcomeEmbed.setTitle('Clan Change Request');
            } else if (ticketTypeKey === 'help_general') {
                welcomeEmbed.setTitle('General Support');
            }

            welcomeEmbed
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Blood Alliance Management', iconURL: guild.iconURL() })
                .setColor('Random')
                .setTimestamp();

            const appRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_app_' + appId)
                    .setLabel('Start Application')
                    .setEmoji({ id: emojis.book && emojis.book.id, animated: false })
                    .setStyle(ButtonStyle.Success)
            );

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_user_profile:' + targetUser.id)
                    .setEmoji({ id: emojis.mem && emojis.mem.id, animated: false })
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('Claim')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Delete Ticket')
                    .setEmoji({ id: emojis.delete && emojis.delete.id, animated: false })
                    .setStyle(ButtonStyle.Secondary)
            );

            // Mentions
            const mentionRoles = [targetUser.toString()];
            const execStaffRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[2] ? config.STAFF_ROLE_IDS[2].trim() : null;
            // help_general: exec staff excluded — only server mod + welcomer staff handle these
            if (execStaffRoleId && ticketTypeKey !== 'help_general') mentionRoles.push(`<@&${execStaffRoleId}>`);
            const mentionContent = Array.from(new Set(mentionRoles)).join(' | ');

            // Ghost-pings
            const serverModRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? config.STAFF_ROLE_IDS[0].trim() : null;
            const ghostPings = [];
            if (serverModRoleId) ghostPings.push(`<@&${serverModRoleId}>`);
            if (ticketTypeKey === 'help_general' || ticketTypeKey === 'help_clan_change') {
                ghostPings.push('<@&1514535148119392377>');
            }
            if (ticketTypeKey === 'help_cwl') {
                ghostPings.push(`<@&${CWL_STAFF_ROLE_ID}>`);
            }
            const ghostPing = ghostPings.length > 0 ? ' ||' + ghostPings.join(' ') + '||' : '';

            await channel.send({
                content: mentionContent + ghostPing,
                embeds: [welcomeEmbed],
                components: [appRow, actionRow]
            });

            // Log
            const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                        .setTitle('Ticket Created via Command')
                        .setDescription(
                            `• **Created by:** ${interaction.user} (${interaction.user.username})\n` +
                            `• **Created for:** ${targetUser} (${targetUser.username})\n` +
                            `• **Type:** ${ticketType}\n` +
                            `• **Channel:** ${channel}\n` +
                            `• **Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
                        )
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setColor(0x2b2d31)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] }).catch(err =>
                        console.error('[create-ticket] Log Error:', err)
                    );
                }
            }

            // Confirm
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('Ticket Created')
                .setDescription(
                    `**Ticket for:** ${targetUser} (${targetUser.username})\n` +
                    `**Type:** ${ticketType}\n` +
                    `**Channel:** ${channel}\n` +
                    `**Created by:** ${interaction.user}`
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error('[create-ticket] Error:', error);
            await interaction.editReply({
                content: 'There was an error creating the ticket. Please check bot permissions and category ID.'
            });
        }
    }
};
