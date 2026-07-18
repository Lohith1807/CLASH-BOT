const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require('discord.js');
const { getEmoji } = require('../../../utils/emoji.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit-recruitment')
        .setDescription('Edit an active recruitment post for a clan')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Select the clan')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const recruitments = dataManager.getRecruitments();
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Only show clans that have an active recruitment post
        const activeClans = Object.keys(recruitments);
        
        const choices = activeClans.map(tag => {
            const info = clanRoles[tag] || {};
            return {
                name: `${info.nickName || tag} (${tag})`,
                value: tag,
            };
        }).filter(c => 
            c.name.toLowerCase().includes(focusedValue) ||
            c.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(choices);
    },

    async execute(interaction, context) {
        try {
            const { data: dataManager, config } = context;
            const clanTag = interaction.options.getString('clan');
            
            const clanRoles = dataManager.getClanRoles();
            const clanInfo = clanRoles[clanTag];
            
            if (!clanInfo) {
                return interaction.reply({ content: '❌ Invalid clan selected.', ephemeral: true });
            }

            // Permission check: Admin/Staff/ALL_LEADS OR specific clan leader role
            const allLeadsRoleId = config.ALL_LEADS_ID || process.env.ALL_LEADS_ID;
            const ALLOWED_ROLES = [
                ...(config.ADMIN_ROLE_IDS || []), 
                ...(config.STAFF_ROLE_IDS || []),
                ...(allLeadsRoleId ? [allLeadsRoleId] : [])
            ];
            let hasPermission = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
            
            if (!hasPermission && clanInfo.leaderRoleId) {
                if (interaction.member.roles.cache.has(clanInfo.leaderRoleId)) {
                    hasPermission = true;
                }
            }

            if (!hasPermission) {
                return interaction.reply({ 
                    content: '❌ You do not have permission to edit this clan\'s recruitment post.', 
                    ephemeral: true 
                });
            }

            // Check if recruitment is active
            const recruitments = dataManager.getRecruitments();
            const recruitData = recruitments[clanTag];
            
            if (!recruitData) {
                return interaction.reply({ 
                    content: '❌ No active recruitment post found for this clan. Please use `/post-recruitment`.', 
                    ephemeral: true 
                });
            }

            const thData = recruitData.townhalls || {};
            const thList = Object.keys(thData);

            if (thList.length === 0) {
                return interaction.reply({ content: '❌ This recruitment post has no Townhall data.', ephemeral: true });
            }

            // Create Modal
            const modal = new ModalBuilder()
                .setCustomId(`edit_recruit_modal_${clanTag}`)
                .setTitle('Edit Members Needed (0 to remove TH)');

            thList.slice(0, 5).forEach(th => {
                const currentSpots = thData[th] || 0;
                
                const thInput = new TextInputBuilder()
                    .setCustomId(`th_input_${th}`)
                    .setLabel(`For TH ${th}: how many needed?`)
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentSpots.toString())
                    .setRequired(true);

                const actionRow = new ActionRowBuilder().addComponents(thInput);
                modal.addComponents(actionRow);
            });

            await interaction.showModal(modal);

            // Handle Modal Submit via interactionCreate collector for instant deferReply
            const modalCustomId = `edit_recruit_modal_${clanTag}`;
            const userId = interaction.user.id;
            const clientRef = interaction.client;

            const handleModalSubmit = async (submitted) => {
                if (!submitted.isModalSubmit()) return;
                if (submitted.customId !== modalCustomId) return;
                if (submitted.user.id !== userId) return;

                // Remove listener immediately to avoid double-handling
                clientRef.removeListener('interactionCreate', handleModalSubmit);
                clearTimeout(modalTimeout);

                try {
                    // deferReply IMMEDIATELY — this is the critical fix
                    await submitted.deferReply({ ephemeral: true });
                } catch (deferErr) {
                    console.error('Failed to defer modal reply (edit-recruitment):', deferErr.message);
                    return; // interaction expired, nothing we can do
                }

                try {
                    // Gather data from modal
                    const spotsNeededData = {};
                    let totalSpots = 0;
                    
                    thList.slice(0, 5).forEach(th => {
                        const value = parseInt(submitted.fields.getTextInputValue(`th_input_${th}`)) || 0;
                        spotsNeededData[th] = value;
                        totalSpots += value;
                    });

                    const recruitChannelId = recruitData.channelId;
                    const recruitMsgId = recruitData.messageId;
                    
                    const recruitChannel = clientRef.channels.cache.get(recruitChannelId) 
                                           || await clientRef.channels.fetch(recruitChannelId).catch(() => null);

                    let targetMessage = null;
                    if (recruitChannel) {
                        targetMessage = await recruitChannel.messages.fetch(recruitMsgId).catch(() => null);
                    }

                    // Fetch Clan Info for Embed/Logs
                    let officialClanName = clanRoles[clanTag].nickName || clanTag;
                    let clanType = clanRoles[clanTag].clanType || "fwa";
                    try {
                        const cocData = await context.coc.getClan(clanTag);
                        if (cocData && cocData.name) officialClanName = cocData.name;
                    } catch (e) {}

                    const logChannelId = process.env.LOG_CHANNEL_ID;
                    let logChan = null;
                    if (logChannelId) {
                        logChan = clientRef.channels.cache.get(logChannelId) 
                                  || await clientRef.channels.fetch(logChannelId).catch(() => null);
                    }

                    // If 0 total spots -> DELETE the post
                    if (totalSpots === 0) {
                        if (targetMessage) {
                            await targetMessage.delete().catch(() => null);
                        }
                        
                        delete recruitments[clanTag];
                        dataManager.saveRecruitments(recruitments);

                        if (logChan) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle("🔴 Recruitment Deleted")
                                .setColor("Red")
                                .setDescription(`**User:** <@${submitted.user.id}>\n**Clan:** ${officialClanName} (${clanTag})\n**Reason:** All spots set to 0`);
                            logChan.send({ embeds: [logEmbed] }).catch(() => null);
                        }

                        return submitted.editReply({ content: `✅ Recruitment post has been completely removed because all spots were set to 0.` });
                    }

                    if (totalSpots > 5) {
                        return submitted.editReply({ content: '❌ You can only recruit for a maximum of 5 spots in total.' });
                    }

                    // Otherwise, EDIT the post
                    let thDesc = `${getEmoji("bluedot")} **Below are the townhalls with members needed**\n\n`;
                    for (const [th, spots] of Object.entries(spotsNeededData)) {
                        if (spots > 0) {
                            const thEmoji = getEmoji(`th${th}`) || `TH${th}`;
                            thDesc += `${getEmoji("rarroww")} ${thEmoji} : **${spots}** needed\n`;
                        }
                    }

                    const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clanTag)}`;

                    const recruitEmbed = new EmbedBuilder()
                        .setTitle(`${getEmoji("alaram")} RECRUITMENT OPEN ${getEmoji("alaram")}`)
                        .setColor("#2ECC71")
                        .setDescription(
                            `${getEmoji("heart")} **${officialClanName}** is now recruiting!\n\n` + 
                            `${thDesc}\n` + 
                            `${getEmoji("pinkdot")} **Clan Type:** ${clanType.toUpperCase()}\n` +
                            `${getEmoji("chain")} **View in game :** [Click Here](${clanLink})`
                        )
                        .setFooter({ text: 'Recruitment System' })
                        .setTimestamp();

                    if (targetMessage) {
                        await targetMessage.edit({ embeds: [recruitEmbed] }).catch(() => null);
                    } else if (recruitChannel) {
                        // If message somehow deleted but channel exists, resend it
                        const newMsg = await recruitChannel.send({ embeds: [recruitEmbed] }).catch(() => null);
                        if (newMsg) {
                            recruitments[clanTag].messageId = newMsg.id;
                        }
                    }

                    recruitments[clanTag].townhalls = spotsNeededData;
                    dataManager.saveRecruitments(recruitments);

                    if (logChan) {
                        const urlStr = targetMessage ? `[Click Here](${targetMessage.url})` : "Message recreated";
                        const logEmbed = new EmbedBuilder()
                            .setTitle("✏️ Recruitment Edited")
                            .setColor("Orange")
                            .setDescription(`**User:** <@${submitted.user.id}>\n**Clan:** ${officialClanName} (${clanTag})\n**Message:** ${urlStr}`);
                        logChan.send({ embeds: [logEmbed] }).catch(() => null);
                    }

                    await submitted.editReply({ content: `✅ Recruitment post updated successfully!` });

                } catch (error) {
                    console.error('Error processing edit-recruitment modal:', error);
                    try {
                        await submitted.editReply({ content: '❌ An error occurred while editing recruitment.' });
                    } catch (e) {}
                }
            };

            clientRef.on('interactionCreate', handleModalSubmit);

            // Auto-cleanup after 5 minutes if user never submits the modal
            const modalTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleModalSubmit);
            }, 300000);

        } catch (error) {
            console.error(error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ An error occurred.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
                }
            } catch (e) {}
        }
    }
};
