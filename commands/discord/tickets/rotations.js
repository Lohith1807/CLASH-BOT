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
                .setDescription("Action to perform: list, add <TH>, or remove <TH>")
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        const currentList = clanRecruitments.getTrackedRotationTHs();
        const input = (focused.value || "").toLowerCase().trim();

        const allPossible = ["TH19", "TH18", "TH17", "TH16", "TH15", "TH14", "TH13", "TH12", "TH11", "TH10"];
        const notTracked = allPossible.filter(th => !currentList.includes(th));
        const choices = [];

        // 1. Suggest 'list'
        if (!input || "list".startsWith(input)) {
            choices.push({ name: `📋 list — View active Town Hall rotations (${currentList.join(', ')})`, value: "list" });
        }

        // 2. Suggest 'add' actions
        if (!input || input.startsWith("add") || input.startsWith("+") || /^(th)?[0-9]+/i.test(input)) {
            const cleanSearch = input.replace(/^(add|\+)\s*/i, '').trim();
            for (const th of notTracked) {
                if (!cleanSearch || th.toLowerCase().includes(cleanSearch) || th.replace('TH', '').includes(cleanSearch)) {
                    choices.push({ name: `➕ add ${th} — Add ${th} to rotations`, value: `add ${th}` });
                }
            }
            if (cleanSearch && /^[0-9]+$/.test(cleanSearch)) {
                const customTh = `TH${cleanSearch}`;
                if (!choices.some(c => c.value === `add ${customTh}`)) {
                    choices.push({ name: `➕ add ${customTh} — Add ${customTh} to rotations`, value: `add ${customTh}` });
                }
            }
        }

        // 3. Suggest 'remove' actions
        if (!input || input.startsWith("rem") || input.startsWith("del") || input.startsWith("-") || /^(th)?[0-9]+/i.test(input)) {
            const cleanSearch = input.replace(/^(remove|delete|del|rem|\-)\s*/i, '').trim();
            for (const th of currentList) {
                if (!cleanSearch || th.toLowerCase().includes(cleanSearch) || th.replace('TH', '').includes(cleanSearch)) {
                    choices.push({ name: `➖ remove ${th} — Remove ${th} from rotations`, value: `remove ${th}` });
                }
            }
        }

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

        const actionInput = interaction.options.getString('action');
        let action = 'list';
        let thInput = null;

        if (actionInput) {
            const trimmed = actionInput.trim();
            if (/^(add|\+)/i.test(trimmed)) {
                action = 'add';
                thInput = trimmed.replace(/^(add|\+)\s*/i, '').trim();
            } else if (/^(remove|delete|del|rem|\-)/i.test(trimmed)) {
                action = 'remove';
                thInput = trimmed.replace(/^(remove|delete|del|rem|\-)\s*/i, '').trim();
            } else if (/^list/i.test(trimmed)) {
                action = 'list';
            } else {
                // If the user typed a TH directly like '17' or 'TH17'
                const normalized = clanRecruitments.normalizeTh(trimmed);
                if (normalized) {
                    const currentList = clanRecruitments.getTrackedRotationTHs();
                    if (currentList.includes(normalized)) {
                        action = 'remove';
                        thInput = normalized;
                    } else {
                        action = 'add';
                        thInput = normalized;
                    }
                } else {
                    action = 'list';
                }
            }
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
                    content: "❌ Please provide a Town Hall level to add (e.g. `/rotations action:add TH17`).",
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
                    content: "❌ Please provide a Town Hall level to remove (e.g. `/rotations action:remove TH18`).",
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

