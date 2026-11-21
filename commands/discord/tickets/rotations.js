const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
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
                .setDescription("Action to perform: add, remove, or list")
                .setRequired(false)
                .addChoices(
                    { name: "📋 List Active Rotation THs", value: "list" },
                    { name: "➕ Add TH to Rotation", value: "add" },
                    { name: "➖ Remove TH from Rotation", value: "remove" }
                )
        )
        .addStringOption(option =>
            option.setName("th")
                .setDescription("Town Hall level for add/remove (e.g. 19, TH19, 18, TH18)")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName("add")
                .setDescription("Directly add a Town Hall level to rotation (e.g. 19, TH19)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("remove")
                .setDescription("Directly remove a Town Hall level from rotation (e.g. 18, TH18)")
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option.setName("list")
                .setDescription("View the current rotation Town Halls list")
                .setRequired(false)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        const currentList = clanRecruitments.getTrackedRotationTHs();
        const input = (focused.value || "").toLowerCase().trim();

        // If removing or action is remove, suggest currently tracked THs
        if (focused.name === "remove" || interaction.options.getString("action") === "remove") {
            const choices = currentList
                .filter(th => th.toLowerCase().includes(input))
                .map(th => ({ name: th, value: th }));
            return interaction.respond(choices.slice(0, 25)).catch(() => {});
        }

        // If adding, suggest common TH levels
        const allPossible = ["TH19", "TH18", "TH17", "TH16", "TH15", "TH14", "TH13", "TH12", "TH11"];
        const choices = allPossible
            .filter(th => th.toLowerCase().includes(input))
            .map(th => ({ name: th, value: th }));
        return interaction.respond(choices.slice(0, 25)).catch(() => {});
    },

    async execute(interaction, context) {
        const { emoji: emojiUtils } = context;

        // Permission check
        if (!checkPermission('rotations', interaction) && !checkPermission('assignclan', interaction)) {
            return interaction.reply({
                content: "❌ You do not have permission to manage rotation Town Halls.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        let action = interaction.options.getString('action');
        let thInput = interaction.options.getString('th');
        const addInput = interaction.options.getString('add');
        const removeInput = interaction.options.getString('remove');
        const listInput = interaction.options.getBoolean('list');

        if (addInput) {
            action = 'add';
            thInput = addInput;
        } else if (removeInput) {
            action = 'remove';
            thInput = removeInput;
        } else if (listInput || (!action && !thInput)) {
            action = 'list';
        }

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

        // 2. ADD
        if (action === 'add') {
            if (!thInput) {
                return interaction.reply({
                    content: "❌ Please provide a Town Hall level to add (e.g. `/rotations action:add th:19` or `/rotations add:19`).",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const result = clanRecruitments.addTrackedRotationTH(thInput);

            if (result.invalid) {
                return interaction.reply({
                    content: `❌ Invalid Town Hall level "${thInput}". Please enter a valid number or tag (e.g. 19, TH19, 18, TH18).`,
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

                return interaction.reply({
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

            return interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 3. REMOVE
        if (action === 'remove') {
            if (!thInput) {
                return interaction.reply({
                    content: "❌ Please provide a Town Hall level to remove (e.g. `/rotations action:remove th:18` or `/rotations remove:18`).",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const result = clanRecruitments.removeTrackedRotationTH(thInput);

            if (result.invalid) {
                return interaction.reply({
                    content: `❌ Invalid Town Hall level "${thInput}". Please enter a valid number or tag (e.g. 19, TH19, 18, TH18).`,
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

                return interaction.reply({
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

            return interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral]
            });
        }

        return interaction.reply({
            content: "❌ Unknown action. Use `list`, `add`, or `remove`.",
            flags: [MessageFlags.Ephemeral]
        });
    }
};

