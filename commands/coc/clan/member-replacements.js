const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    PermissionFlagsBits
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const MEMBERS_REPLACE_PATH = path.join(__dirname, "../../../data/members-replace.json");

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getMembersReplace() {
    try {
        if (!fs.existsSync(MEMBERS_REPLACE_PATH)) {
            fs.writeFileSync(MEMBERS_REPLACE_PATH, JSON.stringify({}, null, 2));
            return {};
        }
        const raw = fs.readFileSync(MEMBERS_REPLACE_PATH, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading members-replace.json:", err.message);
        return {};
    }
}

function saveMembersReplace(data) {
    try {
        fs.writeFileSync(MEMBERS_REPLACE_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing members-replace.json:", err.message);
        throw err;
    }
}

// ─── In-memory store for pending add selections ───────────────────────────────
// key: `${userId}_${clanTagClean}` → Map of dropdown selections
const pendingSelections = new Map();

// ─── In-memory store for pending remove selections ────────────────────────────
// key: `${userId}_${clanTagClean}` → Array of player tags
const pendingRemovals = new Map();

// ─── Embed builders ──────────────────────────────────────────────────────────

/**
 * Main overview embed — members grouped by TH level with Open In Game links.
 * @param {Object} clanRoles  - from dataManager.getClanRoles()
 * @param {Object} membersReplace - from getMembersReplace()
 * @param {Object} emojiUtils - context.emoji  { getEmoji, getEmojiObject }
 */
function buildMainEmbed(clanRoles, membersReplace, emojiUtils) {
    const getEmoji = emojiUtils ? emojiUtils.getEmoji : () => "";

    const fwaClans = Object.entries(clanRoles)
        .filter(([, d]) => d.clanType && d.clanType.toLowerCase() === "fwa");

    let description = "";

    for (const [tag, data] of fwaClans) {
        const nick      = data.nickName || tag;
        const clanEmoji = getEmoji(nick.toLowerCase()) || "🏰";
        const list      = membersReplace[tag] || [];

        // Clan header
        description += `${clanEmoji} **${nick}** \`${tag}\`\n`;

        if (list.length === 0) {
            description += `> *(No replacements listed)*\n\n`;
            continue;
        }

        // Group by TH, descending
        const byTH = {};
        for (const entry of list) {
            if (!byTH[entry.thLevel]) byTH[entry.thLevel] = [];
            byTH[entry.thLevel].push(entry);
        }
        const sortedTHs = Object.keys(byTH).map(Number).sort((a, b) => b - a);

        for (const th of sortedTHs) {
            const thEmoji = getEmoji("th" + th) || `🏠`;
            description += `\n${thEmoji} **TH${th} PLAYERS:**\n`;
            for (const entry of byTH[th]) {
                const gameLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(entry.tag)}`;
                description += `> **${entry.name}** — [Open In Game](${gameLink})\n`;
            }
        }
        description += "\n";
    }

    if (fwaClans.length === 0) description = "No FWA clans configured.";

    return new EmbedBuilder()
        .setTitle(`${getEmoji("whitefwa") || "🔄"} Member Replacements`)
        .setColor(0x5865F2)
        .setDescription(description.trim() || "No FWA clans found.")
        .setFooter({ text: "Use the buttons below to manage replacement members" })
        .setTimestamp();
}

/** +Add / -Remove/Update buttons (never expire — no collector) */
function buildActionRow(selectedClan) {
    const clanTagClean = selectedClan ? selectedClan.replace("#", "") : "";
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`memreplace_add_${clanTagClean}`)
            .setLabel("Add")
            .setStyle(ButtonStyle.Success)
            .setEmoji("➕"),
        new ButtonBuilder()
            .setCustomId(`memreplace_remove_${clanTagClean}`)
            .setLabel("Remove / Update")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("➖"),
        new ButtonBuilder()
            .setCustomId(`memreplace_refresh_${clanTagClean}`)
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔄")
    );
}

// ─── Interaction handler ──────────────────────────────────────────────────────
// Called by handler.js — same pattern as sync.js → handleSyncButton

async function handleMemberReplacements(interaction, context) {
    const {
        EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        StringSelectMenuBuilder, data: dataManager, coc, config, emoji
    } = context;
    const { getEmoji, getEmojiObject } = emoji;

    const id = interaction.customId;

    // ── Helper: log to sync channel ───────────────────────────────────────────
    async function sendLog(msg) {
        try {
            const logChannel = await interaction.client.channels
                .fetch(process.env.SYNC_LOG_ID).catch(() => null);
            if (logChannel && logChannel.isTextBased()) {
                await logChannel.send(msg).catch(() => {});
            }
        } catch (e) {}
    }

    // ════════════════════════════════════════════════════════════════
    //  +ADD FLOW
    // ════════════════════════════════════════════════════════════════

    // Step 0 — Refresh button clicked
    if (id.startsWith("memreplace_refresh_")) {
        const clanTagClean = id.replace("memreplace_refresh_", "");
        const clanTag = "#" + clanTagClean;
        const clanRoles = dataManager.getClanRoles();
        const clanInfo  = clanRoles[clanTag] || {};

        const hasManageServer = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasManageServer && !hasLeaderRole) {
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, ephemeral: true });
        }

        try { await interaction.deferUpdate(); } catch (e) { return; }
        
        const membersReplace = getMembersReplace();
        let filteredRoles = clanRoles;
        if (clanTag && clanRoles[clanTag]) {
            filteredRoles = { [clanTag]: clanRoles[clanTag] };
        }
        
        const embed = buildMainEmbed(filteredRoles, membersReplace, emoji);
        return interaction.editReply({ embeds: [embed], components: [buildActionRow(clanTag)] });
    }

    // Step 1 — +Add button clicked (clan is pre-selected from customId)
    if (id.startsWith("memreplace_add_")) {
        const clanTagClean = id.replace("memreplace_add_", "");
        const clanTag = "#" + clanTagClean;
        const clanRoles = dataManager.getClanRoles();
        const clanInfo  = clanRoles[clanTag] || {};

        const hasManageServer = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasManageServer && !hasLeaderRole) {
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, ephemeral: true });
        }

        try { await interaction.deferReply({ ephemeral: true }); } catch (e) { return; }
        
        let clanData;
        try { clanData = await coc.getClan(clanTag); } 
        catch (e) { return interaction.editReply({ content: `❌ Failed to fetch clan data for \`${clanTag}\`.`, components: [] }); }

        const members = clanData.memberList || [];
        const byTH = {};
        for (const m of members) {
            const th = m.townHallLevel;
            if (!byTH[th]) byTH[th] = [];
            byTH[th].push(m);
        }
        const sortedTHs = Object.keys(byTH).map(Number).sort((a, b) => b - a);

        if (sortedTHs.length === 0)
            return interaction.editReply({ content: "❌ No members found in this clan.", components: [] });

        const rows = [];
        let currentRow = new ActionRowBuilder();
        
        for (let i = 0; i < sortedTHs.length; i++) {
            const th = sortedTHs[i];
            const thEmojiObj = getEmojiObject("th" + th);
            const btn = new ButtonBuilder()
                .setCustomId(`mr_addthbtn_${clanTagClean}_${th}`)
                .setLabel(`TH${th} (${byTH[th].length})`)
                .setStyle(ButtonStyle.Primary);
            
            if (thEmojiObj && thEmojiObj.id) btn.setEmoji({ id: thEmojiObj.id, name: thEmojiObj.name });
            
            currentRow.addComponents(btn);
            
            if (currentRow.components.length === 5 || i === sortedTHs.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        }

        // Action row for Submit/Cancel
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`mr_addsubmit_${clanTagClean}`)
                .setLabel("✅ Submit All Selections")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("mr_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        ));

        const embed = new EmbedBuilder()
            .setTitle(`➕ Add Replacements — ${clanData.name}`)
            .setThumbnail(clanData.badgeUrls?.small || null)
            .setColor(0x57F287)
            .setDescription(
                `Click on a Town Hall button below to open its player selection menu.\n` +
                `You can pick players from multiple Town Halls. When finished, click **Submit**.`
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], components: rows });
    }

    // Step 2 — A specific TH button was clicked
    if (id.startsWith("mr_addthbtn_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const parts = id.split("_"); // "mr_addthbtn_CLANTAG_TH"
        const clanTagClean = parts[2];
        const clanTag = "#" + clanTagClean;
        const thLevel = parseInt(parts[3]);

        let clanData;
        try { clanData = await coc.getClan(clanTag); } 
        catch (e) { return interaction.editReply({ content: "❌ Failed to fetch clan data.", components: [] }); }

        const members = clanData.memberList || [];
        const thMembers = members.filter(m => m.townHallLevel === thLevel).sort((a, b) => a.name.localeCompare(b.name));

        const chunks = [];
        for (let i = 0; i < thMembers.length; i += 25) {
            chunks.push(thMembers.slice(i, i + 25));
        }

        const rows = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            const memberOptions = chunk.map(m => {
                const opt = {
                    label: m.name.slice(0, 100),
                    description: m.tag,
                    value: `${clanTag}|${m.tag}|${m.name}|${m.townHallLevel}`
                };
                const thEmojiObj = getEmojiObject("th" + m.townHallLevel);
                if (thEmojiObj && thEmojiObj.id) opt.emoji = { id: thEmojiObj.id, name: thEmojiObj.name };
                return opt;
            });

            const sel = new StringSelectMenuBuilder()
                .setCustomId(`mr_addsel_${clanTagClean}_${thLevel}_${i}`)
                .setPlaceholder(`Select TH${thLevel} players...`)
                .setMinValues(0)
                .setMaxValues(memberOptions.length)
                .addOptions(memberOptions);

            rows.push(new ActionRowBuilder().addComponents(sel));
        }

        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`memreplace_add_${clanTagClean}`)
                .setLabel("⬅️ Back to TH List")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`mr_addsubmit_${clanTagClean}`)
                .setLabel("✅ Submit")
                .setStyle(ButtonStyle.Success)
        ));

        const thEmojiStr = getEmoji("th" + thLevel) || `TH${thLevel}`;
        const embed = new EmbedBuilder()
            .setTitle(`➕ Add TH${thLevel} Replacements`)
            .setColor(0x57F287)
            .setDescription(`Select ${thEmojiStr} **TH${thLevel}** players from the dropdowns below.`)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], components: rows });
    }

    // Step 2a — Dropdown changed: store picks in pendingSelections
    if (id.startsWith("mr_addsel_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const parts = id.split("_"); // "mr_addsel_CLANTAG_TH_INDEX"
        const clanTagClean = parts[2];
        const thLevel = parts[3];
        const dropdownIndex = parts[4];
        const storeKey     = `${interaction.user.id}_${clanTagClean}`;

        if (!pendingSelections.has(storeKey)) pendingSelections.set(storeKey, new Map());
        const store = pendingSelections.get(storeKey);

        // Store selections keyed by TH level + dropdown index so they don't overwrite across different TH pages
        const storageKey = `${thLevel}_${dropdownIndex}`;
        if (interaction.values.length > 0) {
            store.set(storageKey, interaction.values);
        } else {
            store.delete(storageKey);
        }
        return;
    }

    // Step 3b — Submit button: read pendingSelections, save to members-replace.json
    if (id.startsWith("mr_addsubmit_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const clanTagClean = id.replace("mr_addsubmit_", "");
        const clanTag      = "#" + clanTagClean;
        const storeKey     = `${interaction.user.id}_${clanTagClean}`;
        const store        = pendingSelections.get(storeKey) || new Map();

        // Flatten all TH-group picks
        const selectedEntries = [];
        for (const [, values] of store) {
            for (const val of values) {
                // val: "clanTag|playerTag|playerName|thLevel"
                const parts = val.split("|");
                if (parts.length >= 4) {
                    const [, playerTag, playerName, thLevel] = parts;
                    selectedEntries.push({ tag: playerTag, name: playerName, thLevel: parseInt(thLevel) });
                }
            }
        }

        if (selectedEntries.length === 0) {
            return interaction.editReply({
                content: "⚠️ No players selected. Use the TH dropdowns above to pick players, then click Submit.",
                components: interaction.message.components
            });
        }

        const membersReplace = getMembersReplace();
        if (!membersReplace[clanTag]) membersReplace[clanTag] = [];

        const existingTags = new Set(membersReplace[clanTag].map(e => e.tag));
        const added = [];
        for (const entry of selectedEntries) {
            if (!existingTags.has(entry.tag)) {
                membersReplace[clanTag].push(entry);
                existingTags.add(entry.tag);
                added.push(entry);
            }
        }

        saveMembersReplace(membersReplace);
        pendingSelections.delete(storeKey);

        // Build TH-grouped result description
        const byTH = {};
        for (const e of added) {
            if (!byTH[e.thLevel]) byTH[e.thLevel] = [];
            byTH[e.thLevel].push(e);
        }
        const sortedAddedTHs = Object.keys(byTH).map(Number).sort((a, b) => b - a);

        let addedDesc = "";
        if (added.length === 0) {
            addedDesc = "*(No new players added — all were already in the list)*";
        } else {
            for (const th of sortedAddedTHs) {
                const thE = getEmoji("th" + th) || `TH${th}`;
                addedDesc += `\n${thE} **TH${th} PLAYERS:**\n`;
                for (const e of byTH[th]) {
                    const gameLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(e.tag)}`;
                    addedDesc += `> **${e.name}** — [Open In Game](${gameLink})\n`;
                }
            }
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle(`${getEmoji("gtick") || "✅"} Replacement Members Updated`)
            .setColor(0x57F287)
            .setDescription(`Added **${added.length}** player(s) to \`${clanTag}\`:\n${addedDesc}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed], components: [] });

        await sendLog(
            `📋 **Member Replacements Updated** by <@${interaction.user.id}>\n` +
            `**Clan:** \`${clanTag}\`\n` +
            `**Added ${added.length} player(s):**\n` +
            (added.length > 0
                ? added.map(e => `• **${e.name}** \`${e.tag}\` TH${e.thLevel}`).join("\n")
                : "*(none)*")
        );
        return;
    }

    // ════════════════════════════════════════════════════════════════
    //  -REMOVE / UPDATE FLOW
    // ════════════════════════════════════════════════════════════════

    // Step 1 — -Remove button clicked (clan is pre-selected from customId)
    if (id.startsWith("memreplace_remove_")) {
        const clanTagClean   = id.replace("memreplace_remove_", "");
        const clanTag        = "#" + clanTagClean;
        const clanRoles      = dataManager.getClanRoles();
        const clanInfo       = clanRoles[clanTag] || {};

        const hasManageServer = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasManageServer && !hasLeaderRole) {
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, ephemeral: true });
        }

        try { await interaction.deferReply({ ephemeral: true }); } catch (e) { return; }

        const membersReplace = getMembersReplace();
        const nick           = clanInfo.nickName || clanTag;
        const list           = membersReplace[clanTag] || [];

        if (list.length === 0)
            return interaction.editReply({ content: `ℹ️ No replacement members for **${nick}** (\`${clanTag}\`).`, components: [] });

        // Build TH-grouped description
        const byTH = {};
        for (const entry of list) {
            if (!byTH[entry.thLevel]) byTH[entry.thLevel] = [];
            byTH[entry.thLevel].push(entry);
        }
        const sortedTHs = Object.keys(byTH).map(Number).sort((a, b) => b - a);

        const clanEmoji = getEmoji(nick.toLowerCase()) || "🏰";
        let listDesc = `${clanEmoji} **${nick}** \`${clanTag}\`\n`;
        for (const th of sortedTHs) {
            const thE = getEmoji("th" + th) || `TH${th}`;
            listDesc += `\n${thE} **TH${th} PLAYERS:**\n`;
            for (const entry of byTH[th]) {
                const gameLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(entry.tag)}`;
                listDesc += `> **${entry.name}** — [Open In Game](${gameLink})\n`;
            }
        }
        listDesc += `\n\nSelect the members you want to **remove** from the dropdown below, then click **Done**.`;

        // Dropdown with all current members
        const options = list.slice(0, 25).map(entry => ({
            label: entry.name.slice(0, 100),
            description: `${entry.tag} — TH${entry.thLevel}`,
            value: entry.tag
        }));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`mr_removesel_${clanTag.replace("#", "")}`)
            .setPlaceholder("Select members to remove")
            .setMinValues(1)
            .setMaxValues(options.length)
            .addOptions(options);

        const row1 = new ActionRowBuilder().addComponents(select);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`mr_removedone_${clanTag.replace("#", "")}`)
                .setLabel("✅ Done (Remove selected)")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("mr_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle(`➖ Manage Replacements — ${nick}`)
            .setColor(0xED4245)
            .setDescription(listDesc)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    // Step 3a — Remove dropdown changed: save selections to pendingRemovals
    if (id.startsWith("mr_removesel_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }
        
        const clanTagClean = id.replace("mr_removesel_", "");
        const storeKey = `${interaction.user.id}_${clanTagClean}`;
        
        if (interaction.values.length > 0) {
            pendingRemovals.set(storeKey, interaction.values);
        } else {
            pendingRemovals.delete(storeKey);
        }
        return;
    }

    // Step 3b — Done button: remove selected members, log, confirm
    if (id.startsWith("mr_removedone_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const clanTagClean = id.replace("mr_removedone_", "");
        const clanTag = "#" + clanTagClean;
        const storeKey = `${interaction.user.id}_${clanTagClean}`;

        // Read selected tags from memory
        const tagsToRemove = new Set(pendingRemovals.get(storeKey) || []);
        pendingRemovals.delete(storeKey); // Clear memory after reading

        if (tagsToRemove.size === 0) {
            return interaction.editReply({
                content: "⚠️ No players selected for removal.",
                components: interaction.message.components
            });
        }

        const membersReplace = getMembersReplace();
        const list           = membersReplace[clanTag] || [];
        const removed        = list.filter(e => tagsToRemove.has(e.tag));
        membersReplace[clanTag] = list.filter(e => !tagsToRemove.has(e.tag));
        saveMembersReplace(membersReplace);

        const clanRoles = dataManager.getClanRoles();
        const nick      = clanRoles[clanTag]?.nickName || clanTag;

        const removedDesc = removed
            .map(e => {
                const thE     = getEmoji("th" + e.thLevel) || `TH${e.thLevel}`;
                const gameLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(e.tag)}`;
                return `> ${thE} **${e.name}** — [Open In Game](${gameLink})`;
            })
            .join("\n") || "*(none)*";

        const resultEmbed = new EmbedBuilder()
            .setTitle(`${getEmoji("gtick") || "✅"} Removed from Replacement List`)
            .setColor(0xED4245)
            .setDescription(
                `Removed **${removed.length}** player(s) from **${nick}** (\`${clanTag}\`):\n\n${removedDesc}`
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed], components: [] });

        await sendLog(
            `🗑️ **Member Replacements Updated** by <@${interaction.user.id}>\n` +
            `**Clan:** \`${clanTag}\`\n` +
            `**Removed ${removed.length} player(s):**\n` +
            (removed.length > 0
                ? removed.map(e => `• **${e.name}** \`${e.tag}\` TH${e.thLevel}`).join("\n")
                : "*(none)*")
        );
        return;
    }

        // ════════════════════════════════════════════════════════════════
    //  CANCEL — refresh main embed
    // ════════════════════════════════════════════════════════════════
    if (id === "mr_cancel") {
        try { await interaction.deferUpdate(); } catch (e) { return; }
        
        // Find which clan we were managing by looking at the components of the original message
        // The first component of the first row of the message usually has a customId that contains the clanTag.
        let clanTag = null;
        for (const row of interaction.message.components) {
            for (const comp of row.components) {
                if (comp.customId) {
                    if (comp.customId.startsWith("mr_addsubmit_")) {
                        clanTag = "#" + comp.customId.replace("mr_addsubmit_", "");
                    } else if (comp.customId.startsWith("mr_removedone_")) {
                        clanTag = "#" + comp.customId.replace("mr_removedone_", "");
                    }
                }
            }
        }
        
        const clanRoles      = dataManager.getClanRoles();
        const membersReplace = getMembersReplace();
        
        let filteredRoles = clanRoles;
        if (clanTag && clanRoles[clanTag]) {
            filteredRoles = { [clanTag]: clanRoles[clanTag] };
        }
        
        const embed          = buildMainEmbed(filteredRoles, membersReplace, emoji);
        return interaction.editReply({ embeds: [embed], components: [buildActionRow(clanTag)] });
    }
}

// ─── Slash command ─────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName("member-replacements")
        .setDescription("Manage member replacement lists for FWA clans")
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Select a specific FWA clan to manage replacements")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context || require("../../../utils/handler.js"); // Using fallback if context is not passed in autocomplete by index.js
        const dataMgr = dataManager || require("../../../utils/dataManager.js");
        
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const clanRoles = dataMgr.getClanRoles();
        
        const choices = [];
        for (const [tag, data] of Object.entries(clanRoles)) {
            if (data.clanType && data.clanType.toLowerCase() === "fwa") {
                const nick = data.nickName || tag;
                choices.push({ name: `${nick} (${tag})`, value: tag });
            }
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { data: dataManager, emoji: emojiUtils } = context;
        try { await interaction.deferReply(); } catch (e) { return; }

        try {
            const clanRoles = dataManager.getClanRoles();
            const membersReplace = getMembersReplace();
            
            const selectedClan = interaction.options.getString("clan");
            const clanInfo = clanRoles[selectedClan];

            const hasManageServer = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
            const hasLeaderRole = clanInfo?.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

            if (!hasManageServer && !hasLeaderRole) {
                return interaction.editReply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo?.leaderRoleId}> role to manage replacements for this clan.` });
            }
            
            let filteredRoles = clanRoles;
            if (selectedClan && clanRoles[selectedClan]) {
                filteredRoles = { [selectedClan]: clanRoles[selectedClan] };
            }

            const embed = buildMainEmbed(filteredRoles, membersReplace, emojiUtils);
            await interaction.editReply({ embeds: [embed], components: [buildActionRow(selectedClan)] });
        } catch (err) {
            console.error("member-replacements execute error:", err);
            try { await interaction.editReply({ content: "❌ Error loading member replacements." }); } catch (e) {}
        }
    },

    // Exported for handler.js routing (handleMemberReplacements) and helpers
    handleMemberReplacements,
    getMembersReplace,
    saveMembersReplace,
    buildMainEmbed,
    buildActionRow,
    pendingSelections,
    pendingRemovals,
};
