/**
 * Ticket Data Store — Persistent JSON storage for ticket records.
 *
 * Stores ticket information across three categories:
 *   - fwa        (FWA-Entry, Clan-Entry)
 *   - warEntry   (War-Entry)
 *   - allianceApply (Alliance-Join)
 *
 * Each ticket record is keyed by a unique ticketId so multiple tickets from
 * the same user are preserved independently.
 *
 * Records are NEVER deleted — even after the ticket channel is removed.
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'ticketData.json');

// ── Internal counter stored inside the JSON for monotonic IDs ───────────
const EMPTY_STORE = {
    _nextId: 1,
    fwa: {},
    warEntry: {},
    allianceApply: {}
};

/**
 * Read the store from disk. Returns a deep-cloned object.
 * Creates the file with the default structure if it doesn't exist yet.
 */
function loadStore() {
    try {
        if (!fs.existsSync(DATA_PATH)) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(EMPTY_STORE, null, 2));
            return JSON.parse(JSON.stringify(EMPTY_STORE));
        }
        const raw = fs.readFileSync(DATA_PATH, 'utf8');
        const trimmed = raw ? raw.trim() : '';
        if (!trimmed) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(EMPTY_STORE, null, 2));
            return JSON.parse(JSON.stringify(EMPTY_STORE));
        }
        const parsed = JSON.parse(trimmed);

        // Ensure all keys exist (handles partial / old files gracefully)
        if (!parsed._nextId) parsed._nextId = 1;
        if (!parsed.fwa) parsed.fwa = {};
        if (!parsed.warEntry) parsed.warEntry = {};
        if (!parsed.allianceApply) parsed.allianceApply = {};

        return parsed;
    } catch (err) {
        console.error('[TicketDataStore] Error reading ticketData.json:', err.message);
        return JSON.parse(JSON.stringify(EMPTY_STORE));
    }
}

/**
 * Persist the store to disk (atomic-ish write).
 */
function saveStore(store) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
    } catch (err) {
        console.error('[TicketDataStore] Error writing ticketData.json:', err.message);
    }
}

/**
 * Map a ticket channel name (or customId) to one of the three categories.
 * Returns null if the ticket type doesn't belong to any tracked category.
 */
function resolveCategory(channelName) {
    if (!channelName) return null;
    const lower = channelName.replace(/^[🟢🔴🟡⚪🔵]\s*[-_]?\s*/, '').toLowerCase();

    // FWA-Entry and Clan-Entry both map to 'fwa'
    if (lower.startsWith('fwa-entry') || lower.startsWith('fwa-')) return 'fwa';
    if (lower.startsWith('clan-entry') || lower.startsWith('clan-')) return 'fwa';

    // War-Entry maps to 'warEntry'
    if (lower.startsWith('war-entry') || lower.startsWith('war-')) return 'warEntry';

    // Alliance-Join maps to 'allianceApply'
    if (lower.startsWith('alliance-join') || lower.startsWith('alliance-')) return 'allianceApply';

    return null;
}

/**
 * Generate a unique ticket ID and create a new record.
 *
 * @param {string} category        – 'fwa' | 'warEntry' | 'allianceApply'
 * @param {string} userId          – Discord user ID of the ticket opener
 * @param {string} channelId       – Discord channel ID (used as a lookup hint)
 * @param {string} [ticketOwnerName] – Discord nickname/username of the ticket opener
 * @returns {string} The generated ticketId
 */
function createTicket(category, userId, channelId, ticketOwnerName = null) {
    const store = loadStore();

    if (!store[category]) {
        console.error(`[TicketDataStore] Unknown category "${category}". Skipping.`);
        return null;
    }

    const ticketId = `TICKET-${store._nextId++}`;

    store[category][ticketId] = {
        ticketId,
        userId,
        ticketOwnerName: ticketOwnerName || null,
        channelId,                       // kept for internal lookups only
        ticketOpenedDate: new Date().toISOString(),
        claimedBy: null,
        claimedUserNickname: null,
        transcript: null
    };

    saveStore(store);
    return ticketId;
}

/**
 * Find a ticket record by its Discord channel ID.
 * Returns { category, ticketId, record } or null.
 */
function findByChannelId(channelId) {
    const store = loadStore();

    for (const category of ['fwa', 'warEntry', 'allianceApply']) {
        for (const [ticketId, record] of Object.entries(store[category])) {
            if (record.channelId === channelId) {
                return { category, ticketId, record };
            }
        }
    }
    return null;
}

/**
 * Update the claimedBy and claimedUserNickname fields for a ticket identified by its channel ID.
 *
 * @param {string} channelId             – Discord channel ID
 * @param {string} staffId               – Discord user ID of the claiming staff member
 * @param {string} [claimedUserNickname] – Nickname/display name of the claiming staff member
 * @param {string} [ticketOwnerName]     – Nickname/display name of the ticket opener (optional fallback)
 */
function setClaimed(channelId, staffId, claimedUserNickname = null, ticketOwnerName = null) {
    const store = loadStore();

    for (const category of ['fwa', 'warEntry', 'allianceApply']) {
        for (const [ticketId, record] of Object.entries(store[category])) {
            if (record.channelId === channelId) {
                record.claimedBy = staffId;
                if (claimedUserNickname !== undefined && claimedUserNickname !== null) {
                    record.claimedUserNickname = claimedUserNickname;
                }
                if (ticketOwnerName && !record.ticketOwnerName) {
                    record.ticketOwnerName = ticketOwnerName;
                }
                saveStore(store);
                return;
            }
        }
    }
    // If not found, silently ignore (ticket type might not be tracked)
}

/**
 * Update the ticketOwnerName field for a ticket identified by its channel ID.
 *
 * @param {string} channelId       – Discord channel ID
 * @param {string} ticketOwnerName – Nickname/display name of the ticket opener
 */
function setTicketOwnerName(channelId, ticketOwnerName) {
    const store = loadStore();

    for (const category of ['fwa', 'warEntry', 'allianceApply']) {
        for (const [ticketId, record] of Object.entries(store[category])) {
            if (record.channelId === channelId) {
                record.ticketOwnerName = ticketOwnerName;
                saveStore(store);
                return;
            }
        }
    }
}

/**
 * Update the transcript field for a ticket identified by its channel ID.
 *
 * @param {string} channelId    – Discord channel ID
 * @param {string} transcriptRef – URL or reference string for the transcript
 */
function setTranscript(channelId, transcriptRef) {
    const store = loadStore();

    for (const category of ['fwa', 'warEntry', 'allianceApply']) {
        for (const [ticketId, record] of Object.entries(store[category])) {
            if (record.channelId === channelId) {
                record.transcript = transcriptRef;
                saveStore(store);
                return;
            }
        }
    }
}

module.exports = {
    loadStore,
    saveStore,
    resolveCategory,
    createTicket,
    findByChannelId,
    setClaimed,
    setTicketOwnerName,
    setTranscript
};
