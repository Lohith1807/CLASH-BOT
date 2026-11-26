/**
 * Clan Recruitment Tracking & Independent Rotation System
 * Manages TH rotations and lifetime recruitment counts inside unified data/clanrole.json.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TRACKED_THS = ['TH19', 'TH18'];
const ROTATION_LIMIT = 1;

/**
 * Format string tag to #TAG uppercase
 */
function formatClanTag(tag) {
    if (!tag || typeof tag !== 'string') return '';
    const clean = tag.trim().toUpperCase();
    return clean.startsWith('#') ? clean : '#' + clean;
}

/**
 * Clean tag (no #, uppercase)
 */
function cleanTag(tag) {
    if (!tag || typeof tag !== 'string') return '';
    return tag.replace(/^#/, '').trim().toUpperCase();
}

/**
 * Normalize Town Hall level to uppercase "TH19", "TH18", etc.
 * Converts lowercase (th17, 17) to uppercase (TH17).
 */
function normalizeTh(th) {
    if (!th) return null;
    const str = String(th).trim().toUpperCase();
    const cleanNum = str.replace(/[^0-9]/g, '');
    const num = parseInt(cleanNum, 10);
    if (isNaN(num) || num <= 0 || num > 35) return null;
    return `TH${num}`;
}

/**
 * Format ISO date string to human-readable format: "21 November 2026, 9:00 PM"
 */
function formatAssignmentDate(isoString) {
    if (!isoString) return "Unknown";
    try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const day = d.getDate();
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch (_) {
        return isoString;
    }
}

/**
 * Safely read recruitment data from unified MongoDB-backed clan details store
 */
function getRecruitmentData() {
    const defaultMetadata = {
        rotations: { TH19: 1, TH18: 1 },
        trackedTHs: [...DEFAULT_TRACKED_THS]
    };

    try {
        const dataManager = require('./dataManager');
        const rawStore = dataManager.readRawClanRoleStore();
        const data = {
            _metadata: rawStore._metadata ? JSON.parse(JSON.stringify(rawStore._metadata)) : { ...defaultMetadata }
        };

        if (!data._metadata.rotations) {
            data._metadata.rotations = { TH19: 1, TH18: 1 };
        }
        if (!Array.isArray(data._metadata.trackedTHs) || data._metadata.trackedTHs.length === 0) {
            data._metadata.trackedTHs = [...DEFAULT_TRACKED_THS];
        }

        for (const [tag, clanInfo] of Object.entries(rawStore)) {
            if (tag.startsWith('_') || !clanInfo || typeof clanInfo !== 'object') continue;
            if (clanInfo.presentRotation || clanInfo.recruitments) {
                data[tag] = {};
                if (clanInfo.presentRotation) data[tag].presentRotation = clanInfo.presentRotation;
                if (clanInfo.recruitments) data[tag].recruitments = clanInfo.recruitments;
            }
        }

        return data;
    } catch (err) {
        console.error('[ClanRecruitments] Error reading clan details:', err.message);
        return { _metadata: defaultMetadata };
    }
}

/**
 * Safely save recruitment data into unified MongoDB-backed clan details store
 */
function saveRecruitmentData(data) {
    try {
        const dataManager = require('./dataManager');
        const rawStore = dataManager.readRawClanRoleStore();

        if (data && data._metadata) {
            rawStore._metadata = data._metadata;
        }

        // Update recruitment fields for clans in data; clear if removed from data
        for (const tag of Object.keys(rawStore)) {
            if (tag.startsWith('_') || !rawStore[tag] || typeof rawStore[tag] !== 'object') continue;
            if (data && data[tag]) {
                if (data[tag].presentRotation) {
                    rawStore[tag].presentRotation = data[tag].presentRotation;
                } else {
                    delete rawStore[tag].presentRotation;
                }
                if (data[tag].recruitments) {
                    rawStore[tag].recruitments = data[tag].recruitments;
                } else {
                    delete rawStore[tag].recruitments;
                }
            } else {
                delete rawStore[tag].presentRotation;
                delete rawStore[tag].recruitments;
            }
        }

        dataManager.writeRawClanRoleStore(rawStore);
        return true;
    } catch (err) {
        console.error('[ClanRecruitments] Error writing clan details:', err.message);
        return false;
    }
}

/**
 * Get currently tracked Town Hall levels for rotations
 * @param {Object} [data] - Optional recruitment data
 * @returns {string[]} Array of uppercase THs, e.g. ["TH19", "TH18"]
 */
function getTrackedRotationTHs(data = null) {
    const store = data || getRecruitmentData();
    if (!store._metadata) store._metadata = {};
    if (!Array.isArray(store._metadata.trackedTHs) || store._metadata.trackedTHs.length === 0) {
        store._metadata.trackedTHs = [...DEFAULT_TRACKED_THS];
    }
    return store._metadata.trackedTHs.slice().sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numB - numA;
    });
}

/**
 * Add a Town Hall level to the tracked rotation list
 * Converts input to uppercase (e.g. th17 -> TH17)
 * @param {string|number} thInput - e.g. "th17", 17, "17", "TH17"
 * @returns {{ success: boolean, th: string, alreadyExists?: boolean, invalid?: boolean, trackedTHs: string[] }}
 */
function addTrackedRotationTH(thInput) {
    const thKey = normalizeTh(thInput);
    if (!thKey) {
        return { success: false, invalid: true, trackedTHs: getTrackedRotationTHs() };
    }

    const data = getRecruitmentData();
    if (!data._metadata) data._metadata = {};
    if (!Array.isArray(data._metadata.trackedTHs)) {
        data._metadata.trackedTHs = [...DEFAULT_TRACKED_THS];
    }

    if (data._metadata.trackedTHs.includes(thKey)) {
        return {
            success: false,
            alreadyExists: true,
            th: thKey,
            trackedTHs: getTrackedRotationTHs(data)
        };
    }

    data._metadata.trackedTHs.push(thKey);
    data._metadata.trackedTHs.sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numB - numA;
    });

    if (!data._metadata.rotations) data._metadata.rotations = {};
    if (!data._metadata.rotations[thKey]) {
        data._metadata.rotations[thKey] = 1;
    }

    // Ensure all registered clans have the new TH in presentRotation
    for (const [tag, clan] of Object.entries(data)) {
        if (tag.startsWith('_')) continue;
        if (!clan.presentRotation) clan.presentRotation = {};
        if (!clan.presentRotation[thKey]) {
            clan.presentRotation[thKey] = {
                count: 0,
                rotationId: data._metadata.rotations[thKey] || 1,
                players: []
            };
        }
    }

    saveRecruitmentData(data);
    return {
        success: true,
        th: thKey,
        trackedTHs: getTrackedRotationTHs(data)
    };
}

/**
 * Remove a Town Hall level from the tracked rotation list
 * @param {string|number} thInput - e.g. "th18", 18, "18", "TH18"
 * @returns {{ success: boolean, th: string, notFound?: boolean, invalid?: boolean, trackedTHs: string[] }}
 */
function removeTrackedRotationTH(thInput) {
    const thKey = normalizeTh(thInput);
    if (!thKey) {
        return { success: false, invalid: true, trackedTHs: getTrackedRotationTHs() };
    }

    const data = getRecruitmentData();
    if (!data._metadata) data._metadata = {};
    if (!Array.isArray(data._metadata.trackedTHs)) {
        data._metadata.trackedTHs = [...DEFAULT_TRACKED_THS];
    }

    if (!data._metadata.trackedTHs.includes(thKey)) {
        return {
            success: false,
            notFound: true,
            th: thKey,
            trackedTHs: getTrackedRotationTHs(data)
        };
    }

    data._metadata.trackedTHs = data._metadata.trackedTHs.filter(t => t !== thKey);

    // Remove from presentRotation of each clan
    for (const [tag, clan] of Object.entries(data)) {
        if (tag.startsWith('_')) continue;
        if (clan.presentRotation && clan.presentRotation[thKey]) {
            delete clan.presentRotation[thKey];
        }
    }

    saveRecruitmentData(data);
    return {
        success: true,
        th: thKey,
        trackedTHs: getTrackedRotationTHs(data)
    };
}

/**
 * Initialize a clan entry with required presentRotation and recruitments structure
 */
function initClanEntry(data, clanTag) {
    const formattedTag = formatClanTag(clanTag);
    if (!formattedTag) return null;

    const tracked = getTrackedRotationTHs(data);

    if (!data[formattedTag]) {
        const clanObj = {
            presentRotation: {},
            recruitments: {
                TH19: 0,
                TH18: 0,
                TH17: 0,
                TH16: 0,
                TH15: 0,
                TH14: 0,
                total: 0
            }
        };
        for (const th of tracked) {
            clanObj.presentRotation[th] = {
                count: 0,
                rotationId: data._metadata?.rotations?.[th] || 1,
                players: []
            };
        }
        data[formattedTag] = clanObj;
    } else {
        // Ensure presentRotation structure
        if (!data[formattedTag].presentRotation) {
            data[formattedTag].presentRotation = {};
        }
        for (const th of tracked) {
            if (!data[formattedTag].presentRotation[th]) {
                data[formattedTag].presentRotation[th] = {
                    count: 0,
                    rotationId: data._metadata?.rotations?.[th] || 1,
                    players: []
                };
            } else {
                if (!Array.isArray(data[formattedTag].presentRotation[th].players)) {
                    data[formattedTag].presentRotation[th].players = [];
                }
                if (data[formattedTag].presentRotation[th].rotationId === undefined) {
                    data[formattedTag].presentRotation[th].rotationId = data._metadata?.rotations?.[th] || 1;
                }
                data[formattedTag].presentRotation[th].count = data[formattedTag].presentRotation[th].players.length;
            }
        }

        // Ensure recruitments structure
        if (!data[formattedTag].recruitments) {
            data[formattedTag].recruitments = {
                TH19: 0,
                TH18: 0,
                TH17: 0,
                TH16: 0,
                TH15: 0,
                TH14: 0,
                total: 0
            };
        } else {
            for (const th of ['TH19', 'TH18', 'TH17', 'TH16', 'TH15', 'TH14']) {
                if (data[formattedTag].recruitments[th] === undefined) {
                    data[formattedTag].recruitments[th] = 0;
                }
            }
            if (data[formattedTag].recruitments.total === undefined) {
                data[formattedTag].recruitments.total = Object.entries(data[formattedTag].recruitments)
                    .filter(([k]) => k.startsWith('TH'))
                    .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
            }
        }
    }

    return data[formattedTag];
}

/**
 * Synchronize registered FWA clans list with recruitment data
 */
function syncFwaClans(data, fwaClanTags = []) {
    if (!data || typeof data !== 'object') return data;
    if (!Array.isArray(fwaClanTags) || fwaClanTags.length === 0) return data;

    for (const tag of fwaClanTags) {
        initClanEntry(data, tag);
    }
    return data;
}

/**
 * Find the next clan in rotation list order for a given Town Hall level
 *
 * @param {string|number} thInput - Town Hall level (e.g. 18, "TH18")
 * @param {Array<string>} [fwaClanTags] - Optional ordered list of FWA clan tags
 * @param {Object} [recruitmentData] - Optional pre-loaded recruitment data
 * @returns {{ clanTag: string|null, isTracked: boolean, thKey: string, allReceived: boolean }}
 */
function getNextInListClan(thInput, fwaClanTags = null, recruitmentData = null) {
    const data = recruitmentData || getRecruitmentData();
    const thKey = normalizeTh(thInput);
    const tracked = getTrackedRotationTHs(data);
    const isTracked = tracked.includes(thKey);

    let tags = fwaClanTags;
    if (!Array.isArray(tags) || tags.length === 0) {
        const dataManager = require('./dataManager');
        const clanRoles = dataManager.getClanRoles();
        tags = Object.keys(clanRoles).filter(t => (clanRoles[t].clanType || 'fwa').toLowerCase() === 'fwa');
    }

    const receivedTags = new Set();
    for (const tag of tags) {
        const formattedTag = formatClanTag(tag);
        const clanRec = data[formattedTag];
        const rotObj = clanRec?.presentRotation?.[thKey];
        const players = rotObj?.players || [];
        if (players.length >= ROTATION_LIMIT) {
            receivedTags.add(formattedTag);
        }
    }

    let nextInListTag = null;
    for (const tag of tags) {
        const formattedTag = formatClanTag(tag);
        if (!receivedTags.has(formattedTag)) {
            nextInListTag = formattedTag;
            break;
        }
    }

    const allReceived = tags.length > 0 && receivedTags.size === tags.length;

    return {
        clanTag: nextInListTag,
        isTracked,
        thKey,
        allReceived
    };
}

/**
 * Check if assigning this player/TH to the clan triggers a duplicate assignment warning.
 * Returns { isDuplicate: boolean, previousPlayer: Object | null }
 */
function checkDuplicate(clanTag, thLevel, playerTag = null, ticketId = null) {
    const thKey = normalizeTh(thLevel);
    const data = getRecruitmentData();
    const tracked = getTrackedRotationTHs(data);

    if (!tracked.includes(thKey)) {
        return { isDuplicate: false, previousPlayer: null };
    }

    const formattedClanTag = formatClanTag(clanTag);
    const clanEntry = data[formattedClanTag];
    if (!clanEntry || !clanEntry.presentRotation || !clanEntry.presentRotation[thKey]) {
        return { isDuplicate: false, previousPlayer: null };
    }

    const rotationObj = clanEntry.presentRotation[thKey];
    const players = rotationObj.players || [];

    // Filter out the current player if they were already assigned in this same ticket
    const otherPlayers = players.filter(p => {
        if (playerTag && cleanTag(p.playerTag) === cleanTag(playerTag)) {
            if (ticketId && p.ticketId === ticketId) {
                return false; // same player and same ticket => reassignment, not duplicate
            }
        }
        return true;
    });

    if (otherPlayers.length >= ROTATION_LIMIT) {
        // Most recent recruitment from the list
        const previousPlayer = otherPlayers[otherPlayers.length - 1];
        return {
            isDuplicate: true,
            previousPlayer: {
                playerName: previousPlayer.playerName || "Unknown",
                playerTag: previousPlayer.playerTag || "",
                ticketId: previousPlayer.ticketId || "",
                dateTime: previousPlayer.dateTime || "",
                formattedDate: formatAssignmentDate(previousPlayer.dateTime)
            }
        };
    }

    return { isDuplicate: false, previousPlayer: null };
}

/**
 * Find existing assignment in current rotations for playerTag + ticketId
 */
function findExistingAssignment(data, playerTag, ticketId, channelId = null) {
    if (!playerTag || (!ticketId && !channelId)) return null;
    const cleanP = cleanTag(playerTag);
    const tracked = getTrackedRotationTHs(data);

    for (const [tag, clanData] of Object.entries(data)) {
        if (tag.startsWith('_')) continue;
        if (!clanData.presentRotation) continue;

        for (const thKey of tracked) {
            const rot = clanData.presentRotation[thKey];
            if (!rot || !Array.isArray(rot.players)) continue;

            const index = rot.players.findIndex(p => {
                if (cleanTag(p.playerTag) !== cleanP) return false;
                if (ticketId && p.ticketId && p.ticketId === ticketId) return true;
                if (channelId && p.channelId && p.channelId === channelId) return true;
                return false;
            });

            if (index !== -1) {
                return {
                    clanTag: tag,
                    thKey,
                    playerIndex: index,
                    playerEntry: rot.players[index],
                    rotationId: rot.rotationId
                };
            }
        }
    }
    return null;
}

/**
 * Record a clan assignment transaction.
 *
 * Handles:
 * - Independent rotations for all tracked TH levels
 * - Lifetime recruitment count increments
 * - Reassignment within the same ticket (same playerTag + ticketId)
 * - Safe removal of old rotation entry without double-counting lifetime
 * - Independent auto-reset when all FWA clans reach allocation limit
 *
 * @param {Object} params
 * @param {string} params.clanTag - Selected clan tag
 * @param {Object} params.player - Player data { name, tag, townHallLevel }
 * @param {string} params.ticketId - Ticket ID (e.g. "TICKET-1")
 * @param {string} [params.channelId] - Ticket channel ID
 * @param {Array<string>} params.fwaClanTags - List of all registered FWA clan tags
 * @returns {Object} Result summary { success, isReassignment, isDuplicate, previousAssignment, rotationReset, thKey }
 */
function recordAssignment({ clanTag, player, ticketId, channelId = null, fwaClanTags = [] }) {
    if (!clanTag || !player || !player.tag) {
        return { success: false, error: "Missing required clan or player data" };
    }

    const formattedClanTag = formatClanTag(clanTag);
    const formattedPlayerTag = formatClanTag(player.tag);
    const thKey = normalizeTh(player.townHallLevel || player.thLevel);

    // Read full store
    const data = getRecruitmentData();
    const tracked = getTrackedRotationTHs(data);
    const isTrackedRotation = tracked.includes(thKey);

    // Ensure all FWA clans exist in data
    syncFwaClans(data, fwaClanTags);
    initClanEntry(data, formattedClanTag);

    let isReassignment = false;
    let oldAssignmentInfo = null;

    // 1. Check for existing assignment with same playerTag + ticketId across all clans
    const existing = findExistingAssignment(data, formattedPlayerTag, ticketId, channelId);

    if (existing) {
        isReassignment = true;
        oldAssignmentInfo = {
            clanTag: existing.clanTag,
            thKey: existing.thKey,
            playerEntry: existing.playerEntry
        };

        const oldClanEntry = data[existing.clanTag];
        if (oldClanEntry && oldClanEntry.presentRotation && oldClanEntry.presentRotation[existing.thKey]) {
            const rot = oldClanEntry.presentRotation[existing.thKey];
            // Rotation safety: Only remove if the clan is still in the same rotation generation
            if (rot.rotationId === existing.playerEntry.rotationId) {
                rot.players = rot.players.filter((_, idx) => idx !== existing.playerIndex);
                rot.count = rot.players.length;
            }
        }
    }

    // 2. Lifetime recruitment counts
    // Only increment for genuinely new recruitments (never for reassignment in the same ticket)
    const clanEntry = data[formattedClanTag];
    if (!isReassignment) {
        if (!clanEntry.recruitments) clanEntry.recruitments = {};
        if (thKey) {
            clanEntry.recruitments[thKey] = (clanEntry.recruitments[thKey] || 0) + 1;
            clanEntry.recruitments.total = Object.entries(clanEntry.recruitments)
                .filter(([k]) => k.startsWith('TH'))
                .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
        }
    }

    let isDuplicate = false;
    let previousDuplicatePlayer = null;
    let rotationReset = false;

    // 3. Present Rotation Tracking (Only for tracked TH levels)
    if (isTrackedRotation) {
        const rotObj = clanEntry.presentRotation[thKey];
        if (rotObj.count >= ROTATION_LIMIT) {
            isDuplicate = true;
            if (rotObj.players.length > 0) {
                previousDuplicatePlayer = rotObj.players[rotObj.players.length - 1];
            }
        }

        const newPlayerEntry = {
            playerName: player.name || "Unknown",
            playerTag: formattedPlayerTag,
            ticketId: ticketId || "",
            dateTime: new Date().toISOString(),
            clanTag: formattedClanTag,
            thLevel: thKey,
            rotationId: rotObj.rotationId || data._metadata.rotations[thKey] || 1
        };
        if (channelId) newPlayerEntry.channelId = channelId;

        rotObj.players.push(newPlayerEntry);
        rotObj.count = rotObj.players.length;

        // 4. Check if all registered FWA clans have reached the rotation limit for this TH level
        const activeFwaTags = fwaClanTags.map(formatClanTag).filter(Boolean);
        if (activeFwaTags.length > 0) {
            let allClansReachedLimit = true;
            for (const fwaTag of activeFwaTags) {
                const cEntry = data[fwaTag];
                if (!cEntry || !cEntry.presentRotation || !cEntry.presentRotation[thKey] || cEntry.presentRotation[thKey].count < ROTATION_LIMIT) {
                    allClansReachedLimit = false;
                    break;
                }
            }

            // 5. Automatic Rotation Reset when ALL FWA clans have at least ROTATION_LIMIT players for this TH
            if (allClansReachedLimit) {
                // Increment rotation generation for this TH
                data._metadata.rotations[thKey] = (data._metadata.rotations[thKey] || 1) + 1;
                const nextRotationId = data._metadata.rotations[thKey];

                for (const fwaTag of activeFwaTags) {
                    if (data[fwaTag] && data[fwaTag].presentRotation && data[fwaTag].presentRotation[thKey]) {
                        data[fwaTag].presentRotation[thKey].count = 0;
                        data[fwaTag].presentRotation[thKey].players = [];
                        data[fwaTag].presentRotation[thKey].rotationId = nextRotationId;
                    }
                }
                rotationReset = true;
            }
        }
    }

    // 6. Safe Save
    saveRecruitmentData(data);

    return {
        success: true,
        isReassignment,
        oldAssignmentInfo,
        isDuplicate,
        previousDuplicatePlayer,
        rotationReset,
        thKey,
        clanTag: formattedClanTag
    };
}

/**
 * Unassign a player from clan rotations and recruitment counts
 *
 * @param {Object} params
 * @param {string} [params.clanTag] - Clan tag
 * @param {string} [params.playerTag] - Player tag
 * @param {string} [params.ticketId] - Ticket ID
 * @param {string} [params.channelId] - Ticket channel ID
 * @param {string|number} [params.thLevel] - Town hall level hint
 * @returns {Object} Result summary { success: boolean, removedFromRotation: boolean, clanTag: string, thKey: string, player: Object }
 */
function unassignPlayer({ clanTag = null, playerTag = null, ticketId = null, channelId = null, thLevel = null } = {}) {
    const data = getRecruitmentData();
    const formattedClanTag = clanTag ? formatClanTag(clanTag) : null;
    const formattedPlayerTag = playerTag ? formatClanTag(playerTag) : null;
    const cleanP = formattedPlayerTag ? cleanTag(formattedPlayerTag) : null;
    const tracked = getTrackedRotationTHs(data);

    let targetClanTag = formattedClanTag;
    let targetThKey = thLevel ? normalizeTh(thLevel) : null;
    let foundPlayerEntry = null;
    let removedFromRotation = false;

    // 1. Search in presentRotation for matching entry
    const clansToSearch = targetClanTag && data[targetClanTag] ? [targetClanTag] : Object.keys(data).filter(k => !k.startsWith('_'));

    for (const cTag of clansToSearch) {
        const clanData = data[cTag];
        if (!clanData || !clanData.presentRotation) continue;

        const thList = targetThKey ? [targetThKey] : tracked;
        for (const th of thList) {
            const rot = clanData.presentRotation[th];
            if (!rot || !Array.isArray(rot.players)) continue;

            const index = rot.players.findIndex(p => {
                if (channelId && p.channelId && p.channelId === channelId) return true;
                if (ticketId && p.ticketId && p.ticketId === ticketId) return true;
                if (cleanP && cleanTag(p.playerTag) === cleanP) return true;
                return false;
            });

            if (index !== -1) {
                foundPlayerEntry = rot.players[index];
                targetClanTag = cTag;
                targetThKey = th;

                // Remove player from rotation list
                rot.players.splice(index, 1);
                rot.count = rot.players.length;
                removedFromRotation = true;
                break;
            }
        }
        if (foundPlayerEntry) break;
    }

    // 2. Adjust lifetime recruitment counts for the clan if targetClanTag and targetThKey are known
    if (targetClanTag && targetThKey && data[targetClanTag]) {
        const clanEntry = data[targetClanTag];
        if (clanEntry.recruitments && typeof clanEntry.recruitments[targetThKey] === 'number' && clanEntry.recruitments[targetThKey] > 0) {
            clanEntry.recruitments[targetThKey] -= 1;
            clanEntry.recruitments.total = Object.entries(clanEntry.recruitments)
                .filter(([k]) => k.startsWith('TH'))
                .reduce((sum, [, v]) => sum + (typeof v === 'number' ? v : 0), 0);
        }
    }

    saveRecruitmentData(data);

    return {
        success: true,
        removedFromRotation,
        clanTag: targetClanTag,
        thKey: targetThKey,
        player: foundPlayerEntry
    };
}

/**
 * Remove a clan from clan-recruitments.json when revoked
 */
function removeClanFromRecruitments(clanTag) {
    try {
        const formattedTag = formatClanTag(clanTag);
        const data = getRecruitmentData();
        let changed = false;

        if (data[formattedTag]) {
            delete data[formattedTag];
            changed = true;
        }

        const tagNoHash = cleanTag(clanTag);
        if (data[tagNoHash]) {
            delete data[tagNoHash];
            changed = true;
        }

        if (changed) {
            saveRecruitmentData(data);
        }
        return changed;
    } catch (err) {
        console.error(`[ClanRecruitments] Error removing clan ${clanTag}:`, err.message);
        return false;
    }
}

/**
 * Save an active rotation message reference for real-time auto-updates
 */
function saveActiveRotationMessage(entry) {
    if (!entry || !entry.channelId || !entry.messageId) return;
    const data = getRecruitmentData();
    if (!data._metadata) data._metadata = {};
    if (!Array.isArray(data._metadata.activeRotationMessages)) {
        data._metadata.activeRotationMessages = [];
    }

    // Keep only latest message per channel, max 10 channels
    data._metadata.activeRotationMessages = data._metadata.activeRotationMessages.filter(
        m => m.channelId !== entry.channelId
    );
    data._metadata.activeRotationMessages.push({
        channelId: entry.channelId,
        messageId: entry.messageId,
        guildId: entry.guildId,
        timestamp: Date.now()
    });

    if (data._metadata.activeRotationMessages.length > 10) {
        data._metadata.activeRotationMessages = data._metadata.activeRotationMessages.slice(-10);
    }

    saveRecruitmentData(data);
}

/**
 * Get active rotation messages
 */
function getActiveRotationMessages(data = null) {
    const store = data || getRecruitmentData();
    return Array.isArray(store._metadata?.activeRotationMessages)
        ? store._metadata.activeRotationMessages
        : [];
}

/**
 * Auto-update all active rotation messages on Discord when rotations change
 */
async function updateAllActiveRotationMessages(client) {
    if (!client) return;
    try {
        const clanRotationCmd = require('../commands/discord/tickets/clan-rotation.js');
        const dataManager = require('./dataManager');
        const emojiUtils = require('./emoji');

        const clanRoles = dataManager.getClanRoles();
        const recData = getRecruitmentData();
        const trackedTHs = getTrackedRotationTHs(recData);
        const rulesData = dataManager.getClanRules();

        const activeMsgs = getActiveRotationMessages(recData);
        if (activeMsgs.length === 0) return;

        const remaining = [];

        for (const entry of activeMsgs) {
            try {
                const channel = await client.channels.fetch(entry.channelId).catch(() => null);
                if (!channel) continue;
                const message = await channel.messages.fetch(entry.messageId).catch(() => null);
                if (!message) continue;

                const publicPages = clanRotationCmd.buildPublicPages(clanRoles, recData, trackedTHs, emojiUtils, rulesData);
                const updatedEmbed = clanRotationCmd.buildPublicRotationEmbed(publicPages[0], 0, publicPages.length);
                const updatedRows = clanRotationCmd.buildComponents(trackedTHs, 0, publicPages.length, emojiUtils);

                await message.edit({
                    embeds: [updatedEmbed],
                    components: updatedRows
                }).catch(() => null);

                remaining.push(entry);
            } catch (err) {
                // Ignore failure for individual message
            }
        }

        if (remaining.length !== activeMsgs.length) {
            const freshData = getRecruitmentData();
            if (freshData._metadata) {
                freshData._metadata.activeRotationMessages = remaining;
                saveRecruitmentData(freshData);
            }
        }
    } catch (err) {
        console.error('[ClanRecruitments] Error auto-updating active rotation messages:', err.message);
    }
}

module.exports = {
    getRecruitmentData,
    saveRecruitmentData,
    initClanEntry,
    syncFwaClans,
    checkDuplicate,
    getNextInListClan,
    findExistingAssignment,
    recordAssignment,
    unassignPlayer,
    removeClanFromRecruitments,
    formatAssignmentDate,
    formatClanTag,
    cleanTag,
    getTrackedRotationTHs,
    addTrackedRotationTH,
    removeTrackedRotationTH,
    normalizeTh,
    saveActiveRotationMessage,
    getActiveRotationMessages,
    updateAllActiveRotationMessages,
    TRACKED_ROTATION_THS: DEFAULT_TRACKED_THS,
    ROTATION_LIMIT
};
