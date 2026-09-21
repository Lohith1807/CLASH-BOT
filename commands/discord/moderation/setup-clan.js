const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    PermissionFlagsBits,
    MessageFlags } = require("discord.js");
const { getEmoji } = require("../../../utils/emoji.js");

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

// These must be at module scope so nested collectors can access them
const SETTING_LABELS = {
    autorole: "Auto Role Removal",
    tracker:  "Join / Leave Tracker",
    welcome:  "Welcome Messages",
    status:   "Clan Status",
};

const SETTING_FIELDS = {
    autorole: "autoRole",
    tracker:  "joinLeaveTracker",
    welcome:  "welcomeMessage",
    status:   "clanStatus",
};

function statusTag(val) {
    return val ? `${getEmoji("greendot")} **Enabled**` : `${getEmoji("reddot")} **Disabled**`;
}

function clanStatusTag(val) {
    const isOfficial = (val || "official") === "official";
    return isOfficial ? `${getEmoji("greendot")} **Official**` : `${getEmoji("reddot")} **Unofficial**`;
}

/** Build the main panel embed for a clan */
function buildPanelEmbed(clanTag, info, clanBadge) {
    const parrow  = getEmoji("parrow");
    const sheild  = getEmoji("sheild");
    const refresh = getEmoji("refresh");
    const book    = getEmoji("book");

    return new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({
            name:    `${info.nickName || clanTag}  •  ${clanTag}`,
            iconURL: clanBadge || undefined,
        })
        .setTitle(`${sheild} Clan Settings Panel`)
        .addFields(
            {
                name:   `${refresh} Auto Role Removal`,
                value:  statusTag(info.autoRole),
                inline: true,
            },

            {
                name:   `${parrow} Join / Leave Tracker`,
                value:  statusTag(info.joinLeaveTracker),
                inline: true,
            },
            {
                name:   `👋 Welcome Messages`,
                value:  statusTag(info.welcomeMessage),
                inline: true,
            },
            {
                name:   `🏛️ Clan Status`,
                value:  clanStatusTag(info.clanStatus),
                inline: true,
            }
        )
        .setFooter({ text: "Click a button below to toggle a setting" })
        .setTimestamp();
}

/** Build the toggle buttons row */
function buildButtonRow(clanTag) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`setup_clan:autorole:${clanTag}`)
            .setLabel("Auto Role Removal")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`setup_clan:tracker:${clanTag}`)
            .setLabel("Join / Leave Tracker")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`setup_clan:welcome:${clanTag}`)
            .setLabel("Welcome Messages")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`setup_clan:status:${clanTag}`)
            .setLabel("Clan Status")
            .setStyle(ButtonStyle.Secondary),
    );
}

/** Confirm embed shown in a private follow-up */
function buildConfirmEmbed(settingKey, settingLabel, currentVal) {
    const parrow = getEmoji("parrow");
    if (settingKey === "status") {
        const curStatus = currentVal || "official";
        const newStatus = curStatus === "official" ? "unofficial" : "official";
        return new EmbedBuilder()
            .setColor(0xF39C12)
            .setTitle(`${parrow} Confirm Change`)
            .setDescription(
                `You are about to change **${settingLabel}** from ${clanStatusTag(curStatus)} to ${clanStatusTag(newStatus)}.\n\n` +
                `Are you sure you want to make this change?`
            );
    }
    const action = currentVal ? "disable" : "enable";
    return new EmbedBuilder()
        .setColor(0xF39C12)
        .setTitle(`${parrow} Confirm Change`)
        .setDescription(
            `You are about to **${action}** **${settingLabel}**.\n\n` +
            `Current Status: ${statusTag(currentVal)}\n\n` +
            `Are you sure you want to make this change?`
        );
}

function buildConfirmRow(settingKey, clanTag) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`setup_clan_confirm:yes:${settingKey}:${clanTag}`)
            .setLabel("Yes, Apply Change")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`setup_clan_confirm:no:${settingKey}:${clanTag}`)
            .setLabel("No, Cancel")
            .setStyle(ButtonStyle.Danger),
    );
}

// ─────────────────────────────────────────────
//  Fetch clan badge from CoC API
// ─────────────────────────────────────────────
async function fetchBadge(coc, clanTag) {
    try {
        const clan = await coc.getClan(clanTag);
        return clan?.badgeUrls?.small || null;
    } catch { return null; }
}

// ─────────────────────────────────────────────
//  Command
// ─────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup-clan")
        .setDescription("Manage per-clan settings: Auto Role, Auto Post, Join/Leave Tracker")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option
                .setName("clan")
                .setDescription("Select the clan to configure")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    // ── Autocomplete ────────────────────────────────────────────────────────
    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles    = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const choices = Object.entries(clanRoles)
            .map(([tag, info]) => ({
                name:  `${info.nickName || tag}  (${tag})`,
                value: tag,
            }))
            .filter(c =>
                c.name.toLowerCase().includes(focusedValue) ||
                c.value.toLowerCase().includes(focusedValue)
            )
            .slice(0, 25);

        await interaction.respond(choices);
    },

    // ── Execute ─────────────────────────────────────────────────────────────
    async execute(interaction, context) {
        const { data: dataManager, config, coc } = context;

        // Permission check
        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = interaction.member.roles.cache.some(r => allowedRoles.includes(r.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({
                content: "❌ You do not have permission to use this command.",
                flags: [MessageFlags.Ephemeral],
            });
        }

        const clanTag  = interaction.options.getString("clan");
        const clanRoles = dataManager.getClanRoles();
        const clanInfo  = clanRoles[clanTag];

        if (!clanInfo) {
            return interaction.reply({ content: "❌ Clan not found.", flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; }

        const badge = await fetchBadge(coc, clanTag);

        const panelEmbed = buildPanelEmbed(clanTag, clanInfo, badge);
        const buttonRow  = buildButtonRow(clanTag);

        const response = await interaction.editReply({
            embeds:     [panelEmbed],
            components: [buttonRow],
        });

        // ── Button collector — main panel (no expiry) ──────────────────
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
        });

        collector.on("collect", async (btn) => {
            if (btn.user.id !== interaction.user.id) {
                return btn.reply({ content: "❌ This panel is not for you.", flags: [MessageFlags.Ephemeral] });
            }

            const [, settingKey, tag] = btn.customId.split(":");

            const freshRoles   = dataManager.getClanRoles();
            const freshInfo    = freshRoles[tag];
            const currentVal   = settingKey === "status" ? (freshInfo.clanStatus || "official") : !!freshInfo[SETTING_FIELDS[settingKey]];
            const settingLabel = SETTING_LABELS[settingKey];
            const confirmEmbed = buildConfirmEmbed(settingKey, settingLabel, currentVal);
            const confirmRow   = buildConfirmRow(settingKey, tag);

            await btn.reply({
                embeds:     [confirmEmbed],
                components: [confirmRow],
                flags: [MessageFlags.Ephemeral],
            });
            const confirmMsg = await btn.fetchReply();

            // ── Confirm collector (no expiry) ──────────────────────────
            const confirmCollector = confirmMsg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                max: 1,
            });

            confirmCollector.on("collect", async (confirmBtn) => {
                const [, answer, key, clanTagInner] = confirmBtn.customId.split(":");

                if (answer === "no") {
                    return confirmBtn.update({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x95A5A6)
                                .setDescription(`${getEmoji("wrongbox")} Change cancelled.`),
                        ],
                        components: [],
                    });
                }

                // Apply toggle
                const roles = dataManager.getClanRoles();
                let confirmColor;
                let confirmDescription;

                if (key === "status") {
                    const curStatus = roles[clanTagInner].clanStatus || "official";
                    const newStatus = curStatus === "official" ? "unofficial" : "official";
                    roles[clanTagInner].clanStatus = newStatus;
                    dataManager.saveClanRoles(roles);

                    confirmColor = (newStatus === "official") ? 0x2ECC71 : 0xE74C3C;
                    confirmDescription = `${getEmoji("tickbox")} **Clan Status** is now ${clanStatusTag(newStatus)} for **${roles[clanTagInner].nickName || clanTagInner}**.`;
                } else {
                    const field = SETTING_FIELDS[key];
                    roles[clanTagInner][field] = !roles[clanTagInner][field];
                    dataManager.saveClanRoles(roles);

                    const newVal = roles[clanTagInner][field];
                    confirmColor = newVal ? 0x2ECC71 : 0xE74C3C;
                    confirmDescription = `${getEmoji("tickbox")} **${SETTING_LABELS[key]}** is now ${statusTag(newVal)} for **${roles[clanTagInner].nickName || clanTagInner}**.`;
                }

                const newBadge = await fetchBadge(coc, clanTagInner);

                // Update confirm to success
                await confirmBtn.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(confirmColor)
                            .setDescription(confirmDescription),
                    ],
                    components: [],
                });

                // Refresh main panel
                const updatedPanel = buildPanelEmbed(clanTagInner, roles[clanTagInner], newBadge);
                await interaction.editReply({
                    embeds:     [updatedPanel],
                    components: [buildButtonRow(clanTagInner)],
                }).catch(() => null);
            });

            confirmCollector.on("end", (collected) => {
                if (collected.size === 0) {
                    confirmMsg.edit({ components: [] }).catch(() => null);
                }
            });
        });
    },
};
