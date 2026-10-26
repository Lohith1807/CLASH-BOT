/**
 * Centralized Data Manager for JSON file operations
 * Eliminates redundant read/write code across command files
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");

const PATHS = {
    userdata: path.join(DATA_DIR, "userdata.json"),
    clanrole: path.join(DATA_DIR, "clanrole.json"),
    clandata: path.join(DATA_DIR, "clandata.json"),
    clans: path.join(DATA_DIR, "clans.json"),
    strikeplayers: path.join(DATA_DIR, "strikeplayers.json"),
    helpData: path.join(DATA_DIR, "helpData.json"),
    ticketTimers: path.join(DATA_DIR, "ticketTimers.json"),
    wartype: path.join(DATA_DIR, "wartype.json"),
    recruitingths: path.join(DATA_DIR, "recruitingths.json"),
    scanwar: path.join(DATA_DIR, "scanwar.json"),
    strikecounters: path.join(DATA_DIR, "strikecounters.json"),
    recruitments: path.join(DATA_DIR, "recruitments.json"),
    reapplyreasons: path.join(DATA_DIR, "reapplyreasons.json"),
    ticketData: path.join(DATA_DIR, "ticketData.json"),
    clanrules: path.join(DATA_DIR, "clanrules.json")
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

/**
 * Get user data (linked Discord users to CoC accounts)
 * @returns {Object} User data object
 */
function getUserData() {
    try {
        if (!fs.existsSync(PATHS.userdata)) return {};
        const raw = fs.readFileSync(PATHS.userdata, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading userdata.json:", err.message);
        return {};
    }
}

/**
 * Get clan roles (clan tag to Discord role mappings)
 * @returns {Object} Clan roles object
 */
function getClanRoles() {
    try {
        if (!fs.existsSync(PATHS.clanrole)) return {};
        const raw = fs.readFileSync(PATHS.clanrole, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading clanrole.json:", err.message);
        return {};
    }
}





/**
 * Get clans data
 * @returns {Object} Clans data object
 */
function getClans() {
    try {
        if (!fs.existsSync(PATHS.clans)) return {};
        const raw = fs.readFileSync(PATHS.clans, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading clans.json:", err.message);
        return {};
    }
}

/**
 * Get help data for the /help command
 * @returns {Object} Help data object
 */
function getHelpData() {
    try {
        if (!fs.existsSync(PATHS.helpData)) return {};
        const raw = fs.readFileSync(PATHS.helpData, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading helpData.json:", err.message);
        return {};
    }
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
 * Save user data
 * @param {Object} data - User data to save
 */
function saveUserData(data) {
    try {
        fs.writeFileSync(PATHS.userdata, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing userdata.json:", err.message);
        throw err;
    }
}

/**
 * Save clan roles
 * @param {Object} data - Clan roles to save
 */
function saveClanRoles(data) {
    try {
        fs.writeFileSync(PATHS.clanrole, JSON.stringify(data, null, 2));

        // Automatically ensure all clans exist in clanrules.json with basic rules
        try {
            const rulesConfig = getClanRules();
            if (rulesConfig && rulesConfig.clans) {
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

                let changed = false;
                const activeTags = new Set(Object.keys(data).map(t => (t.startsWith('#') ? t : '#' + t).toUpperCase()));

                for (const [rawTag, clanInfo] of Object.entries(data)) {
                    const tag = (rawTag.startsWith('#') ? rawTag : '#' + rawTag).toUpperCase();
                    if (!rulesConfig.clans[tag]) {
                        rulesConfig.clans[tag] = {
                            name: clanInfo.nickName || tag,
                            nickName: clanInfo.nickName || "",
                            clanType: clanInfo.clanType || "fwa",
                            title: "{clanName} Rules",
                            image: "",
                            thumbnail: "",
                            footer: { text: "", iconURL: "" },
                            color: "#E74C3C",
                            rules: [...defaultRules]
                        };
                        changed = true;
                    } else {
                        // Ensure basic rules are added if rules array is missing or empty
                        if (!Array.isArray(rulesConfig.clans[tag].rules) || rulesConfig.clans[tag].rules.length === 0) {
                            rulesConfig.clans[tag].rules = [...defaultRules];
                            changed = true;
                        }
                    }
                }

                // If any clan was removed from clanrole.json, clean it up from clanrules.json
                for (const existingTag of Object.keys(rulesConfig.clans)) {
                    if (!activeTags.has(existingTag)) {
                        delete rulesConfig.clans[existingTag];
                        changed = true;
                    }
                }

                if (changed) {
                    saveClanRules(rulesConfig);
                }
            }
        } catch (syncErr) {
            console.error("Error auto-syncing clan rules in saveClanRoles:", syncErr.message);
        }
    } catch (err) {
        console.error("Error writing clanrole.json:", err.message);
        throw err;
    }
}





/**
 * Save clans data
 * @param {Object} data - Clans data to save
 */
function saveClans(data) {
    try {
        fs.writeFileSync(PATHS.clans, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing clans.json:", err.message);
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
 * Save help data
 * @param {Object} data - Help data to save
 */
function saveHelpData(data) {
    try {
        fs.writeFileSync(PATHS.helpData, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing helpData.json:", err.message);
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
 * Get recruitments data
 * @returns {Object} Recruitments data object
 */
function getRecruitments() {
    try {
        if (!fs.existsSync(PATHS.recruitments)) return {};
        const raw = fs.readFileSync(PATHS.recruitments, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading recruitments.json:", err.message);
        return {};
    }
}

/**
 * Save recruitments data
 * @param {Object} data - Recruitments data to save
 */
function saveRecruitments(data) {
    try {
        fs.writeFileSync(PATHS.recruitments, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing recruitments.json:", err.message);
        throw err;
    }
}

/**
 * Get reapply reasons data
 * @returns {Object} Reapply reasons object (keyed by userId)
 */
function getReapplyReasons() {
    try {
        if (!fs.existsSync(PATHS.reapplyreasons)) return {};
        const raw = fs.readFileSync(PATHS.reapplyreasons, "utf8");
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading reapplyreasons.json:", err.message);
        return {};
    }
}

/**
 * Save reapply reasons data
 * @param {Object} data - Reapply reasons data to save
 */
function saveReapplyReasons(data) {
    try {
        fs.writeFileSync(PATHS.reapplyreasons, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing reapplyreasons.json:", err.message);
        throw err;
    }
}

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
        ]
    },
    clans: {}
};

function getClanRules() {
    try {
        if (fs.existsSync(PATHS.clanrules)) {
            const raw = fs.readFileSync(PATHS.clanrules, "utf8");
            if (raw && raw.trim()) {
                return JSON.parse(raw);
            }
        }
    } catch (err) {
        console.error(`Error reading ${PATHS.clanrules}:`, err.message);
    }

    try {
        saveClanRules(DEFAULT_RULES_CONFIG);
    } catch (_) {}

    return DEFAULT_RULES_CONFIG;
}

/**
 * Save clan rules configuration to data/clanrules.json
 * @param {Object} data - Clan rules object to save
 */
function saveClanRules(data) {
    try {
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(PATHS.clanrules, content);
    } catch (err) {
        console.error("Error writing data/clanrules.json:", err.message);
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
                : (Array.isArray(data.rules) && data.rules.length > 0 ? data.rules : [...defaultRules])
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

module.exports = {
    getUserData,
    getClanRoles,
    getClans,
    getStrikePlayers,
    getHelpData,
    getTicketTimers,
    getWarType,
    getRecruitingTHs,
    getScanWar,
    getStrikeCounters,
    getRecruitments,
    getReapplyReasons,
    getClanRules,

    saveUserData,
    saveClanRoles,
    saveClans,
    saveStrikePlayers,
    saveHelpData,
    saveTicketTimers,
    saveWarType,
    saveRecruitingTHs,
    saveScanWar,
    saveStrikeCounters,
    saveRecruitments,
    saveReapplyReasons,
    saveClanRules,
    addClanRuleEntry,
    removeClanRuleEntry,

    PATHS
};
