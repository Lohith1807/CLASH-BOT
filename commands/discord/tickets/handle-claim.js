const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder } = require("discord.js");
const staffTicketTracker = require("../../../utils/staffTicketTracker");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('handle-claim')
        .setDescription('Transfer the claim of this ticket to another user.')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to transfer the claim to')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { config, emoji } = context;
        const { getEmoji } = emoji;
        const targetUser = interaction.options.getUser('user');
        
        // Permission check
        const allowedRoleNames = ['executive staff', 'server mod', 't-mod', 'admin'];
        const memberRoles = interaction.member.roles.cache;
        
        const hasConfigRole = 
            (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) ||
            (config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS.some(id => memberRoles.has(id)));

        const hasNameRole = memberRoles.some(r => allowedRoleNames.some(allowed => r.name.toLowerCase().includes(allowed)));
        const hasPerms = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles);
        const isAdmin = (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => memberRoles.has(id))) || hasPerms || interaction.user.id === interaction.guild.ownerId;

        if (!hasConfigRole && !hasNameRole && !hasPerms && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setDescription(`${getEmoji("bluex") || '❌'} You do not have the required roles to use this command.`)
                ], 
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        // Figure out who previously claimed this ticket.
        // Fetch recent messages in the channel to find the claim message or button
        let previousClaimerId = null;
        let claimMessageToEdit = null;
        let actionMessageToEdit = null;
        
        try {
            const messages = await interaction.channel.messages.fetch({ limit: 50 });
            
            // Find the most recent claim message sent by the bot
            const claimMsg = messages.find(m => 
                m.author.id === interaction.client.user.id && 
                m.embeds.length > 0 && 
                m.embeds[0].description && 
                m.embeds[0].description.includes('has claimed this ticket')
            );
            
            if (claimMsg) {
                // Extract user ID from the description (e.g. ✅ <@123456789> has claimed...)
                const match = claimMsg.embeds[0].description.match(/<@(\d+)>/);
                if (match) {
                    previousClaimerId = match[1];
                    claimMessageToEdit = claimMsg;
                }
            }
            
            // Also find the message with the claim button
            const btnMsg = messages.find(m => 
                m.author.id === interaction.client.user.id && 
                m.components && 
                m.components.some(row => row.components.some(c => c.customId === 'claim_ticket'))
            );
            
            if (btnMsg) {
                actionMessageToEdit = btnMsg;
            }
        } catch (e) {
            console.error("Error fetching messages for handle-claim:", e);
        }

        if (!previousClaimerId) {
            return interaction.editReply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setDescription(`❌ This ticket has not been claimed yet.`)
                ]
            });
        }

        if (!isAdmin && previousClaimerId !== interaction.user.id) {
            return interaction.editReply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setDescription(`❌ Only the user who claimed this ticket can transfer the claim (Admins bypass this).`)
                ]
            });
        }

        // Remove claim from previous user
        staffTicketTracker.removeClaim(previousClaimerId);

        // Add claim to new user
        staffTicketTracker.recordClaim(targetUser);

        // We no longer update the original claim message so the history remains intact

        // Update the button message if we found it
        if (actionMessageToEdit) {
            try {
                const newComponents = actionMessageToEdit.components.map(row => {
                    const newRow = new ActionRowBuilder();
                    row.components.forEach(comp => {
                        if (comp.type === 2) { // Button
                            const newBtn = ButtonBuilder.from(comp);
                            if (comp.customId === 'claim_ticket') {
                                newBtn.setDisabled(true);
                                newBtn.setLabel(`Claimed by ${targetUser.username}`);
                            }
                            newRow.addComponents(newBtn);
                        } else {
                            // In case there are other component types, though usually just buttons in ActionRow for this bot
                            newRow.addComponents(comp);
                        }
                    });
                    return newRow;
                });
                await actionMessageToEdit.edit({ components: newComponents });
            } catch (e) {
                console.error("Error editing button message:", e);
            }
        }

        const successEmbed = new EmbedBuilder()
            .setColor("Green")
            .setDescription(`✅ Ticket claim successfully transferred to <@${targetUser.id}>.\n\nNow <@${targetUser.id}> will continue your process. Please be patient, if you need anything ping <@${targetUser.id}>.`);
            
        return interaction.editReply({ embeds: [successEmbed] });
    }
};
