const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle
, MessageFlags } = require("discord.js");
const fs   = require("fs");
const path = require("path");

const MEMBERS_REPLACE_PATH = path.join(__dirname, "../../../data/members-replace.json");
const CLAN_MEMBERS_PATH = path.join(__dirname, "../../../data/clan-members.json");

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getClanMembersData() {
    try {
        if (!fs.existsSync(CLAN_MEMBERS_PATH)) {
            fs.writeFileSync(CLAN_MEMBERS_PATH, JSON.stringify({}, null, 2));
            return {};
        }
        const raw = fs.readFileSync(CLAN_MEMBERS_PATH, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading clan-members.json:", err.message);
        return {};
    }
}

function saveClanMembersData(data) {
    try {
        fs.writeFileSync(CLAN_MEMBERS_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing clan-members.json:", err.message);
        throw err;
    }
}

// ─── In-memory store for pending add selections ───────────────────────────────
// key: `${userId}_${clanTagClean}` → Map of dropdown selections
const pendingSelections = new Map();

// ─── In-memory store for pending remove selections ────────────────────────────
// key: `${userId}_${clanTagClean}` → Array of player tags
const pendingRemovals = new Map();


// ─── Replacement Data helpers ─────────────────────────────────────────────────────────────

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

// ─── Replacement Embed builders ──────────────────────────────────────────────────────────

function buildReplaceMainEmbed(clanRoles, membersReplace, emojiUtils) {
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

function buildReplaceActionRow(selectedClan) {
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

// ─── Embed builders ──────────────────────────────────────────────────────────

/**
 * Main overview embed — members grouped by TH level with Open In Game links.
 * @param {Object} clanRoles  - from dataManager.getClanRoles()
 * @param {Object} clanMembersList - from getClanMembersData()
 * @param {Object} emojiUtils - context.emoji  { getEmoji, getEmojiObject }
 */
function buildMainEmbed(clanRoles, clanMembersList, emojiUtils, page = 0) {
    const getEmoji = emojiUtils ? emojiUtils.getEmoji : () => "";

    const allClans = Object.entries(clanRoles);
    if (allClans.length === 0) {
        return new EmbedBuilder().setColor(0x5865F2).setDescription("No clans configured.");
    }

    const [tag, data] = allClans[0];
    const nick      = data.nickName || tag;
    const clanEmoji = getEmoji(nick.toLowerCase()) || "🏰";
    const list      = clanMembersList[tag] || [];

    if (list.length === 0) {
        return new EmbedBuilder()
            .setTitle(`${getEmoji("mem") || "👥"} Clan Members List`)
            .setColor(0x5865F2)
            .setDescription(`${clanEmoji} **${nick}** \`${tag}\`\n\n> *(No members listed)*`)
            .setTimestamp();
    }

    // Sort the list by TH descending, then by Name
    list.sort((a, b) => {
        const aTH = a.thLevel || a.townHallLevel || 0;
        const bTH = b.thLevel || b.townHallLevel || 0;
        if (bTH !== aTH) return bTH - aTH;
        return a.name.localeCompare(b.name);
    });

    const perPage = 15;
    const totalPages = Math.ceil(list.length / perPage) || 1;
    const currentPage = Math.min(page, totalPages - 1);
    const pageItems = list.slice(currentPage * perPage, (currentPage + 1) * perPage);

    // Group page items by TH
    const byTH = {};
    for (const entry of pageItems) {
        const lvl = entry.thLevel || entry.townHallLevel || "?";
        if (!byTH[lvl]) byTH[lvl] = [];
        byTH[lvl].push(entry);
    }
    const sortedTHs = Object.keys(byTH).sort((a, b) => {
        const numA = a === "?" ? -1 : Number(a) || 0;
        const numB = b === "?" ? -1 : Number(b) || 0;
        return numB - numA;
    });

    let description = `${clanEmoji} **${nick}** \`${tag}\`\n`;

    let index = currentPage * perPage + 1;

    for (const th of sortedTHs) {
        const thEmoji = getEmoji("th" + th) || `🏠`;
        description += `\n${thEmoji} **TH${th} PLAYERS:**\n`;
        for (const entry of byTH[th]) {
            const gameLink = `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(entry.tag)}`;
            const ccLink = `https://cc.fwafarm.com/cc_n/member.php?tag=${encodeURIComponent(entry.tag.replace('#', ''))}`;
            description += `> ${index}. ${thEmoji} [${entry.name}](${gameLink}) - [${entry.tag}](${ccLink})\n`;
            index++;
        }
    }

    return new EmbedBuilder()
        .setTitle(`${getEmoji("mem") || "👥"} Clan Members List`)
        .setColor(0x5865F2)
        .setDescription(description)
        .setFooter({ text: `Page ${currentPage + 1} of ${totalPages} • Use buttons below to manage clan members` })
        .setTimestamp();
}

/** +Add / -Remove/Update buttons */
function buildActionRow(selectedClan, emojiUtils, page = 0, totalPages = 1) {
    const clanTagClean = selectedClan ? selectedClan.replace("#", "") : "";
    const getEmojiObject = emojiUtils ? emojiUtils.getEmojiObject : () => null;
    
    const editBtn = new ButtonBuilder()
        .setCustomId(`clanmem_editmenu_${clanTagClean}_${page}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️");

    const missingBtn = new ButtonBuilder()
        .setCustomId(`clanmem_missing_${clanTagClean}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔍");

    const replaceBtn = new ButtonBuilder()
        .setCustomId(`clanmem_replacements_${clanTagClean}`)
        .setStyle(ButtonStyle.Secondary);
    const replaceEmojiObj = getEmojiObject ? getEmojiObject("replace") : null;
    if (replaceEmojiObj) replaceBtn.setEmoji(replaceEmojiObj);
    else replaceBtn.setEmoji("🔄");

    const components = [];

    if (totalPages > 1) {
        const prevBtn = new ButtonBuilder()
            .setCustomId(`clanmem_prev_${clanTagClean}_${page}`)
            .setStyle(ButtonStyle.Primary);
        
        const lArrowObj = getEmojiObject ? getEmojiObject("leftarrow") : null;
        if (lArrowObj) prevBtn.setEmoji(lArrowObj);
        else prevBtn.setEmoji("◀️");

        const nextBtn = new ButtonBuilder()
            .setCustomId(`clanmem_next_${clanTagClean}_${page}`)
            .setStyle(ButtonStyle.Primary);
            
        const rArrowObj = getEmojiObject ? getEmojiObject("arrow") : null;
        if (rArrowObj) nextBtn.setEmoji(rArrowObj);
        else nextBtn.setEmoji("▶️");

        components.push(prevBtn, nextBtn, missingBtn, replaceBtn, editBtn);
    } else {
        components.push(missingBtn, replaceBtn, editBtn);
    }

    return new ActionRowBuilder().addComponents(...components);
}

// ─── Interaction handler ──────────────────────────────────────────────────────

async function handleClanMembers(interaction, context) {
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
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, flags: [MessageFlags.Ephemeral] });
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
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (e) { return; }
        
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
            return interaction.reply({ content: `❌ You must have the **Manage Server** permission or the <@&${clanInfo.leaderRoleId}> role to manage replacements for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (e) { return; }

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

    // ════════════════════════════════════════════════════════════════
    //  REPLACEMENT MEMBERS (Private Embed)
    // ════════════════════════════════════════════════════════════════
    if (id.startsWith("clanmem_replacements_")) {
        const clanTagClean = id.replace("clanmem_replacements_", "");
        const clanTag = "#" + clanTagClean;

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (e) { return; }

        const clanRoles = dataManager.getClanRoles();
        const membersReplace = getMembersReplace();
        
        let filteredRoles = clanRoles;
        if (clanTag && clanRoles[clanTag]) {
            filteredRoles = { [clanTag]: clanRoles[clanTag] };
        }

        const embed = buildReplaceMainEmbed(filteredRoles, membersReplace, emoji);
        const components = [buildReplaceActionRow(clanTag)];

        return interaction.editReply({ embeds: [embed], components });
    }

    // ════════════════════════════════════════════════════════════════
    //  MISSING MEMBERS
    // ════════════════════════════════════════════════════════════════
    if (id.startsWith("clanmem_missing_")) {
        const parts = id.split("_");
        
        let action = "view";
        let clanTagClean = parts[2];
        let page = 0;
        
        if (parts[2] === "prev" || parts[2] === "next") {
            action = parts[2];
            clanTagClean = parts[3];
            page = parseInt(parts[4]) || 0;
        }

        const clanTag = "#" + clanTagClean;

        try { 
            if (action === "view") try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (err) { if (err.code !== 10062) console.error(err); return true; } 
            else try { await interaction.deferUpdate(); } catch (err) { if (err.code !== 10062) console.error(err); return true; }
        } catch (e) { return; }

        let clanData;
        try { clanData = await coc.getClan(clanTag); }
        catch (e) { return interaction.editReply({ content: `❌ Failed to fetch clan data for \`${clanTag}\`.` }); }

        const clanMembersList = getClanMembersData();
        const storedList = clanMembersList[clanTag] || [];

        const currentMembers = clanData.memberList || [];
        const currentMemberTags = new Set(currentMembers.map(m => m.tag));
        const storedMemberTags = new Set(storedList.map(m => m.tag));

        const notInClan = storedList.filter(m => !currentMemberTags.has(m.tag));
        const newToClan = currentMembers.filter(m => !storedMemberTags.has(m.tag));

        const combined = [];
        notInClan.forEach(m => combined.push({ type: 'not', ...m }));
        newToClan.forEach(m => combined.push({ type: 'new', ...m }));
        
        const perPage = 15;
        const totalPages = Math.ceil(combined.length / perPage) || 1;
        
        if (action === "prev") {
            page = page > 0 ? page - 1 : totalPages - 1;
        } else if (action === "next") {
            page = (page + 1) % totalPages;
        } else {
            page = 0;
        }

        const pageItems = combined.slice(page * perPage, (page + 1) * perPage);

        const pageNotInClan = pageItems.filter(i => i.type === 'not');
        const pageNewToClan = pageItems.filter(i => i.type === 'new');
        
        const notInClanDesc = pageNotInClan.length > 0 
            ? pageNotInClan.map(m => {
                const th = m.thLevel || m.townHallLevel || 1;
                return `> ${getEmoji("th" + th) || `TH${th}`} **${m.name}** (\`${m.tag}\`)`;
            }).join("\n")
            : (notInClan.length > 0 ? "*(None on this page)*" : "*(None)*");
            
        const newToClanDesc = pageNewToClan.length > 0
            ? pageNewToClan.map(m => {
                const th = m.townHallLevel || m.thLevel || 1;
                return `> ${getEmoji("th" + th) || `TH${th}`} **${m.name}** (\`${m.tag}\`)`;
            }).join("\n")
            : (newToClan.length > 0 ? "*(None on this page)*" : "*(None)*");

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Missing & New Members for ${clanData.name}`)
            .setColor(0x2B2D31)
            .addFields(
                { name: `Not in Clan (Total: ${notInClan.length})`, value: notInClanDesc, inline: false },
                { name: `New to Clan (Total: ${newToClan.length})`, value: newToClanDesc, inline: false }
            )
            .setFooter({ text: `Page ${page + 1} of ${totalPages} • Not in Clan = Left clan. New to Clan = Needs to be added.` })
            .setTimestamp();

        const components = [];
        let actionRow = new ActionRowBuilder();
        if (totalPages > 1) {
            const prevBtn = new ButtonBuilder()
                .setCustomId(`clanmem_missing_prev_${clanTagClean}_${page}`)
                .setStyle(ButtonStyle.Primary);
            const lArrowObj = getEmojiObject ? getEmojiObject("leftarrow") : null;
            if (lArrowObj) prevBtn.setEmoji(lArrowObj);
            else prevBtn.setEmoji("◀️");

            const nextBtn = new ButtonBuilder()
                .setCustomId(`clanmem_missing_next_${clanTagClean}_${page}`)
                .setStyle(ButtonStyle.Primary);
            const rArrowObj = getEmojiObject ? getEmojiObject("arrow") : null;
            if (rArrowObj) nextBtn.setEmoji(rArrowObj);
            else nextBtn.setEmoji("▶️");
            
            actionRow.addComponents(prevBtn, nextBtn);
        }

        const pingBtn = new ButtonBuilder()
            .setCustomId(`clanmem_pingmissing_${clanTagClean}`)
            .setLabel("Ping Missing")
            .setStyle(ButtonStyle.Danger);
        const qEmojiObj = getEmojiObject ? getEmojiObject("question") : null;
        if (qEmojiObj) pingBtn.setEmoji(qEmojiObj);
        else pingBtn.setEmoji("❓");

        actionRow.addComponents(pingBtn);
        components.push(actionRow);

        return interaction.editReply({ embeds: [embed], components });
    }

    // ════════════════════════════════════════════════════════════════
    //  PING MISSING
    // ════════════════════════════════════════════════════════════════
    if (id.startsWith("clanmem_pingmissing_")) {
        const clanTagClean = id.replace("clanmem_pingmissing_", "");
        const clanTag = "#" + clanTagClean;

        try { await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); } catch (e) { return; }

        let clanData;
        try { clanData = await coc.getClan(clanTag); }
        catch (e) { return interaction.editReply({ content: `❌ Failed to fetch clan data for \`${clanTag}\`.` }); }

        const clanMembersList = getClanMembersData();
        const storedList = clanMembersList[clanTag] || [];

        const currentMembers = clanData.memberList || [];
        const currentMemberTags = new Set(currentMembers.map(m => m.tag));

        const notInClan = storedList.filter(m => !currentMemberTags.has(m.tag));

        if (notInClan.length === 0) {
            return interaction.editReply({ content: "✅ No missing members to ping." });
        }

        const clanRoles = dataManager.getClanRoles();
        const clanInfo = clanRoles[clanTag] || {};
        const mailChannelId = clanInfo.mailChannelId;

        if (!mailChannelId) {
            return interaction.editReply({ content: "❌ Clan mail channel is not configured for this clan." });
        }

        const mailChannel = await interaction.client.channels.fetch(mailChannelId).catch(() => null);
        if (!mailChannel) {
            return interaction.editReply({ content: "❌ Could not find the configured clan mail channel." });
        }

        const userData = dataManager.getUserData();
        const missingDiscordIds = new Set();
        const missingUserTags = new Set(notInClan.map(m => m.tag));

        for (const [userId, accounts] of Object.entries(userData)) {
            for (const acc of accounts) {
                if (missingUserTags.has(acc.tag)) {
                    missingDiscordIds.add(userId);
                    break;
                }
            }
        }

        if (missingDiscordIds.size === 0) {
            return interaction.editReply({ content: "⚠️ Could not find Discord accounts linked for any of the missing members." });
        }

        const pings = Array.from(missingDiscordIds).map(userId => `<@${userId}>`).join(" ");
        const pingMessage = `${pings} please join back clan asap!`;

        try {
            await mailChannel.send(pingMessage);
            return interaction.editReply({ content: `✅ Successfully pinged ${missingDiscordIds.size} missing member(s) in <#${mailChannelId}>.` });
        } catch (e) {
            return interaction.editReply({ content: `❌ Failed to send message in the mail channel: ${e.message}` });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  EDIT MENU
    // ════════════════════════════════════════════════════════════════
    if (id.startsWith("clanmem_editmenu_")) {
        const parts = id.split("_");
        const clanTagClean = parts[2];
        const page = parts[3] || "0";
        const originalMsgId = interaction.message.id;

        const clanTag = "#" + clanTagClean;
        const clanRoles = dataManager.getClanRoles();
        const clanInfo  = clanRoles[clanTag] || {};

        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasLeaderRole) {
            const roleMsg = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
            return interaction.reply({ content: `❌ You must have the ${roleMsg} role to manage members for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`clanmem_add_${clanTagClean}`)
                .setStyle(ButtonStyle.Success)
                .setLabel("Add by selection")
                .setEmoji("👥"),
            new ButtonBuilder()
                .setCustomId(`clanmem_addtag_${clanTagClean}`)
                .setStyle(ButtonStyle.Primary)
                .setLabel("Add by tag")
                .setEmoji("🏷️"),
            new ButtonBuilder()
                .setCustomId(`clanmem_remove_${clanTagClean}`)
                .setLabel("Remove player")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("➖"),
            new ButtonBuilder()
                .setCustomId(`clanmem_refreshmsg_${clanTagClean}_${page}_${originalMsgId}`)
                .setLabel("Refresh List")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔄")
        );

        const embed = new EmbedBuilder()
            .setTitle("✏️ Manage Clan Members")
            .setColor(0x2B2D31)
            .setDescription("Select an action to manage members for this clan.");

        return interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }

    if (id.startsWith("clanmem_refreshmsg_")) {
        const parts = id.split("_");
        const clanTagClean = parts[2];
        const page = parseInt(parts[3]) || 0;
        const msgId = parts[4];
        
        try { await interaction.deferUpdate(); } catch (e) {}

        const clanTag = "#" + clanTagClean;
        const clanRoles = dataManager.getClanRoles();
        const clanMembersList = getClanMembersData();
        const list = clanMembersList[clanTag] || [];
        const totalPages = Math.ceil(list.length / 15) || 1;

        let filteredRoles = clanRoles;
        if (clanTag && clanRoles[clanTag]) {
            filteredRoles = { [clanTag]: clanRoles[clanTag] };
        }
        
        const embed = buildMainEmbed(filteredRoles, clanMembersList, emoji, page);
        const components = [buildActionRow(clanTag, emoji, page, totalPages)];

        try {
            const msg = await interaction.channel.messages.fetch(msgId);
            if (msg) {
                await msg.edit({ embeds: [embed], components });
            }
        } catch(e) {}
        
        return interaction.editReply({ content: "✅ Main list refreshed.", embeds: [], components: [] });
    }

    // Step 0 — Prev / Next button clicked
    if (id.startsWith("clanmem_prev_") || id.startsWith("clanmem_next_")) {
        const parts = id.split("_");
        const action = parts[1]; // "prev", "next", or "refresh"
        const clanTagClean = parts[2];
        const clanTag = "#" + clanTagClean;
        let page = parts.length > 3 ? parseInt(parts[3]) || 0 : 0;

        const clanRoles = dataManager.getClanRoles();
        const clanMembersList = getClanMembersData();
        const list = clanMembersList[clanTag] || [];
        const totalPages = Math.ceil(list.length / 15) || 1;

        if (action === "prev") {
            page = page > 0 ? page - 1 : totalPages - 1;
        } else if (action === "next") {
            page = (page + 1) % totalPages;
        }

        const clanInfo  = clanRoles[clanTag] || {};

        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasLeaderRole) {
            const roleMsg = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
            return interaction.reply({ content: `❌ You must have the ${roleMsg} role to manage members for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferUpdate(); } catch (e) { return; }
        
        let filteredRoles = clanRoles;
        if (clanTag && clanRoles[clanTag]) {
            filteredRoles = { [clanTag]: clanRoles[clanTag] };
        }
        
        const embed = buildMainEmbed(filteredRoles, clanMembersList, emoji, page);
        return interaction.editReply({ embeds: [embed], components: [buildActionRow(clanTag, emoji, page, totalPages)] });
    }

    // Step 1b — +Add by Tag clicked (opens modal)
    if (id.startsWith("clanmem_addtag_")) {
        const clanTagClean = id.replace("clanmem_addtag_", "");
        const modal = new ModalBuilder()
            .setCustomId(`modal_cm_addtag_${clanTagClean}`)
            .setTitle("Add Members by Tag");

        const tagInput = new TextInputBuilder()
            .setCustomId("playerTags")
            .setLabel("Player Tags (comma-separated)")
            .setPlaceholder("e.g. #Y8U8C2V, #9YV2C2U")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(tagInput);
        modal.addComponents(firstActionRow);

        // We use showModal because we are responding to the button interaction.
        return interaction.showModal(modal);
    }

    // Step 1c — Add by Tag modal submitted
    if (id.startsWith("modal_cm_addtag_")) {
        const clanTagClean = id.replace("modal_cm_addtag_", "");
        const clanTag = "#" + clanTagClean;
        const rawTags = interaction.fields.getTextInputValue("playerTags");
        const tagsToFetch = rawTags.split(",").map(t => t.trim()).filter(t => t.length > 0);

        try { await interaction.deferUpdate(); } catch (e) { return; }

        if (tagsToFetch.length === 0) {
            return interaction.editReply({ content: "❌ No valid tags provided.", embeds: [], components: [] });
        }

        const clanMembersList = getClanMembersData();
        if (!clanMembersList[clanTag]) clanMembersList[clanTag] = [];
        const existingList = clanMembersList[clanTag];

        const added = [];
        const failed = [];
        const alreadyExists = [];

        for (const rawPlayerTag of tagsToFetch) {
            const pTag = rawPlayerTag.startsWith("#") ? rawPlayerTag : "#" + rawPlayerTag;
            if (existingList.find(m => m.tag === pTag)) {
                alreadyExists.push(pTag);
                continue;
            }

            try {
                const playerData = await coc.getPlayer(pTag);
                if (playerData && playerData.name && playerData.townHallLevel) {
                    const entry = {
                        tag: pTag,
                        name: playerData.name,
                        thLevel: playerData.townHallLevel,
                        role: playerData.role || "member"
                    };
                    existingList.push(entry);
                    added.push(entry);
                } else {
                    failed.push(pTag);
                }
            } catch (err) {
                failed.push(pTag);
            }
        }

        if (added.length > 0) {
            saveClanMembersData(clanMembersList);
            await sendLog(`✅ Added **${added.length}** members to \`${clanTag}\` manually by **${interaction.user.tag}**.`);
        }

        let desc = "";
        if (added.length > 0) desc += `✅ **Successfully Added (${added.length}):**\n${added.map(m => `• ${m.name} (\`${m.tag}\`)`).join("\n")}\n\n`;
        if (alreadyExists.length > 0) desc += `⚠️ **Already in list (${alreadyExists.length}):**\n${alreadyExists.map(t => `• \`${t}\``).join("\n")}\n\n`;
        if (failed.length > 0) desc += `❌ **Failed to fetch (${failed.length}):**\n${failed.map(t => `• \`${t}\``).join("\n")}\n\n`;

        const resultEmbed = new EmbedBuilder()
            .setTitle(`➕ Add by Tag Results`)
            .setColor(added.length > 0 ? 0x57F287 : 0xED4245)
            .setDescription(desc || "No changes made.");

        return interaction.editReply({ embeds: [resultEmbed], components: [] });
    }

    // Step 1 — +Add button clicked (clan is pre-selected from customId)
    if (id.startsWith("clanmem_add_")) {
        const clanTagClean = id.replace("clanmem_add_", "");
        const clanTag = "#" + clanTagClean;
        const clanRoles = dataManager.getClanRoles();
        const clanInfo  = clanRoles[clanTag] || {};

        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasLeaderRole) {
            const roleMsg = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
            return interaction.reply({ content: `❌ You must have the ${roleMsg} role to manage members for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferUpdate(); } catch (e) { return; }
        
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
                .setCustomId(`cm_addthbtn_${clanTagClean}_${th}`)
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
                .setCustomId(`cm_addsubmit_${clanTagClean}`)
                .setLabel("✅ Submit All Selections")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("cm_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        ));

        const embed = new EmbedBuilder()
            .setTitle(`➕ Add Members — ${clanData.name}`)
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
    if (id.startsWith("cm_addthbtn_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const parts = id.split("_"); // "cm_addthbtn_CLANTAG_TH"
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
                .setCustomId(`cm_addsel_${clanTagClean}_${thLevel}_${i}`)
                .setPlaceholder(`Select TH${thLevel} players...`)
                .setMinValues(0)
                .setMaxValues(memberOptions.length)
                .addOptions(memberOptions);

            rows.push(new ActionRowBuilder().addComponents(sel));
        }

        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`clanmem_add_${clanTagClean}`)
                .setLabel("⬅️ Back to TH List")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`cm_addsubmit_${clanTagClean}`)
                .setLabel("✅ Submit")
                .setStyle(ButtonStyle.Success)
        ));

        const thEmojiStr = getEmoji("th" + thLevel) || `TH${thLevel}`;
        const embed = new EmbedBuilder()
            .setTitle(`➕ Add TH${thLevel} Members`)
            .setColor(0x57F287)
            .setDescription(`Select ${thEmojiStr} **TH${thLevel}** players from the dropdowns below.`)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], components: rows });
    }

    // Step 2a — Dropdown changed: store picks in pendingSelections
    if (id.startsWith("cm_addsel_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const parts = id.split("_"); // "cm_addsel_CLANTAG_TH_INDEX"
        const clanTagClean = parts[2];
        const thLevel = parts[3];
        const dropdownIndex = parts[4];
        const storeKey     = `${interaction.user.id}_${clanTagClean}`;

        if (!pendingSelections.has(storeKey)) pendingSelections.set(storeKey, new Map());
        const store = pendingSelections.get(storeKey);

        const storageKey = `${thLevel}_${dropdownIndex}`;
        if (interaction.values.length > 0) {
            store.set(storageKey, interaction.values);
        } else {
            store.delete(storageKey);
        }
        return;
    }

    // Step 3b — Submit button: read pendingSelections, save to clan-members.json
    if (id.startsWith("cm_addsubmit_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const clanTagClean = id.replace("cm_addsubmit_", "");
        const clanTag      = "#" + clanTagClean;
        const storeKey     = `${interaction.user.id}_${clanTagClean}`;
        const store        = pendingSelections.get(storeKey) || new Map();

        // Flatten all TH-group picks
        const selectedEntries = [];
        for (const [, values] of store) {
            for (const val of values) {
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

        const clanMembersList = getClanMembersData();
        if (!clanMembersList[clanTag]) clanMembersList[clanTag] = [];

        const existingTags = new Set(clanMembersList[clanTag].map(e => e.tag));
        const added = [];
        for (const entry of selectedEntries) {
            if (!existingTags.has(entry.tag)) {
                clanMembersList[clanTag].push(entry);
                existingTags.add(entry.tag);
                added.push(entry);
            }
        }

        saveClanMembersData(clanMembersList);
        pendingSelections.delete(storeKey);

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
            .setTitle(`${getEmoji("gtick") || "✅"} Clan Members Updated`)
            .setColor(0x57F287)
            .setDescription(`Added **${added.length}** player(s) to \`${clanTag}\`:\n${addedDesc}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed], components: [] });

        await sendLog(
            `📋 **Clan Members Updated** by <@${interaction.user.id}>\n` +
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
    if (id.startsWith("clanmem_remove_")) {
        const clanTagClean   = id.replace("clanmem_remove_", "");
        const clanTag        = "#" + clanTagClean;
        const clanRoles      = dataManager.getClanRoles();
        const clanInfo       = clanRoles[clanTag] || {};

        const hasLeaderRole = clanInfo.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

        if (!hasLeaderRole) {
            const roleMsg = clanInfo.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
            return interaction.reply({ content: `❌ You must have the ${roleMsg} role to manage members for this clan.`, flags: [MessageFlags.Ephemeral] });
        }

        try { await interaction.deferUpdate(); } catch (e) { return; }

        const clanMembersList = getClanMembersData();
        const nick           = clanInfo.nickName || clanTag;
        const list           = clanMembersList[clanTag] || [];

        if (list.length === 0)
            return interaction.editReply({ content: `ℹ️ No members found for **${nick}** (\`${clanTag}\`).`, components: [] });

        const clanEmoji = getEmoji(nick.toLowerCase()) || "🏰";
        let listDesc = `${clanEmoji} **${nick}** \`${clanTag}\`\n\n`;
        listDesc += `Select the members you want to **remove** from the dropdowns below, then click **Done**.`;

        const chunks = [];
        for (let i = 0; i < list.length; i += 25) {
            chunks.push(list.slice(i, i + 25));
        }

        const rows = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const options = chunk.map(entry => ({
                label: entry.name.slice(0, 100),
                description: `${entry.tag} — TH${entry.thLevel}`,
                value: entry.tag
            }));

            const select = new StringSelectMenuBuilder()
                .setCustomId(`cm_removesel_${clanTag.replace("#", "")}_${i}`)
                .setPlaceholder(`Select members to remove (Part ${i + 1})`)
                .setMinValues(0)
                .setMaxValues(options.length)
                .addOptions(options);

            rows.push(new ActionRowBuilder().addComponents(select));
        }
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cm_removedone_${clanTag.replace("#", "")}`)
                .setLabel("✅ Done (Remove selected)")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("cm_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
        );

        const embed = new EmbedBuilder()
            .setTitle(`➖ Edit / Delete Members — ${nick}`)
            .setColor(0xED4245)
            .setDescription(listDesc)
            .setTimestamp();

        rows.push(row2);
        return interaction.editReply({ embeds: [embed], components: rows });
    }

    // Step 3a — Remove dropdown changed: save selections to pendingRemovals
    if (id.startsWith("cm_removesel_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }
        
        const parts = id.split("_");
        const clanTagClean = parts[2];
        const index = parts[3] || "0";
        const storeKey = `${interaction.user.id}_${clanTagClean}`;
        
        if (!pendingRemovals.has(storeKey)) pendingRemovals.set(storeKey, new Map());
        const store = pendingRemovals.get(storeKey);

        if (interaction.values.length > 0) {
            store.set(index, interaction.values);
        } else {
            store.delete(index);
        }
        return;
    }

    // Step 3b — Done button: remove selected members, log, confirm
    if (id.startsWith("cm_removedone_")) {
        try { await interaction.deferUpdate(); } catch (e) { return; }

        const clanTagClean = id.replace("cm_removedone_", "");
        const clanTag = "#" + clanTagClean;
        const storeKey = `${interaction.user.id}_${clanTagClean}`;

        const store = pendingRemovals.get(storeKey) || new Map();
        let allValues = [];
        for (const vals of store.values()) {
            allValues.push(...vals);
        }
        const tagsToRemove = new Set(allValues);
        pendingRemovals.delete(storeKey); 

        if (tagsToRemove.size === 0) {
            return interaction.editReply({
                content: "⚠️ No players selected for removal.",
                components: interaction.message.components
            });
        }

        const clanMembersList = getClanMembersData();
        const list           = clanMembersList[clanTag] || [];
        const removed        = list.filter(e => tagsToRemove.has(e.tag));
        clanMembersList[clanTag] = list.filter(e => !tagsToRemove.has(e.tag));
        saveClanMembersData(clanMembersList);

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
            .setTitle(`${getEmoji("gtick") || "✅"} Removed from Members List`)
            .setColor(0xED4245)
            .setDescription(
                `Removed **${removed.length}** player(s) from **${nick}** (\`${clanTag}\`):\n\n${removedDesc}`
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed], components: [] });

        await sendLog(
            `🗑️ **Clan Members Updated** by <@${interaction.user.id}>\n` +
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
    if (id === "cm_cancel") {
        try { await interaction.deferUpdate(); } catch (e) { return; }
        return interaction.editReply({ content: "Cancelled.", embeds: [], components: [] });
    }
}

// ─── Slash command ─────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clan-members")
        .setDescription("Manage clan members lists")
        .addStringOption(option =>
            option.setName("clantag")
                .setDescription("Select a clan to manage members")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context || require("../../../utils/handler.js");
        const dataMgr = dataManager || require("../../../utils/dataManager.js");
        
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const clanRoles = dataMgr.getClanRoles();
        
        const choices = [];
        for (const [tag, data] of Object.entries(clanRoles)) {
            const nick = data.nickName || tag;
            choices.push({ name: `${nick} (${tag})`, value: tag });
        }

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction, context) {
        const { data: dataManager, emoji: emojiUtils } = context;
        try { await interaction.deferReply(); } catch (e) { return; }

        try {
            const clanRoles = dataManager.getClanRoles();
            const clanMembersList = getClanMembersData();
            
            const selectedClan = interaction.options.getString("clantag");
            const clanInfo = clanRoles[selectedClan];

            const hasLeaderRole = clanInfo?.leaderRoleId && interaction.member.roles.cache.has(clanInfo.leaderRoleId);

            if (!hasLeaderRole) {
                const roleMsg = clanInfo?.leaderRoleId ? `<@&${clanInfo.leaderRoleId}>` : "Clan Leader";
                return interaction.editReply({ content: `❌ You must have the ${roleMsg} role to manage members for this clan.` });
            }
            
            let filteredRoles = clanRoles;
            if (selectedClan && clanRoles[selectedClan]) {
                filteredRoles = { [selectedClan]: clanRoles[selectedClan] };
            }

            const list = clanMembersList[selectedClan] || [];
            const totalPages = Math.ceil(list.length / 15) || 1;

            const embed = buildMainEmbed(filteredRoles, clanMembersList, emojiUtils, 0);
            await interaction.editReply({ embeds: [embed], components: [buildActionRow(selectedClan, emojiUtils, 0, totalPages)] });
        } catch (err) {
            console.error("clan-members execute error:", err);
            try { await interaction.editReply({ content: "❌ Error loading clan members." }); } catch (e) {}
        }
    },

    // Exported for handler.js routing
    handleClanMembers,
    getMembersReplace,
    saveMembersReplace,
    buildReplaceMainEmbed,
    buildReplaceActionRow,
    getClanMembersData,
    saveClanMembersData,
    buildMainEmbed,
    buildActionRow,
    pendingSelections,
    pendingRemovals,
};
