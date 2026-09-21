const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mailCommand = require("./mail.js");

/**
 * Resolve clan tag from either a raw tag (#TAG or TAG) or a registered nickname (e.g. BB, BL)
 * @param {string} input - User input
 * @param {Object} clanRoles - Mappings from clanrole.json
 * @returns {string|null} Resolved clan tag with '#' or null
 */
function resolveClanTag(input, clanRoles) {
    if (!input || typeof input !== "string") return null;
    const clean = input.trim();
    if (!clean) return null;

    const upper = clean.toUpperCase();
    const withHash = upper.startsWith("#") ? upper : `#${upper}`;

    // 1. Direct tag match with '#'
    if (clanRoles[withHash]) return withHash;

    // 2. Direct tag match without '#'
    if (clanRoles[upper]) return upper;

    // 3. Match by nickname (case-insensitive)
    for (const [tag, data] of Object.entries(clanRoles)) {
        if (data.nickName && data.nickName.trim().toUpperCase() === upper) {
            return tag;
        }
    }

    // 4. Tag without '#' matching stored tags
    const rawTag = upper.replace("#", "");
    for (const tag of Object.keys(clanRoles)) {
        if (tag.replace("#", "").toUpperCase() === rawTag) {
            return tag;
        }
    }

    // 5. Match by clanName if available
    for (const [tag, data] of Object.entries(clanRoles)) {
        if (data.clanName && data.clanName.trim().toUpperCase() === upper) {
            return tag;
        }
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("war_mail")
        .setDescription("Send war mail with a specified decision to a clan's mail channel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Clan tag (#TAG) or clan nickname (e.g. BB)")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option.setName("decision")
                .setDescription("War decision (win, lose, mis, bl)")
                .setRequired(true)
                .addChoices(
                    { name: "win", value: "win" },
                    { name: "lose", value: "lose" },
                    { name: "mis", value: "mis" },
                    { name: "bl", value: "bl" }
                )
        ),

    async autocomplete(interaction, context) {
        try {
            const dataMgr = context?.data || require("../../../utils/dataManager.js");
            const clanRoles = dataMgr.getClanRoles();
            const focusedValue = interaction.options.getFocused().toLowerCase().trim();

            const choices = [];
            for (const [tag, data] of Object.entries(clanRoles)) {
                const label = data.nickName ? `${data.nickName} (${tag})` : tag;
                choices.push({ name: label, value: tag });
            }

            const filtered = choices.filter(choice =>
                choice.name.toLowerCase().includes(focusedValue) ||
                choice.value.toLowerCase().includes(focusedValue)
            );

            await interaction.respond(filtered.slice(0, 25)).catch(() => {});
        } catch (err) {
            console.error("Autocomplete error in war_mail:", err);
            await interaction.respond([]).catch(() => {});
        }
    },

    async execute(interaction, context) {
        const coc = context?.coc || require("../../../utils/cocManager.js");
        const dataManager = context?.data || require("../../../utils/dataManager.js");
        const emojiUtils = context?.emoji || require("../../../utils/emoji.js");
        const client = context?.client || interaction.client;
        const config = context?.config || require("../../../config/config.js");

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (err) {
            if (err.code !== 10062) console.error(err);
            return;
        }

        try {
            const clanInput = interaction.options.getString("clan");
            const decision = interaction.options.getString("decision")?.toLowerCase();

            const clanRoles = dataManager.getClanRoles();
            const targetClanTag = resolveClanTag(clanInput, clanRoles);

            if (!targetClanTag || !clanRoles[targetClanTag]) {
                const available = Object.entries(clanRoles)
                    .map(([tag, data]) => `• **${data.nickName || "Clan"}** (\`${tag}\`)`)
                    .slice(0, 25)
                    .join("\n");

                return interaction.editReply({
                    content: `❌ Clan **${clanInput}** was not found in registered clan roles.\n\n**Available Clans:**\n${available || "None configured."}`
                });
            }

            const roleData = clanRoles[targetClanTag];

            // Permissions: Manage Roles, Admin, Staff roles, or Clan Leader role
            const allowedRoles = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];
            const isAdmin = interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
            const hasManageRoles = interaction.member.permissions?.has(PermissionFlagsBits.ManageRoles);
            const isStaffOrAdmin = interaction.member.roles?.cache.some(r => allowedRoles.includes(r.id));
            const isClanLeader = roleData.leaderRoleId && interaction.member.roles?.cache.has(roleData.leaderRoleId);

            if (!isAdmin && !hasManageRoles && !isStaffOrAdmin && !isClanLeader) {
                const leaderMsg = roleData.leaderRoleId ? `<@&${roleData.leaderRoleId}>` : "Clan Leader";
                return interaction.editReply({
                    content: `❌ You do not have permission to send war mail for this clan (Requires Manage Roles, ${leaderMsg}, Staff, or Admin).`
                });
            }

            // Map decision to match type and result
            let matchType = "FWA Match";
            let isWin = false;
            let decisionLabel = "Win";

            if (decision === "win") {
                matchType = "FWA Match";
                isWin = true;
                decisionLabel = "Win";
            } else if (decision === "lose") {
                matchType = "FWA Match";
                isWin = false;
                decisionLabel = "Lose";
            } else if (decision === "mis") {
                matchType = "Mismatch";
                isWin = false;
                decisionLabel = "Mismatch";
            } else if (decision === "bl") {
                matchType = "Blacklisted Match";
                isWin = false;
                decisionLabel = "Blacklisted Match";
            } else {
                return interaction.editReply({
                    content: `❌ Invalid decision \`${decision}\`. Allowed options: \`win\`, \`lose\`, \`mis\`, \`bl\`.`
                });
            }

            const clanData = await coc.getClan(targetClanTag).catch(() => null);
            if (!clanData) {
                return interaction.editReply({
                    content: `❌ Failed to fetch clan details for \`${targetClanTag}\` from Clash of Clans API.`
                });
            }

            let currentWar = null;
            try {
                currentWar = await coc.getCurrentWar(targetClanTag);
            } catch (warErr) {
                return interaction.editReply({
                    content: `❌ Error fetching war data for **${clanData.name}** (\`${targetClanTag}\`): ${warErr.message || "War log may be private"}.`
                });
            }

            if (!currentWar || currentWar.state === "notInWar") {
                return interaction.editReply({
                    content: `❌ Clan **${clanData.name}** (\`${targetClanTag}\`) is currently not in war (\`notInWar\`). Cannot send war mail.`
                });
            }

            const opponentTagFromApi = currentWar?.opponent?.tag || "N/A";
            const opponentName = currentWar?.opponent?.name || "Unknown Opponent";

            const apiLogger = async (msg) => {
                if (msg) {
                    const lower = msg.toLowerCase();
                    const isTokenError = lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied");
                    const isIgnorable = lower.includes("coc api") || lower.includes("clash api") || lower.includes("fetch") || 
                                        lower.includes("timeout") || lower.includes("503") || lower.includes("504") || 
                                        lower.includes("502") || lower.includes("500") || lower.includes("network error") || 
                                        lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("api_maintenance_pause");
                    if (isIgnorable && !isTokenError) return;
                }
                const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
                const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
                if (logChannel) await logChannel.send(`\`[WAR MAIL LOG]\` ${msg}`).catch(() => null);
            };

            // Attempt to fetch FWA details (points, sync, warId)
            let fwaData = null;
            try {
                if (mailCommand.fetchDetailedWarData) {
                    fwaData = await mailCommand.fetchDetailedWarData(targetClanTag, opponentTagFromApi, apiLogger);
                    if (fwaData) {
                        fwaData.tieBreakerNote = ""; // Decision is explicitly chosen by user
                    }
                }
            } catch (fwaErr) {
                // Graceful fallback if scraping fails
            }

            if (!fwaData) {
                fwaData = {
                    warInfo: {
                        syncNumber: "N/A",
                        warId: "N/A",
                        opponentTag: opponentTagFromApi,
                        opponentName: opponentName
                    },
                    pointsSummary: "N/A",
                    tieBreakerNote: ""
                };
            }

            // Dispatch war mail using same embed structure as mail.js
            const success = await mailCommand.dispatchWarEmbed(
                client,
                coc,
                emojiUtils,
                targetClanTag,
                roleData,
                clanData,
                currentWar,
                matchType,
                isWin,
                fwaData,
                apiLogger
            );

            const targetChannelId = roleData.mailChannelId && roleData.mailChannelId.trim() !== "" ? roleData.mailChannelId : roleData.channelId;

            if (success) {
                // Update warState.json to avoid duplicate prompt from auto monitor
                try {
                    const STATE_PATH = path.join(__dirname, "../../../data/warState.json");
                    const warState = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) : {};
                    const warUniqueId = `${currentWar.opponent?.tag || opponentTagFromApi || "N/A"}_${currentWar?.preparationStartTime || "N/A"}`;
                    warState[targetClanTag] = warUniqueId;
                    fs.writeFileSync(STATE_PATH, JSON.stringify(warState, null, 2));
                } catch (stateErr) {
                    console.error("Failed to update warState.json:", stateErr);
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle("✅ War Mail Dispatched")
                    .setColor(decision === "win" ? 0x00FF00 : (decision === "lose" || decision === "bl" ? 0xFF0000 : 0xFFA500))
                    .setDescription(
                        `War mail for **${clanData.name}** (\`${targetClanTag}\`) has been successfully sent to <#${targetChannelId}>.\n\n` +
                        `• **Decision:** **${decisionLabel}**\n` +
                        `• **Match Type:** ${matchType}\n` +
                        `• **Opponent:** ${opponentName} (\`${opponentTagFromApi}\`)\n` +
                        `• **Triggered by:** ${interaction.user}`
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });
            } else {
                return interaction.editReply({
                    content: `❌ Failed to send war mail to channel <#${targetChannelId}>. Please check bot permissions in that channel.`
                });
            }

        } catch (error) {
            console.error("Error executing /war_mail command:", error);
            return interaction.editReply({
                content: `❌ An unexpected error occurred while executing /war_mail: ${error.message}`
            }).catch(() => {});
        }
    }
};
