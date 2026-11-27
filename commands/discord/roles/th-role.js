const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType
} = require("discord.js");
const { checkPermission } = require("../../../utils/checkPermission.js");

const ACTION_CHOICES = [
    { name: "List", value: "list" },
    { name: "Add", value: "add" },
    { name: "Remove / Update", value: "remove_update" }
];

function parseThNumber(raw) {
    if (!raw || typeof raw !== "string") return null;
    const digits = raw.trim().replace(/[^0-9]/g, "");
    if (!digits) return null;
    const num = parseInt(digits, 10);
    if (!Number.isFinite(num) || num < 1 || num > 35) return null;
    return String(num);
}

function parseRoleId(raw) {
    if (!raw || typeof raw !== "string") return null;
    const digits = raw.trim().replace(/[^0-9]/g, "");
    if (!/^\d{17,20}$/.test(digits)) return null;
    return digits;
}

function buildThRolesEmbed(thRoles, emojiUtils) {
    const sortedKeys = Object.keys(thRoles).sort((a, b) => Number(b) - Number(a));
    if (sortedKeys.length === 0) return null;

    const lines = sortedKeys.map(th => {
        const roleId = thRoles[th];
        const thEmoji = (emojiUtils && typeof emojiUtils.getThEmoji === "function"
            ? emojiUtils.getThEmoji(th, `TH${th}`)
            : (emojiUtils?.getEmoji?.(`th${th}`) || "🏰"));
        return `${thEmoji} **TH${th}** : <@&${roleId}> (\`${roleId}\`)`;
    });

    return new EmbedBuilder()
        .setTitle("🏰 Town Hall Roles")
        .setColor(0x3498DB)
        .setDescription(lines.join("\n"))
        .setFooter({ text: "Stored in MongoDB (discord.throles)" })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("th-role")
        .setDescription("List, add, update, or remove Town Hall Discord roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName("action")
                .setDescription("Action to perform (List, Add, Remove / Update)")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focused = (interaction.options.getFocused() || "").toLowerCase().trim();
        const filtered = ACTION_CHOICES.filter(c =>
            c.name.toLowerCase().includes(focused) || c.value.toLowerCase().includes(focused)
        );
        await interaction.respond(filtered).catch(() => {});
    },

    async execute(interaction, context) {
        const dataManager = context?.data || require("../../../utils/dataManager.js");
        const emojiUtils = context?.emoji || require("../../../utils/emoji.js");

        if (!checkPermission("th-role", interaction)) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const action = (interaction.options.getString("action", true) || "").toLowerCase().trim();

        // 1. LIST
        if (action === "list") {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                if (typeof dataManager.initThRolesFromMongo === "function") {
                    await dataManager.initThRolesFromMongo();
                }
                const thRoles = dataManager.getThRoles();
                const embed = buildThRolesEmbed(thRoles, emojiUtils);
                if (!embed) {
                    return interaction.editReply({ content: "⚠️ No TH roles configured in MongoDB (`discord.throles`)." });
                }
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("[/th-role list] Error:", err);
                return interaction.editReply({ content: `❌ Failed to fetch TH roles: ${err.message}` });
            }
        }

        // 2. ADD
        if (action === "add") {
            const modalId = `throle_add_${interaction.id}`;
            const modal = new ModalBuilder()
                .setCustomId(modalId)
                .setTitle("Add Town Hall Role");

            const thInput = new TextInputBuilder()
                .setCustomId("th_level")
                .setLabel("Town Hall Level (e.g. 19 or th19)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("19")
                .setRequired(true)
                .setMaxLength(10);

            const roleInput = new TextInputBuilder()
                .setCustomId("role_id")
                .setLabel("Discord Role ID")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("1575763435403218975")
                .setRequired(true)
                .setMaxLength(30);

            modal.addComponents(
                new ActionRowBuilder().addComponents(thInput),
                new ActionRowBuilder().addComponents(roleInput)
            );

            await interaction.showModal(modal);

            let modalSubmit;
            try {
                modalSubmit = await interaction.awaitModalSubmit({
                    filter: (m) => m.customId === modalId && m.user.id === interaction.user.id,
                    time: 900000
                });
            } catch (_) {
                return;
            }

            const rawTh = modalSubmit.fields.getTextInputValue("th_level");
            const rawRole = modalSubmit.fields.getTextInputValue("role_id");
            const thNum = parseThNumber(rawTh);
            const roleId = parseRoleId(rawRole);

            if (!thNum) {
                return modalSubmit.reply({
                    content: `❌ Invalid Town Hall level \`${rawTh}\`. Enter a valid TH (e.g., \`19\` or \`th19\`).`,
                    flags: [MessageFlags.Ephemeral]
                });
            }
            if (!roleId) {
                return modalSubmit.reply({
                    content: `❌ Invalid Role ID \`${rawRole}\`. Please enter a valid Discord role ID.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });
            await dataManager.setThRole(thNum, roleId);

            const thEmoji = emojiUtils?.getEmoji?.(`th${thNum}`) || "🏰";
            return modalSubmit.editReply({
                content: `✅ Saved TH role in MongoDB:\n${thEmoji} **TH${thNum}** : <@&${roleId}> (\`${roleId}\`)`
            });
        }

        // 3. REMOVE / UPDATE -> Show list + Update / Remove buttons
        if (action === "remove_update" || action === "remove" || action === "update") {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
                if (typeof dataManager.initThRolesFromMongo === "function") {
                    await dataManager.initThRolesFromMongo();
                }
                const thRoles = dataManager.getThRoles();
                const embed = buildThRolesEmbed(thRoles, emojiUtils);
                if (!embed) {
                    return interaction.editReply({ content: "⚠️ No TH roles configured in MongoDB (`discord.throles`)." });
                }

                const updateBtnId = `throle_btn_update_${interaction.id}`;
                const removeBtnId = `throle_btn_remove_${interaction.id}`;

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(updateBtnId)
                        .setLabel("Update")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("✏️"),
                    new ButtonBuilder()
                        .setCustomId(removeBtnId)
                        .setLabel("Remove")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🗑️")
                );

                const msg = await interaction.editReply({
                    embeds: [embed],
                    components: [btnRow]
                });

                const btnCollector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    filter: (b) => b.user.id === interaction.user.id && (b.customId === updateBtnId || b.customId === removeBtnId),
                    max: 1
                });

                btnCollector.on("collect", async (btnInteraction) => {
                    const mode = btnInteraction.customId === updateBtnId ? "update" : "remove";
                    const currentRoles = dataManager.getThRoles();
                    const sortedKeys = Object.keys(currentRoles).sort((a, b) => Number(b) - Number(a)).slice(0, 25);

                    const selectId = `throle_select_${mode}_${interaction.id}`;
                    const options = sortedKeys.map(th => ({
                        label: `TH${th}`,
                        description: `Current Role ID: ${currentRoles[th]}`,
                        value: th
                    }));

                    const selectRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(selectId)
                            .setPlaceholder(mode === "update" ? "Select a TH level to update" : "Select a TH level to remove")
                            .addOptions(options)
                    );

                    await btnInteraction.update({
                        content: mode === "update"
                            ? "✏️ **Select the Town Hall level you want to update:**"
                            : "🗑️ **Select the Town Hall level you want to remove:**",
                        embeds: [embed],
                        components: [selectRow]
                    });

                    const selectCollector = msg.createMessageComponentCollector({
                        componentType: ComponentType.StringSelect,
                        filter: (s) => s.user.id === interaction.user.id && s.customId === selectId,
                        max: 1
                    });

                    selectCollector.on("collect", async (selectInteraction) => {
                        const selectedTh = selectInteraction.values[0];
                        const thEmoji = emojiUtils?.getEmoji?.(`th${selectedTh}`) || "🏰";

                        if (mode === "remove") {
                            await selectInteraction.deferUpdate();
                            const removed = await dataManager.removeThRole(selectedTh);
                            const updatedEmbed = buildThRolesEmbed(dataManager.getThRoles(), emojiUtils);
                            return selectInteraction.editReply({
                                content: removed
                                    ? `🗑️ Removed ${thEmoji} **TH${selectedTh}** role mapping from MongoDB.`
                                    : `⚠️ No mapping found for ${thEmoji} **TH${selectedTh}**.`,
                                embeds: updatedEmbed ? [updatedEmbed] : [],
                                components: []
                            });
                        }

                        // mode === "update" -> open modal for new Role ID
                        const updateModalId = `throle_upd_modal_${interaction.id}`;
                        const updateModal = new ModalBuilder()
                            .setCustomId(updateModalId)
                            .setTitle(`Update TH${selectedTh} Role`);

                        const currentRoleId = currentRoles[selectedTh] || "";
                        const newRoleInput = new TextInputBuilder()
                            .setCustomId("role_id")
                            .setLabel(`New Discord Role ID for TH${selectedTh}`)
                            .setStyle(TextInputStyle.Short)
                            .setValue(currentRoleId)
                            .setPlaceholder("1575763435403218975")
                            .setRequired(true)
                            .setMaxLength(30);

                        updateModal.addComponents(new ActionRowBuilder().addComponents(newRoleInput));
                        await selectInteraction.showModal(updateModal);

                        let modalSubmit;
                        try {
                            modalSubmit = await selectInteraction.awaitModalSubmit({
                                filter: (m) => m.customId === updateModalId && m.user.id === interaction.user.id,
                                time: 900000
                            });
                        } catch (_) {
                            return;
                        }

                        const rawRole = modalSubmit.fields.getTextInputValue("role_id");
                        const newRoleId = parseRoleId(rawRole);
                        if (!newRoleId) {
                            return modalSubmit.reply({
                                content: `❌ Invalid Role ID \`${rawRole}\`. Please enter a valid Discord role ID.`,
                                flags: [MessageFlags.Ephemeral]
                            });
                        }

                        await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });
                        await dataManager.setThRole(selectedTh, newRoleId);
                        const updatedEmbed = buildThRolesEmbed(dataManager.getThRoles(), emojiUtils);

                        await msg.edit({
                            content: `✅ Updated ${thEmoji} **TH${selectedTh}** : <@&${newRoleId}> (\`${newRoleId}\`)`,
                            embeds: updatedEmbed ? [updatedEmbed] : [],
                            components: []
                        }).catch(() => {});

                        return modalSubmit.editReply({
                            content: `✅ Updated ${thEmoji} **TH${selectedTh}** : <@&${newRoleId}> (\`${newRoleId}\`)`
                        });
                    });
                });
            } catch (err) {
                console.error("[/th-role remove_update] Error:", err);
                return interaction.editReply({ content: `❌ Error: ${err.message}` });
            }
            return;
        }

        return interaction.reply({
            content: "❌ Invalid action. Please choose `List`, `Add`, or `Remove / Update`.",
            flags: [MessageFlags.Ephemeral]
        });
    }
};
