const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');
const clanRecruitments = require('../../../utils/clanRecruitments');
const { getThEmoji } = require('../../../utils/emoji');

/**
 * Format the list of tracked Town Halls with their corresponding emojis
 */
function formatThList(trackedTHs, emojiUtils) {
    if (!trackedTHs || trackedTHs.length === 0) {
        return "*(No Town Hall levels currently in rotation)*";
    }
    return trackedTHs.map(th => {
        const clean = th.toLowerCase().replace(/^th/, '');
        let emoji = null;
        if (emojiUtils && typeof emojiUtils.getEmoji === 'function') {
            emoji = emojiUtils.getEmoji("th" + clean);
        }
        if (!emoji) {
            emoji = getThEmoji(clean) || "🏰";
        }
        return `${emoji} **${th}**`;
    }).join('\n');
}

module.exports = {
    name: "rotations",
    description: "Manage Town Hall levels tracked in clan recruitment rotations",
    data: new SlashCommandBuilder()
        .setName("rotations")
        .setDescription("Manage Town Hall levels tracked in clan recruitment rotations")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName("action")
                .setDescription("Select action to perform")
                .setRequired(true)
                .addChoices(
                    { name: "Add", value: "add" },
                    { name: "Remove", value: "remove" },
                    { name: "List", value: "list" }
                )
        ),

    async execute(interaction, context) {
        const { emoji: emojiUtils } = context;

        // Permission check
        if (!checkPermission('rotations', interaction) && !checkPermission('assignclan', interaction)) {
            return interaction.reply({
                content: "❌ You do not have permission to manage rotation Town Halls.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const action = interaction.options.getString('action');

        // 1. LIST
        if (action === 'list') {
            const currentList = clanRecruitments.getTrackedRotationTHs();
            const listDisplay = formatThList(currentList, emojiUtils);

            const embed = new EmbedBuilder()
                .setTitle("🔄 Clan Recruitment Rotation Town Halls")
                .setColor(0x3498DB)
                .setDescription(
                    `The following Town Hall levels are currently tracked in independent recruitment rotations:\n\n` +
                    listDisplay
                )
                .setFooter({ text: "Rotation limit: 1 player per clan before auto-reset." })
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 2. ADD (Opens Form / Modal)
        if (action === 'add') {
            const modal = new ModalBuilder()
                .setCustomId(`rot_add_modal_${interaction.id}`)
                .setTitle("Add Rotation Town Hall");

            const thInput = new TextInputBuilder()
                .setCustomId("th_level")
                .setLabel("Town Hall Level")
                .setPlaceholder("e.g. 17 or TH17")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10);

            const row = new ActionRowBuilder().addComponents(thInput);
            modal.addComponents(row);

            await interaction.showModal(modal);

            try {
                const submitted = await interaction.awaitModalSubmit({
                    filter: (i) => i.customId === `rot_add_modal_${interaction.id}` && i.user.id === interaction.user.id,
                    time: 120000
                });

                const rawVal = submitted.fields.getTextInputValue("th_level");
                const result = clanRecruitments.addTrackedRotationTH(rawVal);

                if (result.invalid) {
                    return submitted.reply({
                        content: `❌ Invalid Town Hall level "${rawVal}". Please enter a valid number or tag (e.g. 17, TH17).`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const thKey = result.th;
                const thEmoji = emojiUtils?.getEmoji("th" + thKey.replace('TH', '')) || getThEmoji(thKey) || "🏰";
                const listDisplay = formatThList(result.trackedTHs, emojiUtils);

                if (result.alreadyExists) {
                    const embed = new EmbedBuilder()
                        .setTitle("ℹ️ Town Hall Already in Rotation")
                        .setColor(0xE67E22)
                        .setDescription(
                            `**${thKey}** is already in the rotation list.\n\n` +
                            `**Current Rotation List:**\n${listDisplay}`
                        )
                        .setTimestamp();

                    return submitted.reply({
                        embeds: [embed],
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle("✅ Town Hall Added to Rotation")
                    .setColor(0x2ECC71)
                    .setDescription(
                        `Successfully added ${thEmoji} **${thKey}** to the rotation list.\n\n` +
                        `**Current Rotation List:**\n${listDisplay}`
                    )
                    .setFooter({ text: "Rotation limit: 1 player per clan before auto-reset." })
                    .setTimestamp();

                return submitted.reply({
                    embeds: [embed],
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (err) {
                // Modal timed out or was dismissed
                return;
            }
        }

        // 3. REMOVE (Opens Form / Modal)
        if (action === 'remove') {
            const currentList = clanRecruitments.getTrackedRotationTHs();
            const modal = new ModalBuilder()
                .setCustomId(`rot_remove_modal_${interaction.id}`)
                .setTitle("Remove Rotation Town Hall");

            const thInput = new TextInputBuilder()
                .setCustomId("th_level")
                .setLabel("Town Hall Level to Remove")
                .setPlaceholder(`e.g. ${currentList.join(', ')}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10);

            const row = new ActionRowBuilder().addComponents(thInput);
            modal.addComponents(row);

            await interaction.showModal(modal);

            try {
                const submitted = await interaction.awaitModalSubmit({
                    filter: (i) => i.customId === `rot_remove_modal_${interaction.id}` && i.user.id === interaction.user.id,
                    time: 120000
                });

                const rawVal = submitted.fields.getTextInputValue("th_level");
                const result = clanRecruitments.removeTrackedRotationTH(rawVal);

                if (result.invalid) {
                    return submitted.reply({
                        content: `❌ Invalid Town Hall level "${rawVal}". Please enter a valid number or tag (e.g. 18, TH18).`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const thKey = result.th;
                const thEmoji = emojiUtils?.getEmoji("th" + thKey.replace('TH', '')) || getThEmoji(thKey) || "🏰";
                const listDisplay = formatThList(result.trackedTHs, emojiUtils);

                if (result.notFound) {
                    const embed = new EmbedBuilder()
                        .setTitle("⚠️ Town Hall Not in Rotation")
                        .setColor(0xE74C3C)
                        .setDescription(
                            `**${thKey}** was not found in the rotation list.\n\n` +
                            `**Current Rotation List:**\n${listDisplay}`
                        )
                        .setTimestamp();

                    return submitted.reply({
                        embeds: [embed],
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle("🗑️ Town Hall Removed from Rotation")
                    .setColor(0xE74C3C)
                    .setDescription(
                        `Successfully removed ${thEmoji} **${thKey}** from the rotation list.\n\n` +
                        `**Current Rotation List:**\n${listDisplay}`
                    )
                    .setFooter({ text: "Rotation limit: 1 player per clan before auto-reset." })
                    .setTimestamp();

                return submitted.reply({
                    embeds: [embed],
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (err) {
                // Modal timed out or was dismissed
                return;
            }
        }
    }
};
