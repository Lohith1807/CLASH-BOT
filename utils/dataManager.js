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
    let config = null;
    try {
        if (fs.existsSync(PATHS.clanrules)) {
            const raw = fs.readFileSync(PATHS.clanrules, "utf8");
            if (raw && raw.trim()) {
                config = JSON.parse(raw);
            }
        }
    } catch (err) {
        console.error(`Error reading ${PATHS.clanrules}:`, err.message);
    }

    if (!config) {
        config = { ...DEFAULT_RULES_CONFIG };
        try {
            saveClanRules(config);
        } catch (_) {}
        return config;
    }

    if (!config.default) {
        config.default = { ...DEFAULT_RULES_CONFIG.default };
    }

    if (!config.default.warrules && !config.default.mailrules) {
        config.default.warrules = { ...DEFAULT_MAIL_RULES };
    }

    return config;
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
    saveMailRules,
    updateMailRule,
    addClanRuleEntry,
    removeClanRuleEntry,

    PATHS
};
