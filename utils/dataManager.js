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
    recruitingths: path.join(DATA_DIR, "recruitingths.json")
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


module.exports = {
    getUserData,
    getClanRoles,
    getClans,
    getStrikePlayers,
    getHelpData,
    getTicketTimers,
    getWarType,
    getRecruitingTHs,

    saveUserData,
    saveClanRoles,
    saveClans,
    saveStrikePlayers,
    saveHelpData,
    saveTicketTimers,
    saveWarType,
    saveRecruitingTHs,

    PATHS
};
