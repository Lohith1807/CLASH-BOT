const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-welcome-th')
        .setDescription('Manage the recruited Town Halls in the welcome message')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option => 
            option.setName('add')
                .setDescription('TH levels to add (e.g. 18, 17, 16)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('remove')
                .setDescription('TH levels to remove (e.g. 13, 14)')
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { data: dataManager, emoji: emojiUtils, config } = context;

        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }
        
        const addInput = interaction.options.getString('add');
        const removeInput = interaction.options.getString('remove');

        let currentTHs = dataManager.getRecruitingTHs();

        let addedList = [];
        let removedList = [];
        let skippedAdd = [];
        let skippedRemove = [];

        const processInput = (inputStr, isAdd) => {
            if (!inputStr) return;
            const inputs = inputStr.split(/[\s,]+/).filter(i => i.trim() !== '');
            for (let input of inputs) {
                let normalized = input.toLowerCase().trim();
                if (/^\d+$/.test(normalized)) {
                    normalized = "th" + normalized;
                }

                if (isAdd) {
                    if (!currentTHs.includes(normalized)) {
                        currentTHs.push(normalized);
                        addedList.push(normalized.toUpperCase());
                    } else {
                        skippedAdd.push(normalized.toUpperCase());
                    }
                } else {
                    if (currentTHs.includes(normalized)) {
                        currentTHs = currentTHs.filter(th => th !== normalized);
                        removedList.push(normalized.toUpperCase());
                    } else {
                        skippedRemove.push(normalized.toUpperCase());
                    }
                }
            }
        };

        processInput(removeInput, false);
        processInput(addInput, true);

        if (addedList.length > 0 || removedList.length > 0) {
            currentTHs.sort((a, b) => {
                const numA = parseInt(a.replace('th', '')) || 0;
                const numB = parseInt(b.replace('th', '')) || 0;
                return numB - numA; // Descending
            });

            try {
                dataManager.saveRecruitingTHs(currentTHs);
            } catch (error) {
                return interaction.reply({ content: '❌ Failed to save to database.', ephemeral: true });
            }
        }

        const previewString = currentTHs.length > 0 
            ? currentTHs.map(th => emojiUtils.getEmoji(th) || th.toUpperCase()).join(" ")
            : "*(None)*";

        let desc = ``;
        if (addedList.length > 0) desc += `Successfully added: **${addedList.join(", ")}**\n`;
        if (removedList.length > 0) desc += `Successfully removed: **${removedList.join(", ")}**\n`;
        if (skippedAdd.length > 0) desc += `Skipped (already added): **${skippedAdd.join(", ")}**\n`;
        if (skippedRemove.length > 0) desc += `Skipped (not in list): **${skippedRemove.join(", ")}**\n`;

        if (!addInput && !removeInput) {
            desc += `*No changes requested. Showing current list.*`;
        }

        desc += `\n\n**Currently Recruiting:**\n${previewString}`;

        const embed = new EmbedBuilder()
            .setColor(addedList.length > 0 ? 0x2ecc71 : (removedList.length > 0 ? 0xe74c3c : 0x3498db))
            .setTitle(`✅ Welcome Message Town Halls`)
            .setDescription(desc)
            .setFooter({ text: 'Changes take effect immediately for all new members.' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
