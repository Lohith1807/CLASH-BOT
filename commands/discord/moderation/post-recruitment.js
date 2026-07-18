const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const { getEmoji } = require('../../../utils/emoji.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post-recruitment')
        .setDescription('Manually post a recruitment ad for a clan')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Select the clan')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName('th')
                .setDescription('Townhalls required (e.g. 13 or 13,14)')
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const choices = Object.entries(clanRoles)
            .map(([tag, info]) => ({
                name: `${info.nickName || tag} (${tag})`,
                value: tag,
            }))
            .filter(c =>
                c.name.toLowerCase().includes(focusedValue) ||
                c.value.toLowerCase().includes(focusedValue)
            )
            .slice(0, 25);

        await interaction.respond(choices);
    },

    async execute(interaction, context) {
        try {
            const { data: dataManager, config } = context;

            // Permission check: Admin/Staff OR ALL LEADS Role
            const allLeadsRoleId = config.ALL_LEADS_ID || process.env.ALL_LEADS_ID;
            const ALLOWED_ROLES = [
                ...(config.ADMIN_ROLE_IDS || []), 
                ...(config.STAFF_ROLE_IDS || []),
                ...(allLeadsRoleId ? [allLeadsRoleId] : [])
            ];
            const hasPermission = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));

            if (!hasPermission) {
                return interaction.reply({ 
                    content: '❌ You must have the Leaders role to use this command.', 
                    ephemeral: true 
                });
            }

            const clanTag = interaction.options.getString('clan');
            const thString = interaction.options.getString('th');
            
            const clanRoles = dataManager.getClanRoles();
            if (!clanRoles[clanTag]) {
                return interaction.reply({ content: '❌ Invalid clan selected.', ephemeral: true });
            }

            // Check if recruitment already active
            const recruitments = dataManager.getRecruitments();
            if (recruitments[clanTag]) {
                return interaction.reply({ 
                    content: '❌ Already posted. To add/remove use `/edit-recruitment`.', 
                    ephemeral: true 
                });
            }

            // Parse THs
            const thList = thString.split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t !== '');
                
            if (thList.length === 0) {
                return interaction.reply({ content: '❌ Please provide at least one valid TH (e.g., 13,14).', ephemeral: true });
            }
            if (thList.length > 5) {
                return interaction.reply({ content: '❌ You can specify a maximum of 5 Townhalls at once due to discord limits.', ephemeral: true });
            }

            // Create Modal
            const modal = new ModalBuilder()
                .setCustomId(`post_recruit_modal_${clanTag}`)
                .setTitle('Members Needed');

            thList.forEach((th, index) => {
                const numericTh = th.replace(/[^0-9]/g, ''); // Extract just the number
                
                const thInput = new TextInputBuilder()
                    .setCustomId(`th_input_${numericTh}`)
                    .setLabel(`For TH ${numericTh}: how many needed?`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. 2')
                    .setRequired(true);

                const actionRow = new ActionRowBuilder().addComponents(thInput);
                modal.addComponents(actionRow);
            });

            await interaction.showModal(modal);

            // Handle Modal Submit via interactionCreate collector for instant deferReply
            const modalCustomId = `post_recruit_modal_${clanTag}`;
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
                    console.error('Failed to defer modal reply (post-recruitment):', deferErr.message);
                    return; // interaction expired, nothing we can do
                }

                try {
                    // Gather data from modal
                    const spotsNeededData = {};
                    let totalSpots = 0;
                    
                    thList.forEach(th => {
                        const numericTh = th.replace(/[^0-9]/g, '');
                        const value = parseInt(submitted.fields.getTextInputValue(`th_input_${numericTh}`)) || 0;
                        spotsNeededData[numericTh] = value;
                        totalSpots += value;
                    });

                    // If 0 total spots
                    if (totalSpots === 0) {
                        return submitted.editReply({ content: '❌ Cannot post recruitment with 0 spots needed.' });
                    }
                    if (totalSpots > 5) {
                        return submitted.editReply({ content: '❌ You can only recruit for a maximum of 5 spots in total.' });
                    }

                    // Fetch Clan Info for Embed
                    let officialClanName = clanRoles[clanTag].nickName || clanTag;
                    let clanType = clanRoles[clanTag].clanType || "fwa";
                    try {
                        const cocData = await context.coc.getClan(clanTag);
                        if (cocData && cocData.name) officialClanName = cocData.name;
                    } catch (e) {
                        console.warn(`Could not fetch clan info for ${clanTag}`, e.message);
                    }

                    // Generate Embed
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

                    // Send to RECRUIT_CHANNEL_ID (1503298102860320829)
                    const recruitChannelId = process.env.RECRUIT_CHANNEL_ID || "1503298102860320829";
                    const recruitChannel = clientRef.channels.cache.get(recruitChannelId) 
                                           || await clientRef.channels.fetch(recruitChannelId).catch(() => null);

                    if (!recruitChannel) {
                        return submitted.editReply({ content: `❌ Could not find recruitment channel ${recruitChannelId}.` });
                    }

                    const msg = await recruitChannel.send({ embeds: [recruitEmbed] });

                    // Save to recruitments.json
                    recruitments[clanTag] = {
                        messageId: msg.id,
                        channelId: msg.channel.id,
                        townhalls: spotsNeededData
                    };
                    dataManager.saveRecruitments(recruitments);

                    // Log creation
                    const logChannelId = process.env.LOG_CHANNEL_ID;
                    if (logChannelId) {
                        const logChan = clientRef.channels.cache.get(logChannelId) 
                                     || await clientRef.channels.fetch(logChannelId).catch(() => null);
                        
                        if (logChan) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle("📢 Recruitment Posted")
                                .setColor("Green")
                                .setDescription(`**User:** <@${submitted.user.id}>\n**Clan:** ${officialClanName} (${clanTag})\n**Message:** [Click Here](${msg.url})`);
                            logChan.send({ embeds: [logEmbed] }).catch(() => null);
                        }
                    }

                    await submitted.editReply({ content: `✅ Recruitment posted successfully in <#${recruitChannel.id}>!` });

                } catch (error) {
                    console.error('Error processing post-recruitment modal:', error);
                    try {
                        await submitted.editReply({ content: '❌ An error occurred while posting recruitment.' });
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
