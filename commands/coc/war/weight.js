const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getThresholds() {
    const dataPath = path.join(__dirname, '../../../data/ww_thresholds.json');
    if (!fs.existsSync(dataPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weight')
        .setDescription('Check if a player is rushed based on war weight')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('Select a user (optional, defaults to yourself)')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { coc, data: dataManager, emoji: emojiUtils } = context;
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userData = dataManager.getUserData();
        const accounts = userData[targetUser.id] || [];
        
        if (accounts.length === 0) {
            return interaction.reply({ content: `❌ **${targetUser.username}** has no linked accounts.`, ephemeral: true });
        }

        let selectedTag = null;

        if (accounts.length === 1) {
            selectedTag = accounts[0].tag;
            await this.showWeightModal(interaction, selectedTag, context);
        } else {
            // Show select menu
            const options = accounts.slice(0, 25).map(acc => ({
                label: `${acc.name} (${acc.tag})`,
                value: acc.tag
            }));
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_account_ww')
                .setPlaceholder('Select an account')
                .addOptions(options);
                
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            const msg = await interaction.reply({ 
                content: `Please select an account for **${targetUser.username}**:`, 
                components: [row],
                ephemeral: true,
                fetchReply: true
            });
            
            try {
                const selectInteraction = await msg.awaitMessageComponent({ 
                    filter: i => i.user.id === interaction.user.id && i.customId === 'select_account_ww', 
                    time: 60000,
                    componentType: ComponentType.StringSelect
                }).catch(err => { if (err.code === 'InteractionCollectorError') return null; throw err; });
                
                selectedTag = selectInteraction.values[0];
                await this.showWeightModal(selectInteraction, selectedTag, context);
                
                // Clean up the original select menu message
                await interaction.editReply({ content: 'Account selected.', components: [] }).catch(()=>{});
            } catch (err) {
                return interaction.editReply({ content: 'Time expired or action cancelled.', components: [] }).catch(()=>{});
            }
        }
    },

    async showWeightModal(interaction, tag, context) {
        const modalId = `modal_ww_${Date.now()}`;
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Enter War Weight');

        const weightInput = new TextInputBuilder()
            .setCustomId('weight_input')
            .setLabel('Weight (5 or 6 digits)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(6);
            
        const firstActionRow = new ActionRowBuilder().addComponents(weightInput);
        modal.addComponents(firstActionRow);
        
        await interaction.showModal(modal);
        
        try {
            const modalInteraction = await interaction.awaitModalSubmit({
                filter: i => i.customId === modalId && i.user.id === interaction.user.id,
                time: 120000
            });
            
            const weightValue = modalInteraction.fields.getTextInputValue('weight_input');
            await this.handleWeightLogic(modalInteraction, tag, weightValue, context);
        } catch (err) {
            console.error('Modal submit error:', err);
        }
    },

    async handleWeightLogic(interaction, tag, weightValue, context) {
        let weight = parseInt(weightValue, 10);
        if (isNaN(weight)) {
            return interaction.reply({ content: 'Invalid weight entered.', ephemeral: true });
        }
        
        if (weightValue.length === 5) {
            weight = weight * 5;
        } else if (weightValue.length !== 6) {
            return interaction.reply({ content: 'Weight must be 5 or 6 digits.', ephemeral: true });
        }
        
        try { await interaction.deferReply(); } catch (err) { if (err.code !== 10062) console.error(err); return true; }
        
        try {
            const player = await context.coc.getPlayer(tag);
            const townHallLevel = player.townHallLevel;
            
            let equivalent;
            const thresholds = getThresholds();
            
            if (thresholds && Object.keys(thresholds).length > 0) {
                const sortedTHs = Object.keys(thresholds).map(Number).sort((a,b) => b - a);
                equivalent = townHallLevel > 10 ? 10 : townHallLevel;
                for (let th of sortedTHs) {
                    if (weight > thresholds[th]) {
                        equivalent = th;
                        break;
                    }
                }
            } else {
                if (weight > 170000) equivalent = 18;
                else if (weight > 160000) equivalent = 17;
                else if (weight > 150000) equivalent = 16;
                else if (weight > 140000) equivalent = 15;
                else if (weight > 130000) equivalent = 14;
                else if (weight > 120000) equivalent = 13;
                else if (weight > 110000) equivalent = 12;
                else if (weight > 90000) equivalent = 11;
                else equivalent = townHallLevel > 10 ? 10 : townHallLevel;
            }
            
            let messageText = '';
            if (equivalent > townHallLevel) {
                messageText = `🤡 Noob! Don't you even know how to calculate war weight correctly? Your weight is too high for your Town Hall!`;
            } else if (equivalent === townHallLevel) {
                messageText = `✅ This is a **non rushed** id!`;
            } else {
                messageText = `⚠️ This comes under **TH${equivalent}** account.`;
            }

            const thEmojiMap = {
                18: context.emoji.getEmoji("th18") || "🏰",
                17: context.emoji.getEmoji("th17") || "🏰",
                16: context.emoji.getEmoji("th16") || "🏰",
                15: context.emoji.getEmoji("th15") || "🏰",
                14: context.emoji.getEmoji("th14") || "🏰",
                13: context.emoji.getEmoji("th13") || "🏰",
                12: context.emoji.getEmoji("th12") || "🏰",
                11: context.emoji.getEmoji("th11") || "🏰",
            };

            const thStr = thEmojiMap[townHallLevel] || `TH${townHallLevel}`;
            const eqvStr = thEmojiMap[equivalent] || `TH${equivalent}`;

            const embed = new EmbedBuilder()
                .setTitle(`War Weight Report for ${player.name}`)
                .setDescription(messageText)
                .addFields({
                    name: player.name,
                    value: `${thStr} | ⚖ ${weight.toLocaleString()} | Real Weight: ${eqvStr}`
                })
                .setColor('Random')
                .setThumbnail(player.league?.iconUrls?.medium || null)
                .setFooter({ text: `Tag: ${player.tag}` })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in handleWeightLogic:', error);
            await interaction.editReply({ content: '❌ Failed to fetch player data from Clash of Clans API.' });
        }
    }
};
