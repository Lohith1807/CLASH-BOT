const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const transcripts = require('discord-html-transcripts');

const clanEntry = require('./embeds/clanEntry');
const repApply = require('./embeds/repApply');
const staffApply = require('./embeds/staffApply');
const allianceJoin = require('./embeds/allianceJoin');
const helpAssistance = require('./embeds/helpAssistance');
const warClanEntry = require('./embeds/warClanEntry');
const staffTicketTracker = require('../staffTicketTracker');

const EMOJI_NAMES = {
    check: 'coc',
    orange_dot: 'orangedot',
    blue_dot: 'bluedot',
    cyan_dot: 'cyandot',
    pink_dot: 'pinkdot',
    arrow: 'rarroww',
    book: 'book',
    staff_icon: 'wow',
    alliance_icon: 'blood',
    chat: 'question',
    chain: 'chain',
    approve: 'tickred',
    decline: 'bluex',
    clancastle: 'ccw',
    timer: 'alaram',
    rules: 'book',
    delete: 'delete',
    fwa: 'whitefwa',
    war: 'cocfight',
    mem: 'mem'
};

/**
 * Helper to send logs to the log channel
 */
async function sendLog(guild, embed, config, file = null, content = null) {
    const logChannelId = config.TICKET_LOG_CHANNEL_ID || config.LOG_CHANNEL_ID;
    if (!logChannelId) return;
    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const payload = { embeds: [embed] };
    if (content) payload.content = content;
    if (file) payload.files = [file];

    await logChannel.send(payload).catch(err => console.error('Log Error:', err));
}

async function handleTicketInteraction(interaction, context) {
    if (interaction.channel && interaction.channel.deleting) {
        await interaction.reply({
            content: 'noob pervert go to chrome and tap there not here again and again ',
            flags: [MessageFlags.Ephemeral]
        }).catch(() => null);
        return true;
    }

    const { customId, guild, user, member } = interaction;
    const { client, config, emoji: emojiUtils, coc } = context;
    const { getEmoji } = emojiUtils;

    const STAFF_ROLE_ID = config.STAFF_ROLE_IDS ? config.STAFF_ROLE_IDS[0] : null;
    const ADMIN_ROLE_ID = config.ADMIN_ROLE_IDS ? config.ADMIN_ROLE_IDS[0] : null;
    const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;

    let appEmojis = null;
    const getAppEmoji = async (name) => {
        if (!appEmojis) appEmojis = await client.application.emojis.fetch();
        const appEmoji = appEmojis.find(e => e.name === name);
        if (appEmoji) return appEmoji;

        const localEmoji = emojiUtils.getEmojiObject(name);
        return localEmoji || { id: null, name: name };
    };

    if (interaction.isButton() && customId.startsWith('start_app_')) {
        const ticketOwnerId = interaction.channel.topic;
        if (ticketOwnerId && ticketOwnerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Only the ticket creator can start the application.', flags: [MessageFlags.Ephemeral] });
        }

        const type = customId.replace('start_app_', '');
        const modal = new ModalBuilder()
            .setCustomId(`submit_app_${type}`)
            .setTitle('Application Form');

        if (type === 'fwa-entry' || type === 'clan-entry') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1.Where did you find Blood Alliance?').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2.Share Your FWA Base').setPlaceholder("Type 'Yes' and upload screenshot later").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3.Upload Your Profile').setPlaceholder("Type 'Yes' and upload screenshot later").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4.First time of FWA? How long you Plan to stay?').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
        } else if (type === 'war-entry') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1. Where did you find Blood Alliance?').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2. Share Your War Base').setPlaceholder("Type 'Yes' and upload screenshot later").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3. Upload War Performance').setPlaceholder("Type 'Yes' and upload screenshot later").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4. Hero availability').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('5. Why do you want to join?').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
        } else if (type === 'rep-apply') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1. FWA CC Profile link').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2. Location & Timezone').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3. How long you have FWA Clan Experience').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4. Any FWA Rep Experience').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('5. Motivation Of Being a Rep').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
        } else if (type === 'staff-apply') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1.What is Your Age').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2.What Role you are applying for?').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3.How long you are in FWA or current clan?').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4.Motivation & Daily Activity').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('5.Any Staff Experience? or Staff in Any other servers?').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
        } else if (type === 'alliance-join') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1.Where you found Blood Alliance').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2.What are you looking for from us?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3.Clan Type (FWA or War or FUTURE FWA)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4.Your Clan Members already in server? or You Want to get them?').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('5.Are You Okay with alliance rules?').setStyle(TextInputStyle.Short).setRequired(true))
            );
        } else if (type === 'help-assistance') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('How can we help?').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
        }
        
        await interaction.showModal(modal);
        return true;
    }

    if (interaction.isModalSubmit() && customId.startsWith('submit_app_')) {
        const type = customId.replace('submit_app_', '');
        let q1, q2, q3, q4, q5;
        try { q1 = interaction.fields.getTextInputValue('q1'); } catch (e) {}
        try { q2 = interaction.fields.getTextInputValue('q2'); } catch (e) {}
        try { q3 = interaction.fields.getTextInputValue('q3'); } catch (e) {}
        try { q4 = interaction.fields.getTextInputValue('q4'); } catch (e) {}
        try { q5 = interaction.fields.getTextInputValue('q5'); } catch (e) {}

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${interaction.user.username}'s Application`, iconURL: interaction.user.displayAvatarURL() })
            .setColor(0x00FF00)
            .setTimestamp();

        if (type === 'fwa-entry' || type === 'clan-entry') {
            embed.addFields(
                { name: '1. Where did you find Blood Alliance?', value: q1 || 'N/A' },
                { name: '2. Upload a screenshot of your current FWA base.', value: q2 || 'N/A' },
                { name: '3. Send a screenshot of your Clash of Clans. it shows My Profile.', value: q3 || 'N/A' },
                { name: '4. First time joining FWA? Read all FWA & Mention how long you plan to stay', value: q4 || 'N/A' }
            );
        } else if (type === 'war-entry') {
            embed.addFields(
                { name: '1. Where did you find Blood Alliance?', value: q1 || 'N/A' },
                { name: '2. Share Your War Base', value: q2 || 'N/A' },
                { name: '3. Upload War Performance(Send a screenshot showing your War Stars and best attacks.)', value: q3 || 'N/A' },
                { name: '4. Ensure your heroes are available or you have books to finish them.', value: q4 || 'N/A' },
                { name: '5. Why do you want to join?', value: q5 || 'N/A' }
            );
        } else if (type === 'rep-apply') {
            embed.addFields(
                { name: '1. Share Your FWA CC Profile link', value: q1 || 'N/A' },
                { name: '2. Location & Timezone (Where are you from and which time zone are you in?)', value: q2 || 'N/A' },
                { name: '3. FWA Clan Experience (Are you currently in any FWA clan, or have you been in one before?)', value: q3 || 'N/A' },
                { name: '4. FWA Rep Experience (Have you been a Rep in any clan before? If yes, please mention the clan(s).)', value: q4 || 'N/A' },
                { name: '5. Motivation(Why do you want to be a Rep in our alliance?)', value: q5 || 'N/A' }
            );
        } else if (type === 'staff-apply') {
            embed.addFields(
                { name: '1. Your Age', value: q1 || 'N/A' },
                { name: '2. What role are you applying for?', value: q2 || 'N/A' },
                { name: '3. How long have you been in FWA or your current clan?', value: q3 || 'N/A' },
                { name: '4. Why do you want to join the staff, and how active are you daily?', value: q4 || 'N/A' },
                { name: '5. Past Experience (Have you held any staff roles before? If yes, list them.)', value: q5 || 'N/A' }
            );
        } else if (type === 'alliance-join') {
            embed.addFields(
                { name: 'Where you found Blood Alliance', value: q1 || 'N/A' },
                { name: 'Why do you want your clan to join?', value: q2 || 'N/A' },
                { name: 'Clan Type (FWA or War)', value: q3 || 'N/A' },
                { name: 'Members already in server?', value: q4 || 'N/A' },
                { name: 'Okay with alliance rules?', value: q5 || 'N/A' }
            );
        } else if (type === 'help-assistance') {
            embed.addFields(
                { name: 'Issue Description', value: q1 || 'N/A' }
            );
        }

        let content = `**<@${interaction.user.id}> Application Submitted!**`;
        if (type === 'fwa-entry' || type === 'clan-entry') {
            content += '\n\n**🛑 ACTION REQUIRED: Please upload your FWA Base and Profile screenshots into this chat now!**';
        } else if (type === 'war-entry') {
            content += '\n\n**🛑 ACTION REQUIRED: Please upload your War Base, Profile, and War Stats (Performance) screenshots into this chat now!**';
        }

        await interaction.reply({ content, embeds: [embed] });
        
        // Remove the "Start Application" button after submission
        try {
            const originalMsg = await interaction.message.fetch();
            if (originalMsg) {
                const newComponents = originalMsg.components.slice(1);
                await originalMsg.edit({ components: newComponents });
            }
        } catch(e) {}
        
        return true;
    }

    if (interaction.isModalSubmit() && customId === 'alliance_apply_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        let clanTag = interaction.fields.getTextInputValue('clan_tag_input').trim().toUpperCase();
        if (!clanTag.startsWith('#')) {
            clanTag = '#' + clanTag;
        }

        const openEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('Button Clicked')
            .setDescription(
                `• **User:** ${user} (${user.username})\n` +
                `• **Button:** Alliance apply (Clan Tag: ${clanTag})\n` +
                `• **Panel:** ticketmsg\n` +
                `• **Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
            )
            .setColor(0x2b2d31);

        await sendLog(guild, openEmbed, config);

        const emojis = {};
        for (const [key, name] of Object.entries(EMOJI_NAMES)) {
            emojis[key] = await getAppEmoji(name);
        }

        const ticketType = 'Alliance-Join';
        const welcomeEmbed = allianceJoin.getEmbed(emojis);
        welcomeEmbed.addFields({ name: 'Clan Tag:', value: `**${clanTag}**`, inline: true });

        try {
            const existingChannel = guild.channels.cache.find(c => c.name === `${ticketType.toLowerCase()}-${user.username.toLowerCase()}`);
            if (existingChannel) {
                await interaction.editReply({ content: `You already have an open ticket: ${existingChannel}` });
                return true;
            }

            const overwrites = [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                }
            ];

            if (config.STAFF_ROLE_IDS && Array.isArray(config.STAFF_ROLE_IDS)) {
                config.STAFF_ROLE_IDS.forEach(roleId => {
                    if (roleId && roleId.trim()) {
                        overwrites.push({
                            id: roleId.trim(),
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                        });
                    }
                });
            }

            const channel = await guild.channels.create({
                name: `${ticketType}-${user.username}`,
                type: ChannelType.GuildText,
                topic: user.id,
                parent: CATEGORY_ID,
                permissionOverwrites: overwrites,
            });

            welcomeEmbed
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: 'Blood Alliance Management', iconURL: guild.iconURL() })
                .setColor('Random')
                .setTimestamp();

            const appRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`start_app_alliance-join`)
                    .setLabel('Start Application')
                    .setEmoji(emojis.book?.id || '📝')
                    .setStyle(ButtonStyle.Success)
            );

            const actionRow1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`view_clan_ticket:${clanTag}`)
                    .setLabel('View Clan')
                    .setEmoji(emojis.clancastle?.id || '🏰')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('Claim')
                    .setEmoji('✋')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('view_alliance_rules')
                    .setLabel('View Rules')
                    .setEmoji(emojis.rules?.id || '📜')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Delete Ticket')
                    .setEmoji(emojis.delete?.id || '🔒')
                    .setStyle(ButtonStyle.Secondary)
            );

            const mentionRoles = [];
            mentionRoles.push(user.toString());
            const execStaffRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[2] ? config.STAFF_ROLE_IDS[2].trim() : null;
            if (execStaffRoleId) {
                mentionRoles.push(`<@&${execStaffRoleId}>`);
            }

            const mentionContent = Array.from(new Set(mentionRoles)).join(" | ");

            // Ghost ping Server Moderator (STAFF_ROLE_IDS[0]) at the end
            const serverModRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? config.STAFF_ROLE_IDS[0].trim() : null;
            const ghostPing = serverModRoleId ? ` ||<@&${serverModRoleId}>||` : "";

            await channel.send({
                content: mentionContent + ghostPing,
                embeds: [welcomeEmbed],
                components: [appRow, actionRow1]
            });

            await interaction.editReply({ content: `Successfully created your ticket: ${channel}` });
            return true;

        } catch (error) {
            console.error('Error:', error);
            await interaction.editReply({ content: 'There was an error creating your ticket. Please check bot permissions and category ID.' });
            return true;
        }
    }

    if (customId && customId.startsWith('view_clan_ticket:')) {
        await interaction.deferReply();

        const clanTag = customId.split(':')[1];
        const claninfo = require('../../commands/coc/clan/claninfo');

        const loadingEmoji = getEmoji("alaram") || "⏳";
        let dotCount = 0;
        const loadingColor = Math.floor(Math.random() * 16777215);
        const loadingEmbed = new EmbedBuilder()
            .setColor(loadingColor)
            .setDescription(`${loadingEmoji} Fetching Information`);

        const replyMsg = await interaction.editReply({ embeds: [loadingEmbed] }).catch(() => null);

        const animationInterval = setInterval(async () => {
            dotCount = (dotCount + 1) % 4;
            const dots = ".".repeat(dotCount);
            const updatedEmbed = new EmbedBuilder()
                .setColor(loadingColor)
                .setDescription(`${loadingEmoji} Fetching Information ${dots}`);

            await interaction.editReply({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
        }, 1500);

        try {
            const apiLogger = async (msg) => {
                const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
                const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
                if (logChannel) await logChannel.send(`\`[TICKET VIEW CLAN]\` ${msg}`).catch(() => null);
            };

            const { clan, members } = await claninfo.fetchCocClanAndMembers(clanTag, coc);

            if (!clan) {
                if (animationInterval) clearInterval(animationInterval);

                try {
                    const player = await coc.getPlayer(clanTag);
                    if (player && player.name) {
                        const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ No Clan found with this tag, This Tag is found as player tag`);
                        const showPlayerBtn = new ButtonBuilder()
                            .setCustomId(`show_player_ticket:${clanTag}`)
                            .setLabel('Show Player')
                            .setStyle(ButtonStyle.Primary);
                        const row = new ActionRowBuilder().addComponents(showPlayerBtn);
                        return await interaction.editReply({ embeds: [errEmbed], components: [row] }).catch(() => { });
                    }
                } catch (err) { }

                const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ Invaild tag check once again");
                return await interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
            }

            const fwa = await claninfo.fetchFwaData(clanTag, apiLogger);
            const embed = claninfo.buildEmbedFromData(EmbedBuilder, clan, members, fwa, emojiUtils);

            if (animationInterval) clearInterval(animationInterval);
            await interaction.editReply({ embeds: [embed] }).catch(() => { });

        } catch (err) {
            if (animationInterval) clearInterval(animationInterval);
            console.error("❌ Error fetching clan details in ticket:", err);
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ An error occurred while fetching clan info.");
            await interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
        }
        return true;
    }

    if (customId && customId.startsWith('show_player_ticket:')) {
        await interaction.deferReply();
        const playerTag = customId.split(':')[1];

        try {
            const profileCmd = require('../../commands/coc/profile/profile.js');
            const mockMessage = {
                author: user,
                mentions: { users: new Map() },
                delete: async () => { },
                channel: {
                    send: async (payload) => {
                        return interaction.editReply(payload).catch(() => { });
                    }
                }
            };
            await profileCmd.execute(mockMessage, [playerTag], context);
        } catch (err) {
            console.error("❌ Error showing player profile:", err);
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ An error occurred while fetching player info.");
            await interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
        }
        return true;
    }

    if (customId && customId.startsWith('ticket_user_profile:')) {
        await interaction.deferReply();
        const targetUserId = customId.split(':')[1];

        try {
            const targetUser = await client.users.fetch(targetUserId);
            const profileCmd = require('../../commands/coc/profile/profile.js');
            const mockMessage = {
                author: targetUser,
                mentions: { users: new Map() },
                delete: async () => { },
                channel: {
                    send: async (payload) => {
                        return interaction.editReply(payload).catch(() => { });
                    }
                }
            };
            await profileCmd.execute(mockMessage, [], context);
        } catch (err) {
            console.error("❌ Error showing user profile:", err);
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ An error occurred while fetching user profile.");
            await interaction.editReply({ embeds: [errEmbed] }).catch(() => { });
        }
        return true;
    }

    if (customId === 'set_ticket_timer') {
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            await interaction.reply({ content: '❌ Only Staff or Admins can use this button.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const modal = new ModalBuilder()
            .setCustomId('ticket_timer_modal')
            .setTitle('Set Ticket Auto-Close Timer');

        const durationInput = new TextInputBuilder()
            .setCustomId('timer_duration_input')
            .setLabel('Enter Duration (e.g. 5m, 1h, 1d)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter e.g. 10m, 1h, 2d')
            .setMinLength(2)
            .setMaxLength(10)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(durationInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return true;
    }

    if (interaction.isModalSubmit() && customId === 'ticket_timer_modal') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            await interaction.editReply({ content: '❌ Only Staff or Admins can set timers.' });
            return true;
        }

        const durationStr = interaction.fields.getTextInputValue('timer_duration_input').trim().toLowerCase();
        const match = durationStr.match(/^(\d+)\s*(m|min|h|hr|d|day)s?$/);

        if (!match) {
            await interaction.editReply({ content: '❌ Invalid format. Please use formats like `5m`, `1h`, or `1d`.' });
            return true;
        }

        const value = parseInt(match[1], 10);
        const unit = match[2];
        let ms = 0;
        if (unit.startsWith('m')) {
            ms = value * 60 * 1000;
        } else if (unit.startsWith('h')) {
            ms = value * 60 * 60 * 1000;
        } else if (unit.startsWith('d')) {
            ms = value * 24 * 60 * 60 * 1000;
        }

        const channel = interaction.channel;
        const ticketOwnerId = channel.topic;
        const ticketOwnerMention = ticketOwnerId ? `<@${ticketOwnerId}>` : 'the creator';

        if (client.activeTicketTimers && client.activeTicketTimers.has(channel.id)) {
            const oldTimer = client.activeTicketTimers.get(channel.id);
            clearTimeout(oldTimer.timeout);
            client.activeTicketTimers.delete(channel.id);
        }

        const autoCloseTimestamp = Math.floor((Date.now() + ms) / 1000);
        const reminderOffset = Math.floor(ms / 2);
        const reminderTimestamp = Math.floor((Date.now() + reminderOffset) / 1000);

        const timerEmbed = new EmbedBuilder()
            .setTitle('Waiting on ticket creator')
            .setDescription(
                `We're waiting for a reply from ${ticketOwnerMention}.\n` +
                `**Reminder:** <t:${reminderTimestamp}:t>\n` +
                `**Auto-close:** <t:${autoCloseTimestamp}:t>\n\n` +
                `*Any reply from the creator will cancel this timer.*`
            )
            .setColor(0x2f3136);

        const timerMessage = await channel.send({
            content: ticketOwnerMention,
            embeds: [timerEmbed]
        });

        const timeout = setTimeout(async () => {
            if (client.activeTicketTimers) client.activeTicketTimers.delete(channel.id);
            const tData = context.data.getTicketTimers();
            if (tData[channel.id]) {
                delete tData[channel.id];
                context.data.saveTicketTimers(tData);
            }

            const creationTime = channel.createdAt;
            let attachment = null;
            try {
                attachment = await transcripts.createTranscript(channel, {
                    limit: -1,
                    fileName: `transcript-${channel.name}.html`,
                    returnBuffer: false,
                    saveImages: false
                });
            } catch (err) {
                console.error('Transcript Generation Error:', err);
            }

            const closeContent = `Ticket Closed - By: Bot Auto-Close - Ticket: ${channel.name}, ${ticketOwnerMention} - Time: <t:${Math.floor(Date.now() / 1000)}:F> -`;

            const closeEmbed = new EmbedBuilder()
                .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                .setTitle('Ticket Closed')
                .setDescription(
                    `• By: Bot Auto-Close\n` +
                    `• Ticket: ${channel.name}, ${ticketOwnerMention}\n` +
                    `• Time: <t:${Math.floor(Date.now() / 1000)}:F>\n` +
                    `• Ticket Creation: <t:${Math.floor(creationTime.getTime() / 1000)}:F>`
                )
                .setColor(0x2b2d31);

            try {
                await sendLog(guild, closeEmbed, config, attachment, closeContent);
            } catch (err) {
                console.error('Failed to send log with attachment:', err);
                await sendLog(guild, closeEmbed, config).catch(e => console.error('Final Log Error:', e));
            }

            await channel.delete().catch(err => {
                if (err.code === 10003) return; // Silence "Unknown Channel" error
                console.log('Error deleting channel:', err);
            });
        }, ms);

        if (!client.activeTicketTimers) client.activeTicketTimers = new Map();
        client.activeTicketTimers.set(channel.id, {
            timeout,
            timerMessageId: timerMessage.id
        });

        const timersData = context.data.getTicketTimers();
        timersData[channel.id] = {
            autoCloseTimestamp: autoCloseTimestamp,
            guildId: guild.id,
            timerMessageId: timerMessage.id
        };
        context.data.saveTicketTimers(timersData);

        await interaction.editReply({ content: `⏳ Auto-close timer successfully set for **${durationStr}**!` });
        return true;
    }

    if (customId === 'view_alliance_rules') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const wowEmoji = await getAppEmoji('wow');
        const pinkdot = await getAppEmoji('pinkdot');
        const reddot = await getAppEmoji('reddot');
        const orangedot = await getAppEmoji('orangedot');
        const rarrow = await getAppEmoji('rarroww');

        const rulesEmbed = new EmbedBuilder()
            .setTitle('📜 Blood Alliance Join Rules & Benefits')
            .setDescription(
                '### ⚠️ Alliance Rules\n' +
                '1. **Leadership Contact:** We will only communicate with the Leader of the clan. If you are not one, please ask them to join the server so we can initiate the discussion. 👑\n' +
                `2. **Server Presence:** All Leaders and Clan Representatives must be present in the Discord server. ${wowEmoji}\n` +
                '3. **Lazy CWL:** All Lazy CWL activities must be conducted strictly within the alliance. ⚔️\n' +
                '4. **Member Recruitment:** This for Either FWA (or) FUTURE FWA (or) SERIOUS WAR You must bring at least **30 members** from your clan (excluding Leaders and Reps) into the server. 👥\n' +
                `5. **Leadership:** Any one leader from the clan should always be active (exceptions allowed only for a few days). ${pinkdot}\n\n` +
                `${rarrow} *It is mandatory to respond to the Filler War starter to state if you are able to start war or request fillers.*\n\n` +
                `6. **Syncs & Activity:** Missing a sync without a response will make Blood Alliance take action. ${reddot}\n\n` +
                `${rarrow} *If a clan joins and dies later, it ruins members' trust in the Blood Alliance.*\n\n` +
                `7. **Discord Linking:** We should increase the number of members linked on Discord on a regular check basis (not one time at entry). ${orangedot}\n\n` +
                `${rarrow} *Clans should impose Discord as mandatory for members in most cases.*\n\n` +
                `${rarrow} *If members opt not to create a Discord, leaders should link their ID to their own Discord ID and register for CWL on their behalf.*\n\n` +
                '### ✨ Benefits\n' +
                '• **Shared Leadership Support:** Access to experienced leaders for strategic growth.\n' +
                '• **Organized Lazy CWL:** Maximize rewards with minimal effort through our system.\n' +
                '• **Community & Events:** Join a massive network of active Clashers and exclusive events.\n' +
                '• **Clan Growth:** Increased visibility and recruitment Support from the alliance.'
            )
            .setColor(0x3498db)
            .setFooter({ text: 'Blood Alliance Management', iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.editReply({ embeds: [rulesEmbed] });
        return true;
    }

    if (customId === 'claim_ticket') {
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            await interaction.reply({ content: '❌ Only Staff or Admins can claim this ticket.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        const claimEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription(`✅ <@${user.id}> has claimed this ticket and will be assisting shortly.`);
        await interaction.reply({ embeds: [claimEmbed] });

        // Record the claim for the staff weekly summary
        staffTicketTracker.recordClaim(user);

        try {
            const msg = interaction.message;
            if (msg && msg.components) {
                const newComponents = msg.components.map(row => {
                    const newRow = new ActionRowBuilder();
                    row.components.forEach(comp => {
                        if (comp.type === 2) { // Button
                            const newBtn = ButtonBuilder.from(comp);
                            if (comp.customId === 'claim_ticket') {
                                newBtn.setDisabled(true);
                                newBtn.setLabel(`Claimed by ${user.username}`);
                            }
                            newRow.addComponents(newBtn);
                        }
                    });
                    return newRow;
                });
                await msg.edit({ components: newComponents });
            }
        } catch (e) {}

        return true;
    }

    if (customId === 'close_ticket') {
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            await interaction.reply({ content: '❌ Only Staff or Admins can delete this ticket.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        await interaction.deferReply();

        const channel = interaction.channel;
        const creationTime = channel.createdAt;

        let attachment = null;
        try {
            attachment = await transcripts.createTranscript(channel, {
                limit: -1,
                fileName: `transcript-${channel.name}.html`,
                returnBuffer: false,
                saveImages: false
            });
        } catch (err) {
            console.error('Transcript Generation Error:', err);
        }

        let ticketOwnerId = channel.topic;
        let ownerMention = '';
        if (ticketOwnerId && /^\\d+$/.test(ticketOwnerId)) {
            const owner = await guild.members.fetch(ticketOwnerId).catch(() => null);
            if (owner) {
                ownerMention = `<@${ticketOwnerId}>(${owner.user.username})`;
            } else {
                ownerMention = `<@${ticketOwnerId}>`;
            }
        } else if (ticketOwnerId) {
            ownerMention = `<@${ticketOwnerId}>`;
        } else {
            ownerMention = `Unknown User`;
        }

        const now = Math.floor(Date.now() / 1000);

        const closeContent = `Ticket Closed - By: ${user} | ${user.username} - Ticket: ${channel.name}, ${ownerMention} - Time: <t:${now}:F> -`;

        const closeEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle('Ticket Closed')
            .setDescription(
                `• By: ${user} | ${user.username}\n` +
                `• Ticket: ${channel.name}, ${ownerMention}\n` +
                `• Time: <t:${now}:F>\n` +
                `• Ticket Creation: <t:${Math.floor(creationTime.getTime() / 1000)}:F>`
            )
            .setColor(0x2b2d31);

        try {
            await sendLog(guild, closeEmbed, config, attachment, closeContent);
        } catch (err) {
            console.error('Failed to send log with attachment:', err);
            await sendLog(guild, closeEmbed, config).catch(e => console.error('Final Log Error:', e));
        }

        if (channel.deleting) return;
        channel.deleting = true;

        if (client.activeTicketTimers && client.activeTicketTimers.has(channel.id)) {
            clearTimeout(client.activeTicketTimers.get(channel.id).timeout);
            client.activeTicketTimers.delete(channel.id);
        }
        const dataManager = context.data;
        const tData = dataManager.getTicketTimers();
        if (tData[channel.id]) {
            delete tData[channel.id];
            dataManager.saveTicketTimers(tData);
        }

        await interaction.editReply({ content: '✅ Transcript saved! This ticket will be deleted in **5 seconds**...' });

        setTimeout(() => {
            channel.delete().catch(err => {
                if (err.code === 10003) return; // Silence "Unknown Channel" error
                console.log('Error deleting channel:', err);
            });
        }, 5000);
        return true;
    }

    if (customId === 'approve_ticket' || customId === 'decline_ticket') {
        const isStaff = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
        const isAdmin = config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id));

        if (!isStaff && !isAdmin) {
            await interaction.reply({ content: '❌ Only Staff or Admins can use these buttons.', flags: [MessageFlags.Ephemeral] });
            return true;
        }

        await interaction.deferReply();

        const isApprove = customId === 'approve_ticket';
        const type = interaction.channel.name.split('-')[0].toLowerCase();

        let ticketOwnerId = interaction.channel.topic;
        let ticketOwner = null;

        if (ticketOwnerId && /^\d+$/.test(ticketOwnerId)) {
            ticketOwner = await interaction.guild.members.fetch(ticketOwnerId).catch(() => null);
        }

        if (!ticketOwner) {
            try {
                const messages = await interaction.channel.messages.fetch({ limit: 10, cache: false });
                const firstMsg = messages.filter(m => m.author.id === client.user.id).sort((a, b) => a.createdTimestamp - b.createdTimestamp).first();
                if (firstMsg && firstMsg.mentions.members.size > 0) {
                    ticketOwner = firstMsg.mentions.members.first();
                }
            } catch (err) {
                console.error('Error fetching first message:', err);
            }
        }

        if (!ticketOwner) {
            ticketOwner = interaction.channel.members.find(m =>
                !m.user.bot &&
                !(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => m.roles.cache.has(id))) &&
                !(config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => m.roles.cache.has(id)))
            );
        }

        const userMention = ticketOwner ? `<@${ticketOwner.id}>` : 'there';

        const statusEmbed = new EmbedBuilder()
            .setTitle(isApprove ? '✨ Application Approved' : '🕊️ Application Status')
            .setColor(isApprove ? 0x2ecc71 : 0xe74c3c)
            .setTimestamp();

        let message = '';
        const moderator = interaction.user;

        if (type === 'clan') {
            if (isApprove) {
                message = `Hey ${userMention}! 🌟\n\n` +
                    `We are delighted to inform you that you have been **selected** for our clans by ${moderator}! ${await getAppEmoji('coc')}\n\n` +
                    `Our team is working on your placement, and you will be assigned to one of our clans as soon as possible. We kindly ask for your patience in the meantime. ${await getAppEmoji('yellowarrow')}\n\n` +
                    `**Welcome to the Blood Alliance family!** ✨`;
            } else {
                message = `Hello ${userMention},\n\n` +
                    `Thank you for your interest in joining our clans. Your application has been **declined** by ${moderator}. 🕊️\n\n` +
                    `We appreciate your time and wish you the very best in your search for a clan! ⚔️`;
            }
        } else if (type === 'rep') {
            if (isApprove) {
                message = `Hey ${userMention}! 👑\n\n` +
                    `We are excited to inform you that your application to become a **Clan Representative** has been **approved** by ${moderator}! ${await getAppEmoji('crown')}\n\n` +
                    `Welcome to the inner circle of the Blood Alliance. Your role is vital in helping our clans thrive and maintaining our standard of excellence.\n\n` +
                    `Please stay tuned; a member of our leadership team will reach out to you shortly with your next steps. 🤝`;
            } else {
                message = `Hello ${userMention},\n\n` +
                    `Thank you for your interest in representing a clan within the Blood Alliance. Your application has been **declined** by ${moderator}. 🕊️\n\n` +
                    `We truly appreciate your enthusiasm and the time you took to apply. We wish you and your clan continued success! ⚔️`;
            }
        } else if (type === 'staff') {
            if (isApprove) {
                message = `Hey ${userMention}! 🚀\n\n` +
                    `Congratulations! Your application to join our **Staff Team** has been **approved** by ${moderator}! ${await getAppEmoji('wow')}\n\n` +
                    `We are thrilled to have you on board. Your support and dedication will help us make the Blood Alliance even better.\n\n` +
                    `Please keep an eye on your DMs; a member of our senior staff will contact you shortly with further instructions and onboarding. Welcome to the team! ✨`;
            } else {
                message = `Hello ${userMention},\n\n` +
                    `Thank you for your interest in supporting the Blood Alliance as a staff member. Your application has been **declined** by ${moderator}. 🕊️\n\n` +
                    `While we won't be moving forward at this time, we truly appreciate your willingness to help. We encourage you to keep being an active member of our community! 🌟`;
            }
        } else if (type === 'alliance') {
            if (isApprove) {
                message = `Hey ${userMention}! 🩸\n\n` +
                    `A massive welcome to the **Blood Alliance** family! Your application for your clan to join our ranks has been **approved** by ${moderator}! ${await getAppEmoji('blood')}\n\n` +
                    `We are honored to have you and your warriors standing alongside us. This is the beginning of a powerful partnership.\n\n` +
                    `Our leadership team will contact you shortly to finalize the integration details and welcome you properly. Let the journey begin! ⚔️`;
            } else {
                message = `Hello ${userMention},\n\n` +
                    `Thank you for your interest in bringing your clan into the Blood Alliance. After careful review, your application has been **declined** by ${moderator} at this time. 🕊️\n\n` +
                    `We appreciate the effort you put into your application and wish your clan nothing but strength and victory on the battlefield. 🛡️`;
            }
        } else if (type === 'help') {
            if (isApprove) {
                message = `Hey ${userMention}! 👋\n\n` +
                    `Your request for **Help & Assistance** has been reviewed and marked as **resolved/addressed** by ${moderator}! ${await getAppEmoji('question')}\n\n` +
                    `We hope we were able to provide the clarity you needed. If you have more questions in the future, don't hesitate to open a new ticket!`;
            } else {
                message = `Hello ${userMention},\n\n` +
                    `Your **Help & Assistance** ticket has been **closed** by ${moderator}. 🕊️\n\n` +
                    `If your issue wasn't fully resolved, please feel free to open a new ticket or contact a staff member directly.`;
            }
        } else {
            message = isApprove ? `Your application has been **approved** by ${moderator}, ${userMention}!` : `Your application has been **declined** by ${moderator}, ${userMention}.`;
        }

        statusEmbed.setDescription(message);

        await interaction.editReply({ content: ticketOwner ? `${ticketOwner}` : null, embeds: [statusEmbed] });
        return true;
    }

    const ticketOptions = {
        'apply_clan': { type: 'Clan-Entry', embed: clanEntry, label: 'Apply to clan' },
        'apply_fwa': { type: 'FWA-Entry', embed: clanEntry, label: 'Apply to FWA' },
        'apply_war': { type: 'War-Entry', embed: warClanEntry, label: 'Apply to War Clan' },
        'rep_apply': { type: 'Rep-Apply', embed: repApply, label: 'Rep Apply' },
        'staff_apply': { type: 'Staff-Apply', embed: staffApply, label: 'Staff Apply' },
        'alliance_apply': { type: 'Alliance-Join', embed: allianceJoin, label: 'Alliance apply' },
        'help_assistance': { type: 'Help-Assistance', embed: helpAssistance, label: 'Help Assistance' }
    };

    if (customId === 'alliance_apply') {
        const modal = new ModalBuilder()
            .setCustomId('alliance_apply_modal')
            .setTitle('Alliance Application');

        const tagInput = new TextInputBuilder()
            .setCustomId('clan_tag_input')
            .setLabel('Clan Tag')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., #2PP2828YY')
            .setMinLength(5)
            .setMaxLength(15)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(tagInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return true;
    }

    let currentOption = ticketOptions[customId];
    let recruitmentTag = null;

    if (customId === 'apply_clan') {
        const userData = context.data.getUserData();
        if (!userData[user.id]) {
            await interaction.reply({
                content: '❌ Please link your account first to join our clans!\nUse: `;link #YourPlayerTag` at <#1398351500895588352>',
                flags: [MessageFlags.Ephemeral]
            });
            return true;
        }

        const fwaEmoji = await getAppEmoji('whitefwa');
        const warEmoji = await getAppEmoji('cocfight');

        const choiceRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('apply_fwa')
                .setLabel('FWA')
                .setEmoji(fwaEmoji.id || '💎')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('apply_war')
                .setLabel('WAR CLAN')
                .setEmoji(warEmoji.id || '⚔️')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content: '### Welcome to Blood Alliance!\nWhich type of clan would you like to apply for?',
            components: [choiceRow],
            flags: [MessageFlags.Ephemeral]
        });
        return true;
    }

    if (customId.startsWith('apply_recruit:')) {
        recruitmentTag = customId.split(':')[1];

        const clanRoles = context.data.getClanRoles();
        const clanInfo = clanRoles[recruitmentTag];

        if (clanInfo && clanInfo.clanType === 'war') {
            currentOption = ticketOptions['apply_war'];
        } else {
            currentOption = ticketOptions['apply_fwa'];
        }

        const userData = context.data.getUserData();
        if (!userData[user.id]) {
            await interaction.reply({
                content: '❌ Please link your account first to join our clans!\nUse: `;link #YourPlayerTag` at <#1398351500895588352>',
                flags: [MessageFlags.Ephemeral]
            });
            return true;
        }
    }

    if (!currentOption) return false;

    if (customId === 'staff_apply' || customId === 'rep_apply') {
        const clanRoles = context.data.getClanRoles();
        const clanRoleIds = Object.values(clanRoles).map(c => c.roleId).filter(id => id);
        const hasClanRole = clanRoleIds.some(roleId => member.roles.cache.has(roleId));

        if (!hasClanRole) {
            await interaction.reply({
                content: '❌ You must be an active member of one of our alliance clans to apply for this position.',
                flags: [MessageFlags.Ephemeral]
            });
            return true;
        }

        const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
        if (Date.now() - member.joinedTimestamp < twoMonthsMs) {
            await interaction.reply({
                content: '❌ You must be a member of this server for at least **2 months** to apply for this position.',
                flags: [MessageFlags.Ephemeral]
            });
            return true;
        }
    }

    try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    } catch (err) {
        if (err.code === 10062) return true;
        console.error(err);
        return true;
    }

    const openEmbed = new EmbedBuilder()
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setTitle('Button Clicked')
        .setDescription(
            `• **User:** ${user} (${user.username})\n` +
            `• **Button:** ${recruitmentTag ? `Join Clan (${recruitmentTag})` : currentOption.label}\n` +
            `• **Panel:** ticketmsg\n` +
            `• **Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
        )
        .setColor(0x2b2d31);

    await sendLog(guild, openEmbed, config);

    const emojis = {};
    for (const [key, name] of Object.entries(EMOJI_NAMES)) {
        emojis[key] = await getAppEmoji(name);
    }

    let clanName = null;
    let clanData = null;
    if (recruitmentTag) {
        const clanRoles = context.data.getClanRoles();
        const clanInfo = clanRoles[recruitmentTag];
        if (clanInfo && clanInfo.nickName) {
            clanName = clanInfo.nickName;
        }

        clanData = await coc.getClan(recruitmentTag).catch(() => null);
        if (clanData && clanData.name) {
            clanName = clanData.name;
        }
    }

    const { type, embed } = currentOption;
    const ticketType = type;
    const welcomeEmbed = embed.getEmbed(emojis, clanName);

    if (recruitmentTag) {
        welcomeEmbed.addFields({ name: 'Applying For:', value: `**${recruitmentTag}**`, inline: true });
    }

    try {
        const existingChannel = guild.channels.cache.find(c => c.name === `${ticketType.toLowerCase()}-${user.username.toLowerCase()}`);
        if (existingChannel) {
            await interaction.editReply({ content: `You already have an open ticket: ${existingChannel}` });
            return true;
        }

        const overwrites = [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
            }
        ];

        if (config.STAFF_ROLE_IDS && Array.isArray(config.STAFF_ROLE_IDS)) {
            config.STAFF_ROLE_IDS.forEach(roleId => {
                if (roleId && roleId.trim()) {
                    overwrites.push({
                        id: roleId.trim(),
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                    });
                }
            });
        }

        if (customId === 'help_assistance') {
            overwrites.push({
                id: '1514535148119392377',
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
            });
        }

        if (recruitmentTag) {
            let foundSpecific = false;
            if (clanData) {
                const fetchedClanName = clanData.name;
                const clanLeaderRole = guild.roles.cache.find(r =>
                    r.name.toLowerCase().includes(fetchedClanName.toLowerCase()) &&
                    r.name.toLowerCase().includes("leader")
                );

                if (clanLeaderRole) {
                    overwrites.push({
                        id: clanLeaderRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                    });
                    foundSpecific = true;
                }
            }

            if (!foundSpecific) {
                const globalLeadersRole = guild.roles.cache.find(r => r.name === "Leaders");
                if (globalLeadersRole && !overwrites.find(o => o.id === globalLeadersRole.id)) {
                    overwrites.push({
                        id: globalLeadersRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                    });
                }
            }
        }

        if (customId === 'apply_war') {
            const mgmtRole = guild.roles.cache.find(r => r.name.toLowerCase().includes("management")) ||
                guild.roles.cache.find(r => r.name.toLowerCase().includes("mgmt"));

            if (mgmtRole && !overwrites.find(o => o.id === mgmtRole.id)) {
                overwrites.push({
                    id: mgmtRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
                });
            }
        }

        const channel = await guild.channels.create({
            name: `${ticketType}-${user.username}`,
            type: ChannelType.GuildText,
            topic: user.id,
            parent: CATEGORY_ID,
            permissionOverwrites: overwrites,
        });

        welcomeEmbed
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Blood Alliance Management', iconURL: guild.iconURL() })
            .setColor('Random')
            .setTimestamp();

        const appRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`start_app_${ticketType.toLowerCase()}`)
                .setLabel('Start Application')
                .setEmoji(emojis.book?.id || '📝')
                .setStyle(ButtonStyle.Success)
        );

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_user_profile:${user.id}`)
                .setEmoji(emojis.mem?.id || '👤')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('Claim')
                .setEmoji('✋')
                .setStyle(ButtonStyle.Success)
        );

        if (customId === 'alliance_apply') {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('view_alliance_rules')
                    .setLabel('View Rules')
                    .setEmoji(emojis.rules?.id || '📜')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Delete Ticket')
                .setEmoji(emojis.delete?.id || '🔒')
                .setStyle(ButtonStyle.Secondary)
        );

        const mentionRoles = [];
        mentionRoles.push(user.toString());
        const execStaffRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[2] ? config.STAFF_ROLE_IDS[2].trim() : null;
        if (execStaffRoleId) {
            mentionRoles.push(`<@&${execStaffRoleId}>`);
        }

        if (recruitmentTag) {
            let foundSpecific = false;
            if (clanData) {
                const fetchedClanName = clanData.name;
                const clanLeaderRole = guild.roles.cache.find(r =>
                    r.name.toLowerCase().includes(fetchedClanName.toLowerCase()) &&
                    r.name.toLowerCase().includes("leader")
                );
                if (clanLeaderRole) {
                    mentionRoles.push(`<@&${clanLeaderRole.id}>`);
                    foundSpecific = true;
                }
            }
            if (!foundSpecific) {
                const globalLeadersRole = guild.roles.cache.find(r => r.name === "Leaders");
                if (globalLeadersRole) mentionRoles.push(`<@&${globalLeadersRole.id}>`);
            }
        }

        if (customId === 'apply_war') {
            const mgmtRole = guild.roles.cache.find(r => r.name.toLowerCase().includes("management")) ||
                guild.roles.cache.find(r => r.name.toLowerCase().includes("mgmt"));
            if (mgmtRole) mentionRoles.push(`<@&${mgmtRole.id}>`);
        }

        const mentionContent = Array.from(new Set(mentionRoles)).join(" | ");

        // Ghost ping Server Moderator (STAFF_ROLE_IDS[0]) for all ticket types
        const serverModRoleId = config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? config.STAFF_ROLE_IDS[0].trim() : null;
        let ghostPingRoles = [];
        if (serverModRoleId) ghostPingRoles.push(`<@&${serverModRoleId}>`);
        if (customId === 'help_assistance') ghostPingRoles.push(`<@&1514535148119392377>`);
        
        const ghostPing = ghostPingRoles.length > 0 ? ` ||${ghostPingRoles.join(' ')}||` : "";

        await channel.send({
            content: mentionContent + ghostPing,
            embeds: [welcomeEmbed],
            components: [appRow, actionRow]
        });

        await interaction.editReply({ content: `Successfully created your ticket: ${channel}` });
        return true;

    } catch (error) {
        console.error('Error:', error);
        await interaction.editReply({ content: 'There was an error creating your ticket. Please check bot permissions and category ID.' });
        return true;
    }
};

module.exports = handleTicketInteraction;

module.exports.checkTimers = async function (client, config, context) {
    const dataManager = context.data;
    const timersData = dataManager.getTicketTimers();
    const now = Math.floor(Date.now() / 1000);

    for (const [channelId, timerInfo] of Object.entries(timersData)) {
        const { autoCloseTimestamp, guildId } = timerInfo;
        const delayMs = (autoCloseTimestamp - now) * 1000;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(channelId);

        if (!channel) {
            delete timersData[channelId];
            dataManager.saveTicketTimers(timersData);
            continue;
        }

        if (!client.activeTicketTimers) client.activeTicketTimers = new Map();

        if (delayMs <= 0) {
            delete timersData[channelId];
            dataManager.saveTicketTimers(timersData);

            const creationTime = channel.createdAt;
            let attachment = null;
            try {
                const transcripts = require('discord-html-transcripts');
                attachment = await transcripts.createTranscript(channel, {
                    limit: -1, fileName: `transcript-${channel.name}.html`, returnBuffer: false, saveImages: false
                });
            } catch (e) { }

            const { EmbedBuilder } = require('discord.js');
            const ownerMention = channel.topic ? `<@${channel.topic}>` : 'Unknown User';
            const closeContent = `Ticket Closed - By: Bot Auto-Close - Ticket: ${channel.name}, ${ownerMention} - Time: <t:${now}:F> -`;
            const closeEmbed = new EmbedBuilder()
                .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                .setTitle('Ticket Closed')
                .setDescription(`• By: Bot Auto-Close\n• Ticket: ${channel.name}, ${ownerMention}\n• Time: <t:${now}:F>\n• Ticket Creation: <t:${Math.floor(creationTime.getTime() / 1000)}:F>`)
                .setColor(0x2b2d31);
            await sendLog(guild, closeEmbed, config, attachment, closeContent);
            await channel.delete().catch(() => { });
        } else {
            const timeout = setTimeout(async () => {
                if (client.activeTicketTimers) client.activeTicketTimers.delete(channelId);
                const tData = dataManager.getTicketTimers();
                if (tData[channelId]) {
                    delete tData[channelId];
                    dataManager.saveTicketTimers(tData);
                }

                const creationTime = channel.createdAt;
                let attachment = null;
                try {
                    const transcripts = require('discord-html-transcripts');
                    attachment = await transcripts.createTranscript(channel, {
                        limit: -1, fileName: `transcript-${channel.name}.html`, returnBuffer: false, saveImages: false
                    });
                } catch (e) { }

                const { EmbedBuilder } = require('discord.js');
                const ownerMention = channel.topic ? `<@${channel.topic}>` : 'Unknown User';
                const nowLog = Math.floor(Date.now() / 1000);
                const closeContent = `Ticket Closed - By: Bot Auto-Close - Ticket: ${channel.name}, ${ownerMention} - Time: <t:${nowLog}:F> -`;
                const closeEmbed = new EmbedBuilder()
                    .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                    .setTitle('Ticket Closed')
                    .setDescription(`• By: Bot Auto-Close\n• Ticket: ${channel.name}, ${ownerMention}\n• Time: <t:${nowLog}:F>\n• Ticket Creation: <t:${Math.floor(creationTime.getTime() / 1000)}:F>`)
                    .setColor(0x2b2d31);
                await sendLog(guild, closeEmbed, config, attachment, closeContent);
                await channel.delete().catch(() => { });
            }, delayMs);

            client.activeTicketTimers.set(channelId, { timeout, timerMessageId: timerInfo.timerMessageId });
        }
    }
};
