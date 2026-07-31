const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ComponentType, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../../data/ww_thresholds.json');

function getThresholds() {
    if (!fs.existsSync(dataPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveThresholds(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update-ww')
        .setDescription('Manage TH war weight thresholds for the test server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'List', value: 'list' },
                    { name: 'Update / Delete', value: 'manage' }
                )
        ),

    async execute(interaction, context) {
        if (!interaction.guildId || interaction.guildId !== context.config.GUILD_ID) {
            return interaction.reply({ content: '❌ This command can only be used in the main server.', ephemeral: true });
        }

        const action = interaction.options.getString('action');
        const thresholds = getThresholds();

        if (action === 'add') {
            const modalId = `add_ww_modal_${Date.now()}`;
            const modal = new ModalBuilder()
                .setCustomId(modalId)
                .setTitle('Add TH Weight Threshold');

            const thInput = new TextInputBuilder()
                .setCustomId('th_level')
                .setLabel('Town Hall Level')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const weightInput = new TextInputBuilder()
                .setCustomId('weight_val')
                .setLabel('Weight (6 digits)')
                .setPlaceholder('Enter weight (calculated by multiplying by 5)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(6);

            modal.addComponents(new ActionRowBuilder().addComponents(thInput), new ActionRowBuilder().addComponents(weightInput));
            
            await interaction.showModal(modal);
            
            try {
                const modalSubmit = await interaction.awaitModalSubmit({ time: 120000, filter: i => i.customId === modalId && i.user.id === interaction.user.id });
                const th = modalSubmit.fields.getTextInputValue('th_level');
                const weight = modalSubmit.fields.getTextInputValue('weight_val');
                
                if (isNaN(th) || isNaN(weight) || weight.length < 5) {
                    return modalSubmit.reply({ content: 'Invalid input.', ephemeral: true });
                }
                
                thresholds[th] = parseInt(weight, 10);
                saveThresholds(thresholds);
                
                return modalSubmit.reply({ content: `✅ Added/Updated TH${th} threshold to ${weight}`, ephemeral: true });
            } catch(e) {
                console.error(e);
            }
        }
        else if (action === 'list') {
            const embed = new EmbedBuilder().setTitle('War Weight Thresholds').setColor('Random');
            let desc = '';
            
            const sorted = Object.keys(thresholds).sort((a,b) => parseInt(b) - parseInt(a));
            if (sorted.length === 0) desc = 'No thresholds stored.';
            else {
                for (let th of sorted) {
                    desc += `**TH${th}**: > ${thresholds[th]}\n`;
                }
            }
            embed.setDescription(desc);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        else if (action === 'manage') {
            const sorted = Object.keys(thresholds).sort((a,b) => parseInt(b) - parseInt(a));
            if (sorted.length === 0) {
                return interaction.reply({ content: 'No thresholds stored.', ephemeral: true });
            }

            const options = sorted.map(th => ({
                label: `TH${th} - ${thresholds[th]}`,
                value: th
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('manage_ww_select')
                .setPlaceholder('Select a TH to manage')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const msg = await interaction.reply({
                content: 'Select a Town Hall threshold to manage:',
                components: [row],
                ephemeral: true,
                fetchReply: true
            });

            try {
                const selectInt = await msg.awaitMessageComponent({
                    filter: i => i.customId === 'manage_ww_select' && i.user.id === interaction.user.id,
                    time: 60000,
                    componentType: ComponentType.StringSelect
                });

                const selectedTh = selectInt.values[0];
                
                const updateBtn = new ButtonBuilder()
                    .setCustomId('ww_btn_update')
                    .setLabel('Update')
                    .setStyle(ButtonStyle.Primary);
                    
                const deleteBtn = new ButtonBuilder()
                    .setCustomId('ww_btn_delete')
                    .setLabel('Delete')
                    .setStyle(ButtonStyle.Danger);
                    
                const btnRow = new ActionRowBuilder().addComponents(updateBtn, deleteBtn);
                
                await selectInt.update({ content: `Selected **TH${selectedTh}** (Current Weight: ${thresholds[selectedTh]}). What would you like to do?`, components: [btnRow] });

                const btnInt = await msg.awaitMessageComponent({
                    filter: i => ['ww_btn_update', 'ww_btn_delete'].includes(i.customId) && i.user.id === interaction.user.id,
                    time: 60000,
                    componentType: ComponentType.Button
                });

                if (btnInt.customId === 'ww_btn_delete') {
                    // Confirmation
                    const confirmBtn = new ButtonBuilder().setCustomId('ww_confirm_del').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger);
                    const cancelBtn = new ButtonBuilder().setCustomId('ww_cancel_del').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
                    const confirmRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
                    
                    await btnInt.update({ content: `Are you sure you want to delete the threshold for TH${selectedTh}?`, components: [confirmRow] });
                    
                    const confInt = await msg.awaitMessageComponent({
                        filter: i => ['ww_confirm_del', 'ww_cancel_del'].includes(i.customId) && i.user.id === interaction.user.id,
                        time: 30000,
                        componentType: ComponentType.Button
                    });
                    
                    if (confInt.customId === 'ww_confirm_del') {
                        delete thresholds[selectedTh];
                        saveThresholds(thresholds);
                        await confInt.update({ content: `✅ Deleted TH${selectedTh} threshold.`, components: [] });
                    } else {
                        await confInt.update({ content: 'Cancelled.', components: [] });
                    }
                } else if (btnInt.customId === 'ww_btn_update') {
                    // Update - show modal
                    const modalId = `update_ww_modal_${Date.now()}`;
                    const modal = new ModalBuilder()
                        .setCustomId(modalId)
                        .setTitle(`Update TH${selectedTh} Weight`);

                    const weightInput = new TextInputBuilder()
                        .setCustomId('weight_val')
                        .setLabel('New Weight')
                        .setPlaceholder('6 digits, calculated by 5')
                        .setValue(thresholds[selectedTh].toString())
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(5)
                        .setMaxLength(6);

                    modal.addComponents(new ActionRowBuilder().addComponents(weightInput));
                    
                    await btnInt.showModal(modal);
                    
                    try {
                        const modalSubmit = await btnInt.awaitModalSubmit({ time: 120000, filter: i => i.customId === modalId && i.user.id === interaction.user.id });
                        const weight = modalSubmit.fields.getTextInputValue('weight_val');
                        
                        if (isNaN(weight) || weight.length < 5) {
                            return modalSubmit.reply({ content: 'Invalid input.', ephemeral: true });
                        }
                        
                        thresholds[selectedTh] = parseInt(weight, 10);
                        saveThresholds(thresholds);
                        
                        // Clean up main message
                        await interaction.editReply({ content: `✅ Updated TH${selectedTh} threshold to ${weight}`, components: [] }).catch(()=>{});
                        return modalSubmit.reply({ content: `Successfully updated TH${selectedTh} threshold to ${weight}!`, ephemeral: true });
                    } catch(e) {
                        console.error(e);
                    }
                }

            } catch (err) {
                return interaction.editReply({ content: 'Time expired or action cancelled.', components: [] }).catch(()=>{});
            }
        }
    }
};
