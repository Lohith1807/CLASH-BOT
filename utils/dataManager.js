/**
 * Centralized Data Manager for JSON file operations
 * Eliminates redundant read/write code across command files
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");

const PATHS = {
    strikeplayers: path.join(DATA_DIR, "strikeplayers.json"),
    ticketTimers: path.join(DATA_DIR, "ticketTimers.json"),
    wartype: path.join(DATA_DIR, "wartype.json"),
    recruitingths: path.join(DATA_DIR, "recruitingths.json"),
    scanwar: path.join(DATA_DIR, "scanwar.json"),
    strikecounters: path.join(DATA_DIR, "strikecounters.json")
};


/**
 * Get strike players data (unlinked players with strikes)
 * @returns {Object} Strike players data object
 */
function getStrikePlayers() {
    try {
        if (!fs.existsSync(PATHS.strikeplayers)) return {};
        const raw = fs.readFileSync(PATHS.strikeplayers, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading strikeplayers.json:", err.message);
        return {};
    }
}

let userDataCache = null;
let userDataLoadedFromMongo = false;
let pendingMongoSync = Promise.resolve();

/**
 * Load all user records from MongoDB (discord.userdata) into the in-memory cache.
 * Called automatically by connectToDatabase() on startup.
 */
async function initUserDataFromMongo() {
    try {
        const { UserData } = require("./mongodb");
        const docs = await UserData.find({}, { _id: 0, userId: 1, accounts: 1 }).lean();
        const nextCache = {};
        for (const doc of docs) {
            if (doc && doc.userId) {
                nextCache[doc.userId] = Array.isArray(doc.accounts) ? doc.accounts : [];
            }
        }
        userDataCache = nextCache;
        userDataLoadedFromMongo = true;
        console.log(`✅ Loaded ${docs.length} user records from MongoDB (discord.userdata)`);
    } catch (err) {
        console.error("Error loading userData from MongoDB:", err.message);
    }
}

/**
 * Wait for any queued MongoDB userData writes to finish
 */
function flushUserDataToMongo() {
    return pendingMongoSync;
}

/**
 * Get user data (linked Discord users to CoC accounts) from MongoDB-backed cache
 * @returns {Object} User data object
 */
function getUserData() {
    if (userDataCache !== null) {
        return JSON.parse(JSON.stringify(userDataCache));
    }
    return {};
}

let clanDetailsCache = null;
let pendingClanDetailsSync = Promise.resolve();

/**
 * Load all clan details from MongoDB (discord.clandetails) into the in-memory cache.
 * Called automatically by connectToDatabase() on startup.
 */
async function initClanDetailsFromMongo() {
    try {
        const { ClanDetails } = require("./mongodb");
        const docs = await ClanDetails.find({}, { _id: 0, key: 1, data: 1 }).lean();
        const nextCache = {};
        for (const doc of docs) {
            if (doc && doc.key) {
                nextCache[doc.key] = doc.data;
            }
        }
        clanDetailsCache = nextCache;
        console.log(`✅ Loaded ${docs.length} clan detail records from MongoDB (discord.clandetails)`);
    } catch (err) {
        console.error("Error loading clanDetails from MongoDB:", err.message);
    }
}

/**
 * Wait for any queued MongoDB clanDetails writes to finish
 */
function flushClanDetailsToMongo() {
    return pendingClanDetailsSync;
}

/**
 * Read the raw unified clan details store (including _metadata and _defaultRules) from MongoDB-backed cache
 * @returns {Object} Raw clan details object
 */
function readRawClanRoleStore() {
    if (clanDetailsCache !== null) {
        return JSON.parse(JSON.stringify(clanDetailsCache));
    }
    return {};
}

/**
 * Write the raw unified clan details store to cache and sync diffs to MongoDB (discord.clandetails)
 * @param {Object} rawStore - Full clan details object
 */
function writeRawClanRoleStore(rawStore) {
    const prevCache = clanDetailsCache || {};
    const nextStore = rawStore ? JSON.parse(JSON.stringify(rawStore)) : {};
    clanDetailsCache = nextStore;

    const ops = [];
    for (const [key, val] of Object.entries(nextStore)) {
        const prevVal = prevCache[key];
        if (!prevVal || JSON.stringify(prevVal) !== JSON.stringify(val)) {
            ops.push({
                updateOne: {
                    filter: { key },
                    update: { $set: { key, data: val } },
                    upsert: true
                }
            });
        }
    }

    for (const oldKey of Object.keys(prevCache)) {
        if (!Object.prototype.hasOwnProperty.call(nextStore, oldKey)) {
            ops.push({
                deleteOne: { filter: { key: oldKey } }
            });
        }
    }

    if (ops.length > 0) {
        pendingClanDetailsSync = pendingClanDetailsSync.then(async () => {
            try {
                const mongoose = require("mongoose");
                const { ClanDetails, connectToDatabase } = require("./mongodb");
                if (mongoose.connection.readyState !== 1) {
                    await connectToDatabase();
                }
                if (mongoose.connection.readyState !== 1) return;
                await ClanDetails.bulkWrite(ops, { ordered: false });
            } catch (err) {
                console.error("Error syncing clanDetails to MongoDB (discord.clandetails):", err.message);
            }
        });
    }
}

/**
 * Get clan roles (clan tag to Discord role mappings, excluding _metadata/_defaultRules)
 * @returns {Object} Clan roles object keyed by clan tag
 */
function getClanRoles() {
    const raw = readRawClanRoleStore();
    const result = {};
    for (const [key, val] of Object.entries(raw)) {
        if (key.startsWith("_")) continue;
        result[key] = val;
    }
    return result;
}





/**
 * Get ticket timers data
 * @returns {Object} Ticket timers object
 */
function getTicketTimers() {
    try {
        if (!fs.existsSync(PATHS.ticketTimers)) return {};
        const raw = fs.readFileSync(PATHS.ticketTimers, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading ticketTimers.json:", err.message);
        return {};
    }
}

/**
 * Get war type data
 * @returns {Object} War type object
 */
function getWarType() {
    try {
        if (!fs.existsSync(PATHS.wartype)) return {};
        const raw = fs.readFileSync(PATHS.wartype, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading wartype.json:", err.message);
        return {};
    }
}


/**
 * Save user data to in-memory cache and sync diffs to MongoDB (discord.userdata)
 * @param {Object} data - User data to save
 */
function saveUserData(data) {
    const prevCache = userDataCache || {};
    const nextData = data ? JSON.parse(JSON.stringify(data)) : {};
    userDataCache = nextData;

    const ops = [];
    for (const [userId, accounts] of Object.entries(nextData)) {
        const nextArr = Array.isArray(accounts) ? accounts : [];
        const prevArr = prevCache[userId];
        if (!prevArr || JSON.stringify(prevArr) !== JSON.stringify(nextArr)) {
            ops.push({
                updateOne: {
                    filter: { userId },
                    update: { $set: { userId, accounts: nextArr } },
                    upsert: true
                }
            });
        }
    }

    for (const oldUserId of Object.keys(prevCache)) {
        if (!Object.prototype.hasOwnProperty.call(nextData, oldUserId)) {
            ops.push({
                deleteOne: { filter: { userId: oldUserId } }
            });
        }
    }

    if (ops.length > 0) {
        pendingMongoSync = pendingMongoSync.then(async () => {
            try {
                const mongoose = require("mongoose");
                const { UserData, connectToDatabase } = require("./mongodb");
                if (mongoose.connection.readyState !== 1) {
                    await connectToDatabase();
                }
                if (mongoose.connection.readyState !== 1) return;
                await UserData.bulkWrite(ops, { ordered: false });
            } catch (err) {
                console.error("Error syncing userData to MongoDB (discord.userdata):", err.message);
            }
        });
    }
}

/**
 * Save clan roles (preserves _metadata, _defaultRules, and per-clan nested data in clanrole.json)
 * @param {Object} data - Clan roles to save
 */
function saveClanRoles(data) {
    try {
        const existingRaw = readRawClanRoleStore();
        const nextRaw = {};

        // Preserve top-level metadata keys (_metadata, _defaultRules, etc.)
        for (const [key, val] of Object.entries(existingRaw)) {
            if (key.startsWith("_")) {
                nextRaw[key] = val;
            }
        }

        const defaultRules = (nextRaw._defaultRules && Array.isArray(nextRaw._defaultRules.rules) && nextRaw._defaultRules.rules.length > 0)
            ? nextRaw._defaultRules.rules
            : [
                "Be active daily and participate in wars and CWL.",
                "Always use both war attacks — missing attacks may lead to demotion.",
                "Donate correct troops only as requested.",
                "Respect all members — teamwork builds victory.",
                "No rushed bases allowed in main clan — use feeder clans if needed.",
                "Maintain a healthy competitive spirit, no toxicity."
            ];

        for (const [rawTag, clanInfo] of Object.entries(data || {})) {
            if (rawTag.startsWith("_")) continue;
            const prevEntry = existingRaw[rawTag] || {};
            const mergedEntry = {
                ...clanInfo,
                members: Array.isArray(clanInfo.members) ? clanInfo.members : (Array.isArray(prevEntry.members) ? prevEntry.members : []),
                membersReplace: Array.isArray(clanInfo.membersReplace) ? clanInfo.membersReplace : (Array.isArray(prevEntry.membersReplace) ? prevEntry.membersReplace : [])
            };

            if (!mergedEntry.presentRotation && prevEntry.presentRotation) {
                mergedEntry.presentRotation = prevEntry.presentRotation;
            }
            if (!mergedEntry.recruitments && prevEntry.recruitments) {
                mergedEntry.recruitments = prevEntry.recruitments;
            }

            // Ensure rulesConfig exists on this clan
            const existingRules = mergedEntry.rulesConfig || prevEntry.rulesConfig;
            if (!existingRules) {
                mergedEntry.rulesConfig = {
                    name: clanInfo.nickName || rawTag,
                    nickName: clanInfo.nickName || "",
                    clanType: clanInfo.clanType || "fwa",
                    title: "{clanName} Rules",
                    image: "",
                    thumbnail: "",
                    footer: { text: "", iconURL: "" },
                    color: "#E74C3C",
                    rules: [...defaultRules]
                };
            } else {
                if (!Array.isArray(existingRules.rules) || existingRules.rules.length === 0) {
                    existingRules.rules = [...defaultRules];
                }
                mergedEntry.rulesConfig = existingRules;
            }

            nextRaw[rawTag] = mergedEntry;
        }

        writeRawClanRoleStore(nextRaw);

        // Auto-sync FWA clans' presentRotation and recruitments inside clanrole.json
        try {
            const clanRecruitments = require("./clanRecruitments");
            const fwaTags = Object.keys(nextRaw).filter(t => !t.startsWith("_") && (nextRaw[t].clanType || "fwa").toLowerCase() === "fwa");
            const recData = clanRecruitments.getRecruitmentData();
            clanRecruitments.syncFwaClans(recData, fwaTags);
            const activeTags = new Set(Object.keys(nextRaw).filter(t => !t.startsWith("_")).map(t => (t.startsWith("#") ? t : "#" + t).toUpperCase()));
            for (const existingTag of Object.keys(recData)) {
                if (existingTag.startsWith("_")) continue;
                if (!activeTags.has(existingTag)) {
                    delete recData[existingTag];
                }
            }
            clanRecruitments.saveRecruitmentData(recData);
        } catch (recSyncErr) {
            console.error("Error auto-syncing clan recruitments in saveClanRoles:", recSyncErr.message);
        }
    } catch (err) {
        console.error("Error writing clanrole.json:", err.message);
        throw err;
    }
}





/**
 * Save strike players data
 * @param {Object} data - Strike players data to save
 */
function saveStrikePlayers(data) {
    try {
        fs.writeFileSync(PATHS.strikeplayers, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing strikeplayers.json:", err.message);
        throw err;
    }
}

/**
 * Save ticket timers
 * @param {Object} data - Ticket timers data to save
 */
function saveTicketTimers(data) {
    try {
        fs.writeFileSync(PATHS.ticketTimers, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing ticketTimers.json:", err.message);
        throw err;
    }
}

/**
 * Save war type data
 * @param {Object} data - War type data to save
 */
function saveWarType(data) {
    try {
        fs.writeFileSync(PATHS.wartype, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing wartype.json:", err.message);
        throw err;
    }
}

/**
 * Get recruited townhalls
 * @returns {Array} Array of recruited THs
 */
function getRecruitingTHs() {
    try {
        if (!fs.existsSync(PATHS.recruitingths)) return ["th18", "th17", "th16", "th15", "th14", "th13"];
        const raw = fs.readFileSync(PATHS.recruitingths, "utf8");
        return raw ? JSON.parse(raw) : ["th18", "th17", "th16", "th15", "th14", "th13"];
    } catch (err) {
        return ["th18", "th17", "th16", "th15", "th14", "th13"];
    }
}

/**
 * Save recruited townhalls
 * @param {Array} data - Array of recruited THs
 */
function saveRecruitingTHs(data) {
    try {
        fs.writeFileSync(PATHS.recruitingths, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing recruitingths.json:", err.message);
        throw err;
    }
}


/**
 * Get scan war data (war history for /scan-clan)
 * @returns {Object} Scan war data object
 */
function getScanWar() {
    try {
        if (!fs.existsSync(PATHS.scanwar)) return {};
        const raw = fs.readFileSync(PATHS.scanwar, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading scanwar.json:", err.message);
        return {};
    }
}

/**
 * Save scan war data
 * @param {Object} data - Scan war data to save
 */
function saveScanWar(data) {
    try {
        fs.writeFileSync(PATHS.scanwar, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing scanwar.json:", err.message);
        throw err;
    }
}

/**
 * Get strike counters data
 * @returns {Object} Strike counters object
 */
function getStrikeCounters() {
    try {
        if (!fs.existsSync(PATHS.strikecounters)) return {};
        const raw = fs.readFileSync(PATHS.strikecounters, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading strikecounters.json:", err.message);
        return {};
    }
}

/**
 * Save strike counters data
 * @param {Object} data - Strike counters data to save
 */
function saveStrikeCounters(data) {
    try {
        fs.writeFileSync(PATHS.strikecounters, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing strikecounters.json:", err.message);
        throw err;
    }
}

/**
 * Get reapply reasons data from unified userdata.json (stored under each player tag)
 * @returns {Object} Reapply reasons object (keyed by userId)
 */
function getReapplyReasons() {
    const ud = getUserData();
    const result = {};
    for (const [userId, accounts] of Object.entries(ud)) {
        if (!Array.isArray(accounts)) continue;
        const userReasons = [];
        for (const acct of accounts) {
            if (!acct || !Array.isArray(acct.reapplyReasons) || acct.reapplyReasons.length === 0) continue;
            for (const r of acct.reapplyReasons) {
                userReasons.push({
                    ...r,
                    accountName: acct.name || "Unknown",
                    accountTag: acct.tag || ""
                });
            }
        }
        if (userReasons.length > 0) {
            result[userId] = userReasons;
        }
    }
    return result;
}

/**
 * Add a reapply reason directly under a player's tag in userdata.json
 * @param {string} userId - Discord user ID
 * @param {string} playerTag - CoC player tag
 * @param {Object} reasonEntry - { reason, timestamp, addedBy, clanName, status }
 * @returns {boolean} true if saved under a player tag
 */
function addReapplyReason(userId, playerTag, reasonEntry) {
    if (!userId || !reasonEntry) return false;
    const ud = getUserData();
    const accounts = ud[userId];
    if (!Array.isArray(accounts) || accounts.length === 0) return false;

    const clean = t => String(t || "").replace(/^#/, "").trim().toUpperCase();
    const targetClean = clean(playerTag);
    let targetAcct = targetClean ? accounts.find(a => clean(a.tag) === targetClean) : null;
    if (!targetAcct) targetAcct = accounts[0];

    if (!Array.isArray(targetAcct.reapplyReasons)) {
        targetAcct.reapplyReasons = [];
    }
    targetAcct.reapplyReasons.push({
        reason: reasonEntry.reason,
        timestamp: reasonEntry.timestamp || Math.floor(Date.now() / 1000),
        addedBy: reasonEntry.addedBy,
        clanName: reasonEntry.clanName,
        status: reasonEntry.status || "ADDED"
    });
    saveUserData(ud);
    return true;
}

/**
 * Save reapply reasons data back into unified userdata.json under each player tag
 * @param {Object} data - Reapply reasons data keyed by userId
 */
function saveReapplyReasons(data) {
    try {
        const ud = getUserData();
        const clean = t => String(t || "").replace(/^#/, "").trim().toUpperCase();

        for (const [userId, accounts] of Object.entries(ud)) {
            if (!Array.isArray(accounts) || accounts.length === 0) continue;
            const list = data && Array.isArray(data[userId]) ? data[userId] : null;
            if (!list) continue;

            for (const acct of accounts) {
                acct.reapplyReasons = [];
            }

            for (const item of list) {
                const targetClean = clean(item.accountTag);
                let targetAcct = targetClean ? accounts.find(a => clean(a.tag) === targetClean) : null;
                if (!targetAcct) targetAcct = accounts[0];
                targetAcct.reapplyReasons.push({
                    reason: item.reason,
                    timestamp: item.timestamp,
                    addedBy: item.addedBy,
                    clanName: item.clanName,
                    status: item.status || "ADDED"
                });
            }

            for (const acct of accounts) {
                if (acct.reapplyReasons.length === 0) {
                    delete acct.reapplyReasons;
                }
            }
        }

        saveUserData(ud);
    } catch (err) {
        console.error("Error writing reapply reasons to userdata.json:", err.message);
        throw err;
    }
}

let emojiFallback = null;
try {
    emojiFallback = require("./emoji.js");
} catch (_) {}

/**
 * Default War Mail Rules for FWA / Blacklist / Mismatch
 */
const DEFAULT_MAIL_RULES = {
    win: {
        header: "🟩 **This war has been declared a win as per FWA rules.**",
        title: "⚔️ **WIN WAR INSTRUCTIONS** ⚔️",
        instructions: [
            "1st Attack - ⭐⭐⭐(3 Stars) on your mirror (Compulsory)",
            "2nd attack - ⭐(1 Star) on any base.",
            "Last 8 hours - go for ⭐⭐⭐(3 Stars) (clean ups)"
        ],
        important: [
            "Use both attacks",
            "Don’t rush attacks",
            "Ask if you need help"
        ],
        text: "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟩 **This war has been declared a win as per FWA rules.**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚔️ **WIN WAR INSTRUCTIONS** ⚔️\n\n{rarrow} 1st Attack - ⭐⭐⭐(3 Stars) on your mirror (Compulsory)\n{rarrow} 2nd attack - ⭐(1 Star) on any base.\n{rarrow} Last 8 hours - go for ⭐⭐⭐(3 Stars) (clean ups)\n\n📌 **Important**\n\n{rarrow} Use both attacks\n{rarrow} Don’t rush attacks\n{rarrow} Ask if you need help"
    },
    lose: {
        header: "🟥 **This war has been declared a loss as per FWA rules.**",
        title: "⚔️ **LOSE WAR INSTRUCTIONS** ⚔️",
        instructions: [
            "1st Attack - ⭐⭐(2 Stars) on your mirror (Compulsory)",
            "2nd attack - ⭐(1 Star) on any base.",
            "Last 8 hours - go for ⭐⭐(2 Stars) (clean ups)"
        ],
        important: [
            "Use both attacks",
            "No extra attacks without permission",
            "Don’t rush attacks",
            "Ask if you need help"
        ],
        text: "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟥 **This war has been declared a loss as per FWA rules.**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n⚔️ **LOSE WAR INSTRUCTIONS** ⚔️\n\n{rarrow} 1st Attack - ⭐⭐(2 Stars) on your mirror (Compulsory)\n{rarrow} 2nd attack - ⭐(1 Star) on any base.\n{rarrow} Last 8 hours - go for ⭐⭐(2 Stars) (clean ups)\n\n📌 **Important**\n\n{rarrow} Use both attacks\n{rarrow} No extra attacks without permission\n{rarrow} Don’t rush attacks\n{rarrow} Ask if you need help"
    },
    bl: {
        header: "🛡️ This is a blacklisted war — we're not backing down!",
        title: "{cocfight} **Instructions:**",
        instructions: [
            "Change your war base to a real war base — no FWA layouts!",
            "Attack freely and aim for ⭐️⭐️⭐️ 3 stars on both hits.",
            "Coordinate with your team for cleanup and efficient hits."
        ],
        goals: [
            "30 war bases changed",
            "60% destruction",
            "Win the war 💪"
        ],
        notes: [
            "Need a base? Visit: clashofclans-layouts.com",
            "After war ends: Switch your base back to FWA format immediately!"
        ],
        text: "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🛡️ This is a blacklisted war — we're not backing down!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n{cocfight} **Instructions:**\n\n🔸 Change your war base to a real war base — no FWA layouts!\n🔸 Attack freely and aim for ⭐️⭐️⭐️ 3 stars on both hits.\n🔸 Coordinate with your team for cleanup and efficient hits.\n\n📌 **War Goals:**\n30 war bases changed\n60% destruction\nWin the war 💪\n\n📚 **Need a base? Visit:** clashofclans-layouts.com\n\n🔁 **After war ends:**\nSwitch your base back to FWA format immediately!"
    },
    mis: {
        header: "⚠️ **This is a mismatch war against a non-FWA clan!**",
        title: "{cocfight} **Instructions:**",
        instructions: [
            "Change your war base to a real war base — no FWA layouts!",
            "Attack freely and aim for ⭐️⭐️⭐️ 3 stars on both hits.",
            "Coordinate with your team for cleanup and efficient hits."
        ],
        important: [
            "Use both attacks",
            "Don’t rush attacks",
            "Switch your base back to FWA format after war ends!"
        ],
        text: "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ **This is a mismatch war against a non-FWA clan!**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n{cocfight} **Instructions:**\n\n🔸 Change your war base to a real war base — no FWA layouts!\n🔸 Attack freely and aim for ⭐️⭐️⭐️ 3 stars on both hits.\n🔸 Coordinate with your team for cleanup and efficient hits.\n\n📌 **Important:**\n\n🔸 Use both attacks\n🔸 Don’t rush attacks\n🔸 Switch your base back to FWA format after war ends!"
    }
};

/**
 * Get clan rules configuration
 * @returns {Object|null} Clan rules object or null
 */
const DEFAULT_RULES_CONFIG = {
    default: {
        title: "{clanName} Rules",
        image: "",
        thumbnail: "",
        footer: {
            text: "",
            iconURL: ""
        },
        color: "#E74C3C",
        rules: [
            "Be active daily and participate in wars and CWL.",
            "Always use both war attacks — missing attacks may lead to demotion.",
            "Donate correct troops only as requested.",
            "Respect all members — teamwork builds victory.",
            "No rushed bases allowed in main clan — use feeder clans if needed.",
            "Maintain a healthy competitive spirit, no toxicity."
        ],
        warrules: DEFAULT_MAIL_RULES
    },
    clans: {}
};

function getClanRules() {
    const raw = readRawClanRoleStore();
    const defaultConf = raw._defaultRules
        ? JSON.parse(JSON.stringify(raw._defaultRules))
        : JSON.parse(JSON.stringify(DEFAULT_RULES_CONFIG.default));

    if (!defaultConf.warrules && !defaultConf.mailrules) {
        defaultConf.warrules = { ...DEFAULT_MAIL_RULES };
    }

    const clans = {};
    for (const [tag, clanInfo] of Object.entries(raw)) {
        if (tag.startsWith("_") || !clanInfo || typeof clanInfo !== "object") continue;
        if (clanInfo.rulesConfig) {
            clans[tag] = clanInfo.rulesConfig;
        }
    }

    return {
        default: defaultConf,
        clans
    };
}

/**
 * Save clan rules configuration into unified data/clanrole.json
 * @param {Object} data - Clan rules object { default, clans }
 */
function saveClanRules(data) {
    try {
        const raw = readRawClanRoleStore();
        if (data && data.default) {
            raw._defaultRules = data.default;
        }
        const clansMap = (data && data.clans) ? data.clans : {};

        // Update rulesConfig on existing clans, and clear if removed
        for (const tag of Object.keys(raw)) {
            if (tag.startsWith("_") || !raw[tag] || typeof raw[tag] !== "object") continue;
            if (clansMap[tag]) {
                raw[tag].rulesConfig = clansMap[tag];
            } else {
                delete raw[tag].rulesConfig;
            }
        }

        writeRawClanRoleStore(raw);
    } catch (err) {
        console.error("Error writing rules to data/clanrole.json:", err.message);
        throw err;
    }
}

/**
 * Add or update a clan entry in clanrules.json
 * @param {string} clanTag - Clan tag
 * @param {Object} data - Clan details { name, nickName, clanType, rules, ... }
 */
function addClanRuleEntry(clanTag, data = {}) {
    try {
        const rulesConfig = getClanRules() || { default: {}, clans: {} };
        if (!rulesConfig.clans) rulesConfig.clans = {};

        const tag = (clanTag.startsWith('#') ? clanTag : '#' + clanTag).toUpperCase();
        const defaultRules = (rulesConfig.default && Array.isArray(rulesConfig.default.rules) && rulesConfig.default.rules.length > 0)
            ? rulesConfig.default.rules
            : [
                "Be active daily and participate in wars and CWL.",
                "Always use both war attacks — missing attacks may lead to demotion.",
                "Donate correct troops only as requested.",
                "Respect all members — teamwork builds victory.",
                "No rushed bases allowed in main clan — use feeder clans if needed.",
                "Maintain a healthy competitive spirit, no toxicity."
            ];

        const existing = rulesConfig.clans[tag] || {};

        rulesConfig.clans[tag] = {
            name: data.name || existing.name || data.nickName || tag,
            nickName: data.nickName || existing.nickName || "",
            clanType: data.clanType || existing.clanType || "fwa",
            title: existing.title || "{clanName} Rules",
            image: existing.image || "",
            thumbnail: existing.thumbnail || "",
            footer: existing.footer || { text: "", iconURL: "" },
            color: existing.color || "#E74C3C",
            rules: (Array.isArray(existing.rules) && existing.rules.length > 0)
                ? existing.rules
                : (Array.isArray(data.rules) && data.rules.length > 0 ? data.rules : [...defaultRules]),
            warrules: existing.warrules || data.warrules || rulesConfig.default?.warrules || DEFAULT_MAIL_RULES
        };

        saveClanRules(rulesConfig);
        return rulesConfig.clans[tag];
    } catch (err) {
        console.error(`Error adding clan rule entry for ${clanTag}:`, err.message);
        return null;
    }
}

/**
 * Remove a clan entry from clanrules.json
 * @param {string} clanTag - Clan tag
 */
function removeClanRuleEntry(clanTag) {
    try {
        const rulesConfig = getClanRules();
        if (!rulesConfig || !rulesConfig.clans) return false;

        const tagWithHash = (clanTag.startsWith('#') ? clanTag : '#' + clanTag).toUpperCase();
        const tagNoHash = tagWithHash.replace('#', '');

        let removed = false;
        if (rulesConfig.clans[tagWithHash]) {
            delete rulesConfig.clans[tagWithHash];
            removed = true;
        }
        if (rulesConfig.clans[tagNoHash]) {
            delete rulesConfig.clans[tagNoHash];
            removed = true;
        }

        if (removed) {
            saveClanRules(rulesConfig);
        }
        return removed;
    } catch (err) {
        console.error(`Error removing clan rule entry for ${clanTag}:`, err.message);
        return false;
    }
}

/**
 * Build formatted mail rule text from structured rule object
 * @param {Object} ruleObj - Rule object with header, title, instructions, etc.
 * @returns {string} Formatted text with placeholders {rarrow}, {cocfight}
 */
function buildMailRuleText(ruleObj) {
    if (!ruleObj) return "";
    let parts = [];
    if (ruleObj.header) {
        parts.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${ruleObj.header}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    }
    if (ruleObj.title) {
        parts.push(ruleObj.title);
    }
    const isWinOrLose = (ruleObj.title && (ruleObj.title.includes("WIN") || ruleObj.title.includes("LOSE"))) || (ruleObj.header && (ruleObj.header.toLowerCase().includes("win") || ruleObj.header.toLowerCase().includes("loss")));
    const defaultBullet = isWinOrLose ? "{rarrow}" : "🔸";
    const bullet = ruleObj.bullet || defaultBullet;

    if (Array.isArray(ruleObj.instructions) && ruleObj.instructions.length > 0) {
        parts.push(ruleObj.instructions.map(item => `${bullet} ${item}`).join("\n"));
    }
    if (Array.isArray(ruleObj.goals) && ruleObj.goals.length > 0) {
        parts.push(`📌 **War Goals:**\n` + ruleObj.goals.join("\n"));
    }
    if (Array.isArray(ruleObj.important) && ruleObj.important.length > 0) {
        const impBullet = isWinOrLose ? "{rarrow}" : "🔸";
        parts.push(`📌 **Important**\n\n` + ruleObj.important.map(item => `${impBullet} ${item}`).join("\n"));
    }
    if (Array.isArray(ruleObj.notes) && ruleObj.notes.length > 0) {
        parts.push(ruleObj.notes.join("\n\n"));
    }
    return parts.join("\n\n");
}

/**
 * Replace emoji placeholders ({rarrow}, {cocfight}) with actual Discord emoji strings
 * @param {string} text - Raw template text
 * @param {Object} emojiUtils - Discord client emoji utility
 * @returns {string} Text with emojis resolved
 */
function replaceEmojiPlaceholders(text, emojiUtils) {
    if (!text || typeof text !== "string") return "";
    const getE = (name) => {
        if (emojiUtils && typeof emojiUtils.getEmoji === "function") {
            const e = emojiUtils.getEmoji(name);
            if (e) return e;
        }
        if (emojiFallback && typeof emojiFallback.getEmoji === "function") {
            const e = emojiFallback.getEmoji(name);
            if (e) return e;
        }
        return null;
    };

    const rarrow = getE("rarrow") || "▶";
    const cocfight = getE("cocfight") || "⚔️";

    return text
        .replace(/\{rarrow\}/g, rarrow)
        .replace(/\{cocfight\}/g, cocfight);
}

/**
 * Get all mail/war rules merged with defaults
 * Checks default.warrules, default.mailrules, or root mailrules
 * @returns {Object} { win, lose, bl, mis }
 */
function getMailRules() {
    const config = getClanRules();
    const source = config?.default?.warrules 
        || config?.default?.mailrules 
        || config?.warrules 
        || config?.mailrules 
        || {};
    return {
        win: (source.win && Object.keys(source.win).length > 0) ? source.win : DEFAULT_MAIL_RULES.win,
        lose: (source.lose && Object.keys(source.lose).length > 0) ? source.lose : DEFAULT_MAIL_RULES.lose,
        bl: (source.bl && Object.keys(source.bl).length > 0) ? source.bl : DEFAULT_MAIL_RULES.bl,
        mis: (source.mis && Object.keys(source.mis).length > 0) ? source.mis : DEFAULT_MAIL_RULES.mis
    };
}

/**
 * Get mail/war rule for a specific type (win, lose, bl, mis), optionally checking clan overrides
 * @param {string} type - "win" | "lose" | "bl" | "mis"
 * @param {string|null} clanTag - Optional clan tag for clan-level override
 * @returns {Object} Rule object
 */
function getMailRule(type, clanTag = null) {
    const t = (type || "").toLowerCase().trim();
    let key = "win";
    if (t === "win" || t === "w") key = "win";
    else if (t === "lose" || t === "loss" || t === "l") key = "lose";
    else if (t === "bl" || t.includes("black")) key = "bl";
    else if (t === "mis" || t.includes("mis")) key = "mis";
    else if (DEFAULT_MAIL_RULES[t]) key = t;

    const defaultRule = DEFAULT_MAIL_RULES[key] || DEFAULT_MAIL_RULES.win;
    const rulesConfig = getClanRules();

    if (clanTag) {
        const tag = (clanTag.startsWith('#') ? clanTag : '#' + clanTag).toUpperCase();
        const tagNoHash = tag.replace('#', '');
        const clanEntry = rulesConfig?.clans?.[tag] || rulesConfig?.clans?.[tagNoHash];
        const clanRules = clanEntry?.warrules || clanEntry?.mailrules;
        if (clanRules?.[key] && Object.keys(clanRules[key]).length > 0) {
            return { ...defaultRule, ...clanRules[key] };
        }
    }

    const defaultRules = rulesConfig?.default?.warrules 
        || rulesConfig?.default?.mailrules 
        || rulesConfig?.warrules 
        || rulesConfig?.mailrules;
    const savedRule = defaultRules?.[key];
    if (savedRule && Object.keys(savedRule).length > 0) {
        return { ...defaultRule, ...savedRule };
    }

    return { ...defaultRule };
}

/**
 * Format mail rule text into Discord-ready string
 * @param {Object|string} rule - Rule object or raw text string
 * @param {Object} emojiUtils - Emoji utility
 * @returns {string} Formatted war rule string
 */
function formatMailRuleText(rule, emojiUtils) {
    if (!rule) return "";
    let rawText = "";
    if (typeof rule === "string") {
        rawText = rule;
    } else if (typeof rule === "object") {
        rawText = (rule.text && typeof rule.text === "string" && rule.text.trim()) 
            ? rule.text 
            : buildMailRuleText(rule);
    }
    return replaceEmojiPlaceholders(rawText, emojiUtils);
}

/**
 * Main helper to format war mail rules for send-fwamails.js and test scripts
 * @param {string} matchType - e.g. "FWA Match", "Blacklisted Match", "Mismatch"
 * @param {boolean} isWin - true if win, false if loss
 * @param {Object} emojiUtils - emoji utility
 * @param {string|null} clanTag - optional clan tag
 * @returns {string} Formatted rules text for Discord embed
 */
function formatMailRules(matchType, isWin, emojiUtils, clanTag = null) {
    let ruleType = "win";
    const m = (matchType || "").toLowerCase();
    if (m.includes("black") || m === "bl") {
        ruleType = "bl";
    } else if (m.includes("mis")) {
        ruleType = "mis";
    } else if (m.includes("fwa") || m.includes("match")) {
        ruleType = isWin ? "win" : "lose";
    } else {
        ruleType = isWin ? "win" : "lose";
    }

    const rule = getMailRule(ruleType, clanTag);
    return formatMailRuleText(rule, emojiUtils);
}

/**
 * Save updated war rules in clanrules.json under default.warrules
 * @param {Object} mailRules - { win?, lose?, bl?, mis? }
 * @returns {Object} Updated war rules
 */
function saveMailRules(mailRules) {
    const rulesConfig = getClanRules();
    if (!rulesConfig.default) rulesConfig.default = {};
    if (!rulesConfig.default.warrules) {
        rulesConfig.default.warrules = rulesConfig.default.mailrules || {};
    }
    rulesConfig.default.warrules = {
        ...rulesConfig.default.warrules,
        ...mailRules
    };
    saveClanRules(rulesConfig);
    return rulesConfig.default.warrules;
}

/**
 * Update a single war rule (win, lose, bl, mis) in clanrules.json under default.warrules
 * @param {string} type - "win" | "lose" | "bl" | "mis"
 * @param {Object|string} ruleData - Updated rule data
 * @returns {Object} Updated rule
 */
function updateMailRule(type, ruleData) {
    const t = (type || "").toLowerCase().trim();
    let key = "win";
    if (t === "win" || t === "w") key = "win";
    else if (t === "lose" || t === "loss" || t === "l") key = "lose";
    else if (t === "bl" || t.includes("black")) key = "bl";
    else if (t === "mis" || t.includes("mis")) key = "mis";
    else key = t;

    const rulesConfig = getClanRules();
    if (!rulesConfig.default) rulesConfig.default = {};
    if (!rulesConfig.default.warrules) {
        rulesConfig.default.warrules = rulesConfig.default.mailrules || {};
    }

    const current = rulesConfig.default.warrules[key] || DEFAULT_MAIL_RULES[key] || {};
    let updated;
    if (typeof ruleData === "string") {
        updated = { ...current, text: ruleData };
    } else if (typeof ruleData === "object" && ruleData !== null) {
        updated = { ...current, ...ruleData };
        if (ruleData.text === undefined && (ruleData.instructions || ruleData.header || ruleData.title || ruleData.important || ruleData.goals || ruleData.notes)) {
            updated.text = buildMailRuleText(updated);
        }
    } else {
        updated = { ...current };
    }

    rulesConfig.default.warrules[key] = updated;
    saveClanRules(rulesConfig);
    return updated;
}

/**
 * Helper to find clan entry by tag or nickname
 * @param {Object} config - Clan rules config
 * @param {string} clanTag - Clan tag or nickname
 * @returns {{ clan: Object, tag: string }|null}
 */
function findClanEntry(config, clanTag) {
    if (!config || !config.clans || !clanTag) return null;
    const rawTag = clanTag.trim().toUpperCase();
    const tagWithHash = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
    const tagNoHash = tagWithHash.replace('#', '');

    if (config.clans[tagWithHash]) return { clan: config.clans[tagWithHash], tag: tagWithHash };
    if (config.clans[tagNoHash]) return { clan: config.clans[tagNoHash], tag: tagNoHash };

    for (const [t, info] of Object.entries(config.clans)) {
        if (info.nickName && info.nickName.toUpperCase() === rawTag) {
            return { clan: info, tag: t };
        }
    }
    return null;
}

/**
 * Get war rules for a specific clan
 * @param {string} clanTag - Clan tag or nickname
 * @returns {Object|null} { win, lose, bl, mis }
 */
function getClanWarRules(clanTag) {
    const config = getClanRules();
    const found = findClanEntry(config, clanTag);
    if (!found) return null;

    const defaultWarRules = config.default?.warrules || DEFAULT_MAIL_RULES;
    const clanWarRules = found.clan.warrules || found.clan.mailrules || {};

    return {
        win: (clanWarRules.win && Object.keys(clanWarRules.win).length > 0) ? clanWarRules.win : defaultWarRules.win,
        lose: (clanWarRules.lose && Object.keys(clanWarRules.lose).length > 0) ? clanWarRules.lose : defaultWarRules.lose,
        bl: (clanWarRules.bl && Object.keys(clanWarRules.bl).length > 0) ? clanWarRules.bl : defaultWarRules.bl,
        mis: (clanWarRules.mis && Object.keys(clanWarRules.mis).length > 0) ? clanWarRules.mis : defaultWarRules.mis
    };
}

/**
 * Save war rules for a specific clan
 * @param {string} clanTag - Clan tag or nickname
 * @param {Object} warRules - { win?, lose?, bl?, mis? }
 * @returns {Object|null} Updated clan war rules
 */
function saveClanWarRules(clanTag, warRules) {
    const config = getClanRules();
    const found = findClanEntry(config, clanTag);
    if (!found) return null;

    if (!found.clan.warrules) {
        found.clan.warrules = JSON.parse(JSON.stringify(config.default?.warrules || DEFAULT_MAIL_RULES));
    }

    found.clan.warrules = {
        ...found.clan.warrules,
        ...warRules
    };

    saveClanRules(config);
    return found.clan.warrules;
}

/**
 * Update a single war rule for a specific clan
 * @param {string} clanTag - Clan tag or nickname
 * @param {string} type - "win" | "lose" | "bl" | "mis"
 * @param {Object|string} ruleData - Updated rule
 * @returns {Object|null} Updated rule
 */
function updateClanWarRule(clanTag, type, ruleData) {
    const config = getClanRules();
    const found = findClanEntry(config, clanTag);
    if (!found) return null;

    const t = (type || "").toLowerCase().trim();
    let key = "win";
    if (t === "win" || t === "w") key = "win";
    else if (t === "lose" || t === "loss" || t === "l") key = "lose";
    else if (t === "bl" || t.includes("black")) key = "bl";
    else if (t === "mis" || t.includes("mis")) key = "mis";
    else key = t;

    if (!found.clan.warrules) {
        found.clan.warrules = JSON.parse(JSON.stringify(config.default?.warrules || DEFAULT_MAIL_RULES));
    }

    const current = found.clan.warrules[key] || DEFAULT_MAIL_RULES[key] || {};
    let updated;
    if (typeof ruleData === "string") {
        updated = { ...current, text: ruleData };
    } else if (typeof ruleData === "object" && ruleData !== null) {
        updated = { ...current, ...ruleData };
        if (ruleData.text === undefined && (ruleData.instructions || ruleData.header || ruleData.title || ruleData.important || ruleData.goals || ruleData.notes)) {
            updated.text = buildMailRuleText(updated);
        }
    } else {
        updated = { ...current };
    }

    found.clan.warrules[key] = updated;
    saveClanRules(config);
    return updated;
}

/**
 * Get clan members data (custom member roster for clans) from unified clanrole.json
 * @returns {Object} Clan members data object keyed by clan tag
 */
function getClanMembers() {
    const raw = readRawClanRoleStore();
    const result = {};
    for (const [tag, clanInfo] of Object.entries(raw)) {
        if (tag.startsWith("_") || !clanInfo || typeof clanInfo !== "object") continue;
        if (Array.isArray(clanInfo.members)) {
            result[tag] = clanInfo.members;
        }
    }
    return result;
}

/**
 * Save clan members data into unified clanrole.json
 * @param {Object} data - Clan members data object keyed by clan tag
 */
function saveClanMembers(data) {
    try {
        const raw = readRawClanRoleStore();
        for (const [tag, members] of Object.entries(data || {})) {
            if (tag.startsWith("_")) continue;
            if (raw[tag] && typeof raw[tag] === "object") {
                raw[tag].members = Array.isArray(members) ? members : [];
            }
        }
        writeRawClanRoleStore(raw);
    } catch (err) {
        console.error("Error writing clan members to clanrole.json:", err.message);
        throw err;
    }
}

/**
 * Get members replacement list from unified clanrole.json
 * @returns {Object} Members replace object keyed by clan tag
 */
function getMembersReplace() {
    const raw = readRawClanRoleStore();
    const result = {};
    for (const [tag, clanInfo] of Object.entries(raw)) {
        if (tag.startsWith("_") || !clanInfo || typeof clanInfo !== "object") continue;
        if (Array.isArray(clanInfo.membersReplace)) {
            result[tag] = clanInfo.membersReplace;
        }
    }
    return result;
}

/**
 * Save members replacement list into unified clanrole.json
 * @param {Object} data - Members replace object keyed by clan tag
 */
function saveMembersReplace(data) {
    try {
        const raw = readRawClanRoleStore();
        for (const [tag, replaceList] of Object.entries(data || {})) {
            if (tag.startsWith("_")) continue;
            if (raw[tag] && typeof raw[tag] === "object") {
                raw[tag].membersReplace = Array.isArray(replaceList) ? replaceList : [];
            }
        }
        writeRawClanRoleStore(raw);
    } catch (err) {
        console.error("Error writing membersReplace to clanrole.json:", err.message);
        throw err;
    }
}

/**
 * Add or update a member in clan-members.json for a clan.
 * Automatically cleans up their old entry if they were listed under another clan.
 * @param {string} clanTag - Clan tag with or without #
 * @param {Object} player - Player object with tag, name, thLevel/townHallLevel, role
 * @returns {boolean} true if added/updated successfully
 */
function addClanMember(clanTag, player) {
    if (!clanTag || !player || !player.tag) return false;
    const cleanTag = t => (t || "").toUpperCase().replace(/^#/, "").trim();
    const formattedClanTag = clanTag.startsWith("#") ? clanTag.toUpperCase().trim() : "#" + clanTag.toUpperCase().trim();
    const formattedPlayerTag = player.tag.startsWith("#") ? player.tag.toUpperCase().trim() : "#" + player.tag.toUpperCase().trim();

    const data = getClanMembers();

    // Remove player from any other clan if they switched clans
    for (const [tag, members] of Object.entries(data)) {
        if (cleanTag(tag) !== cleanTag(formattedClanTag) && Array.isArray(members)) {
            data[tag] = members.filter(m => cleanTag(m.tag) !== cleanTag(formattedPlayerTag));
        }
    }

    if (!Array.isArray(data[formattedClanTag])) {
        data[formattedClanTag] = [];
    }

    const existingIndex = data[formattedClanTag].findIndex(m => cleanTag(m.tag) === cleanTag(formattedPlayerTag));
    const memberEntry = {
        tag: formattedPlayerTag,
        name: player.name || "Unknown",
        thLevel: Number(player.thLevel || player.townHallLevel) || 0,
        role: player.role || "member"
    };

    if (existingIndex >= 0) {
        data[formattedClanTag][existingIndex] = memberEntry;
    } else {
        data[formattedClanTag].push(memberEntry);
    }

    saveClanMembers(data);
    return true;
}

/**
 * Remove a member by player tag from a specific clan (or from all clans if clanTag is omitted/null)
 * @param {string|null} clanTag - Clan tag to remove from, or null to remove from all clans
 * @param {string} playerTag - Player tag with or without #
 * @returns {boolean} true if any entry was removed
 */
function removeClanMember(clanTag, playerTag) {
    if (!playerTag) return false;
    const cleanTag = t => (t || "").toUpperCase().replace(/^#/, "").trim();
    const targetPlayerTag = cleanTag(playerTag);
    const targetClanTag = clanTag ? cleanTag(clanTag) : null;

    const data = getClanMembers();
    let removedAny = false;

    for (const [tag, members] of Object.entries(data)) {
        if (!targetClanTag || cleanTag(tag) === targetClanTag) {
            if (Array.isArray(members)) {
                const beforeLen = members.length;
                data[tag] = members.filter(m => cleanTag(m.tag) !== targetPlayerTag);
                if (data[tag].length !== beforeLen) {
                    removedAny = true;
                }
            }
        }
    }

    if (removedAny) {
        saveClanMembers(data);
    }
    return removedAny;
}



/**
 * Get clan recruitments data
 * @returns {Object} Clan recruitments object
 */
function getClanRecruitments() {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.getRecruitmentData();
    } catch (err) {
        console.error("Error reading clan-recruitments.json:", err.message);
        return {};
    }
}

/**
 * Save clan recruitments data
 * @param {Object} data - Recruitment data to save
 */
function saveClanRecruitments(data) {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.saveRecruitmentData(data);
    } catch (err) {
        console.error("Error writing clan-recruitments.json:", err.message);
        throw err;
    }
}

/**
 * Remove clan from clan-recruitments.json
 * @param {string} clanTag - Clan tag
 */
function removeClanRecruitmentEntry(clanTag) {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.removeClanFromRecruitments(clanTag);
    } catch (err) {
        console.error("Error removing clan from recruitments:", err.message);
        return false;
    }
}


/**
 * Get tracked Town Hall levels for rotations
 */
function getTrackedRotationTHs() {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.getTrackedRotationTHs();
    } catch (err) {
        console.error("Error getting tracked rotation THs:", err.message);
        return ["TH19", "TH18"];
    }
}

/**
 * Add a Town Hall level to rotation tracking
 */
function addTrackedRotationTH(th) {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.addTrackedRotationTH(th);
    } catch (err) {
        console.error("Error adding tracked rotation TH:", err.message);
        throw err;
    }
}

/**
 * Remove a Town Hall level from rotation tracking
 */
function removeTrackedRotationTH(th) {
    try {
        const clanRecruitments = require("./clanRecruitments");
        return clanRecruitments.removeTrackedRotationTH(th);
    } catch (err) {
        console.error("Error removing tracked rotation TH:", err.message);
        throw err;
    }
}

module.exports = {
    getUserData,
    initUserDataFromMongo,
    flushUserDataToMongo,
    initClanDetailsFromMongo,
    flushClanDetailsToMongo,
    readRawClanRoleStore,
    writeRawClanRoleStore,
    getClanRoles,
    getStrikePlayers,
    getTicketTimers,
    getWarType,
    getRecruitingTHs,
    getScanWar,
    getStrikeCounters,
    getReapplyReasons,
    addReapplyReason,
    getClanRules,
    getClanMembers,
    saveClanMembers,
    getMembersReplace,
    saveMembersReplace,
    addClanMember,
    removeClanMember,
    getClanRecruitments,
    saveClanRecruitments,
    removeClanRecruitmentEntry,
    getTrackedRotationTHs,
    addTrackedRotationTH,
    removeTrackedRotationTH,
    getMailRules,
    getMailRule,
    formatMailRuleText,
    formatMailRules,
    DEFAULT_MAIL_RULES,

    getWarRules: getMailRules,
    getWarRule: getMailRule,
    saveWarRules: saveMailRules,
    updateWarRule: updateMailRule,
    formatWarRules: formatMailRules,
    DEFAULT_WAR_RULES: DEFAULT_MAIL_RULES,

    getClanWarRules,
    getClanWarRule: (clanTag, type) => getMailRule(type, clanTag),
    saveClanWarRules,
    updateClanWarRule,
    getClanMailRules: getClanWarRules,
    saveClanMailRules: saveClanWarRules,
    updateClanMailRule: updateClanWarRule,

    saveUserData,
    saveClanRoles,
    saveStrikePlayers,
    saveTicketTimers,
    saveWarType,
    saveRecruitingTHs,
    saveScanWar,
    saveStrikeCounters,
    saveReapplyReasons,
    saveClanRules,
    saveMailRules,
    updateMailRule,
    addClanRuleEntry,
    removeClanRuleEntry,

    PATHS
};
