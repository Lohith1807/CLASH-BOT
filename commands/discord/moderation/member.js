const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('member')
        .setDescription('Add or remove a member')
        .addStringOption(option => 
            option.setName('action')
                .setDescription('Select whether to add or remove the member')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                ))
        .addUserOption(option => 
            option.setName('user')
                .setDescription('Select the user')
                .setRequired(true)),
                
    async execute(interaction) {
        const adminRoleIds = process.env.ADMIN_ROLE_IDS ? process.env.ADMIN_ROLE_IDS.split(',') : [];
        const staffRoleIds = process.env.STAFF_ROLE ? process.env.STAFF_ROLE.split(',') : [];
        const allowedRoleIds = [...adminRoleIds, ...staffRoleIds];

        const isStaffOrAdmin = interaction.member.roles.cache.some(role => 
            allowedRoleIds.includes(role.id)
        ) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

        if (!isStaffOrAdmin) {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Access Denied")
                .setDescription("Only staff and admins can use this command.")
                .setColor(0xE74C3C);
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const action = interaction.options.getString('action');
        const user = interaction.options.getUser('user');

        const embed = new EmbedBuilder()
            .setTitle('Confirmation Required')
            .setDescription(`Are you sure you want to **${action}** ${user}?`)
            .setColor(action === 'add' ? 0x2ECC71 : 0xE74C3C); // Green for add, Red for remove

        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_member_action')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_member_action')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        // Send the initial reply with the buttons
        const response = await interaction.reply({ 
            embeds: [embed], 
            components: [row], 
            ephemeral: true // Only the user who ran the command can see this
        });

        // Set up a collector to listen for the button click
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 60000 // 60 seconds to respond
        });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_member_action') {
                try {
                    if (action === 'add') {
                        await interaction.channel.permissionOverwrites.create(user.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        });
                    } else if (action === 'remove') {
                        // We can either delete their specific overwrite or explicitly deny them
                        // Explicitly denying is safer to ensure they lose access
                        await interaction.channel.permissionOverwrites.create(user.id, {
                            ViewChannel: false
                        });
                    }

                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Action Confirmed')
                        .setDescription(`Successfully **${action}ed** ${user} in this channel.`)
                        .setColor(0x2ECC71);
                        
                    await i.update({ embeds: [successEmbed], components: [] });
                } catch (error) {
                    console.error("Error modifying channel permissions:", error);
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription(`An error occurred while trying to **${action}** ${user}. Please check my permissions.`)
                        .setColor(0xE74C3C);
                    await i.update({ embeds: [errorEmbed], components: [] });
                }
            } else if (i.customId === 'cancel_member_action') {
                const cancelEmbed = new EmbedBuilder()
                    .setTitle('❌ Action Cancelled')
                    .setDescription(`The action to **${action}** ${user} has been cancelled.`)
                    .setColor(0xE74C3C);
                    
                await i.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏳ Timeout')
                    .setDescription('You did not respond in time, the action has been cancelled.')
                    .setColor(0x95A5A6);
                    
                // Use catch to avoid errors if the interaction or message was deleted
                interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    }
};
