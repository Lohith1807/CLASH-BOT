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

const clanEntry     = require('../../../utils/tickets/embeds/clanEntry');
const repApply      = require('../../../utils/tickets/embeds/repApply');
const staffApply    = require('../../../utils/tickets/embeds/staffApply');
const allianceJoin  = require('../../../utils/tickets/embeds/allianceJoin');
const helpAssistance = require('../../../utils/tickets/embeds/helpAssistance');
const warClanEntry  = require('../../../utils/tickets/embeds/warClanEntry');

// Map option values → ticket config used by ticketHandler
const TICKET_MAP = {
    fwa:          { type: 'FWA-Entry',        embed: clanEntry,      appId: 'fwa-entry'       },
    war:          { type: 'War-Entry',        embed: warClanEntry,   appId: 'war-entry'       },
    rep:          { type: 'Rep-Apply',        embed: repApply,       appId: 'rep-apply'       },
    staff:        { type: 'Staff-Apply',      embed: staffApply,     appId: 'staff-apply'     },
    alliance_join:{ type: 'Alliance-Join',    embed: allianceJoin,   appId: 'alliance-join'   },
    help:         { type: 'Help-Assistance',  embed: helpAssistance, appId: 'help-assistance' },
};

const EMOJI_NAMES = {
    book:   'book',
    mem:    'mem',
    delete: 'delete',
};

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
                    { name: '🏅 FWA Entry',       value: 'fwa'          },
                    { name: '⚔️ War Entry',        value: 'war'          },
                    { name: '👑 Rep Apply',         value: 'rep'          },
                    { name: '🛡️ Staff Apply',       value: 'staff'        },
                    { name: '🩸 Alliance Join',     value: 'alliance_join'},
                    { name: '❓ Help / Assistance', value: 'help'         }
                )
        ),

    async execute(interaction, context) {
        const { client, config, emoji: emojiUtils } = context;
        const { guild, member } = interaction;

        // ── Permission check: Admin or Staff only ──────────────────────────
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS  && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            return interaction.reply({
                content: '❌ Only **Admins** or **Staff** can use this command.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetUser   = interaction.options.getUser('user');
        const ticketTypeKey = interaction.options.getString('type');
        const ticketConfig = TICKET_MAP[ticketTypeKey];

        if (!ticketConfig) {
            return interaction.editReply({ content: '❌ Unknown ticket type.' });
        }

        const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;
        const { type: ticketType, embed: embedModule, appId } = ticketConfig;

        // ── Duplicate check ────────────────────────────────────────────────
        const existingChannel = guild.channels.cache.find(
            c => c.name === `${ticketType.toLowerCase()}-${targetUser.username.toLowerCase()}`
        );
        if (existingChannel) {
            return interaction.editReply({
                content: `⚠️ **${targetUser.username}** already has an open ticket of this type: ${existingChannel}`
            });
        }

        // ── Resolve emojis ─────────────────────────────────────────────────
        let appEmojis = null;
        const getAppEmoji = async (name) => {
            if (!appEmojis) appEmojis = await client.application.emojis.fetch();
            const appEmoji = appEmojis.find(e => e.name === name);
            if (appEmoji) return appEmoji;
            const localEmoji = emojiUtils.getEmojiObject(name);
            return localEmoji || { id: null, name };
        };

        const emojis = {};
        for (const [key, name] of Object.entries(EMOJI_NAMES)) {
            emojis[key] = await getAppEmoji(name);
        }

        // ── Channel permission overwrites ──────────────────────────────────
        const overwrites = [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: targetUser.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ],
            }
        ];

        if (config.STAFF_ROLE_IDS && Array.isArray(config.STAFF_ROLE_IDS)) {
            config.STAFF_ROLE_IDS.forEach(roleId => {
                if (roleId && roleId.trim()) {
                    overwrites.push({
                        id: roleId.trim(),
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ],
                    });
                }
            });
        }

        // Extra overwrite for Help tickets
        if (ticketTypeKey === 'help') {
            overwrites.push({
                id: '1514535148119392377',
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ],
            });
        }

        try {
            // ── Create the channel ─────────────────────────────────────────
            const channel = await guild.channels.create({
                name: `${ticketType}-${targetUser.username}`,
                type: ChannelType.GuildText,
                topic: targetUser.id,
                parent: CATEGORY_ID,
                permissionOverwrites: overwrites,
            });

            // ── Build the welcome embed ────────────────────────────────────
            const welcomeEmbed = embedModule.getEmbed(emojis);

            welcomeEmbed
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Blood Alliance Management', iconURL: guild.iconURL() })
                .setColor('Random')
                .setTimestamp();

            // ── Buttons — identical layout to the normal ticket panel ──────
            const appRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`start_app_${appId}`)
                    .setLabel('Start Application')
                    .setEmoji(emojis.book?.id || '📝')
                    .setStyle(ButtonStyle.Success)
            );

            // Row 2: profile viewer, claim, delete  (approve / reject / timer
            // are slash commands — /approve  /reject  /set-timer)
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_user_profile:${targetUser.id}`)
                    .setEmoji(emojis.mem?.id || '👤')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('Claim')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Delete Ticket')
                    .setEmoji(emojis.delete?.id || '🔒')
                    .setStyle(ButtonStyle.Secondary)
            );

            // ── Mentions ───────────────────────────────────────────────────
            const mentionRoles = [targetUser.toString()];
            const execStaffRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[2]
                ? config.STAFF_ROLE_IDS[2].trim()
                : null;
            if (execStaffRoleId) mentionRoles.push(`<@&${execStaffRoleId}>`);

            const mentionContent = Array.from(new Set(mentionRoles)).join(' | ');

            // Ghost-ping staff mod role (same behaviour as the panel)
            const serverModRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0]
                ? config.STAFF_ROLE_IDS[0].trim()
                : null;
            const ghostPing = serverModRoleId ? ` ||<@&${serverModRoleId}>||` : '';

            await channel.send({
                content: mentionContent + ghostPing,
                embeds: [welcomeEmbed],
                components: [appRow, actionRow]
            });

            // ── Send log to ticket log channel ─────────────────────────────
            const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
            if (logChannelId) {
                const logChannel = guild.channels.cache.get(logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setAuthor({
                            name: interaction.user.username,
                            iconURL: interaction.user.displayAvatarURL()
                        })
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

            // ── Confirm to command user ────────────────────────────────────
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('✅ Ticket Created')
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
                content: '❌ There was an error creating the ticket. Please check bot permissions and category ID.'
            });
        }
    }
};
