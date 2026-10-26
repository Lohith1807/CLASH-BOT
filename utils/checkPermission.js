const fs = require('fs');
const path = require('path');

const PERMISSIONS_FILE = path.join(__dirname, '../config/permissions.json');
let lastMtimeMs = 0;

function loadPermissions() {
    try {
        if (!fs.existsSync(PERMISSIONS_FILE)) {
            console.error(`[checkPermission] Permissions file not found at ${PERMISSIONS_FILE}`);
            return false;
        }
        const stat = fs.statSync(PERMISSIONS_FILE);
        const raw = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        permissionsData = parsed;
        lastMtimeMs = stat.mtimeMs;
        console.log(`[checkPermission] Loaded ${Object.keys(permissionsData).length} command permission rules (Hot-Reloaded).`);
        return true;
    } catch (err) {
        console.error(`[checkPermission] Failed to reload permissions from ${PERMISSIONS_FILE}:`, err.message);
        // Retain previous valid permissionsData so bot doesn't crash on invalid JSON syntax
        return false;
    }
}

// Initial load
loadPermissions();

// Background file watcher for automatic hot reload
try {
    fs.watchFile(PERMISSIONS_FILE, { interval: 1000 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs && curr.mtimeMs > lastMtimeMs) {
            loadPermissions();
        }
    });
} catch (e) {
    // Falls back to per-invocation ensureFreshPermissions check
}

/**
 * Ensures the permissions in memory are up to date with disk without requiring restart.
 */
function ensureFreshPermissions() {
    try {
        if (!fs.existsSync(PERMISSIONS_FILE)) return;
        const stat = fs.statSync(PERMISSIONS_FILE);
        if (stat.mtimeMs > lastMtimeMs) {
            loadPermissions();
        }
    } catch (e) { }
}

/**
 * Normalizes input value (array or object) into a string array of IDs.
 * @param {Array|Object|string} val
 * @returns {string[]}
 */
function toIdArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) {
        return val.map(v => {
            if (typeof v === 'object' && v !== null) {
                return v.id || v.roleId || v.userId || Object.values(v)[0];
            }
            return String(v).trim();
        }).filter(Boolean);
    }
    if (typeof val === 'object') {
        const ids = [];
        for (const [k, v] of Object.entries(val)) {
            const valStr = String(v).trim();
            const keyStr = String(k).trim();
            if (valStr === '@everyone' || valStr === '*' || /^\d+$/.test(valStr)) {
                ids.push(valStr);
            } else if (keyStr === '@everyone' || keyStr === '*' || /^\d+$/.test(keyStr)) {
                ids.push(keyStr);
            }
        }
        return ids;
    }
    return [String(val).trim()];
}

/**
 * Checks whether a user or member has permission to execute a command.
 * @param {string} commandKey - e.g. "ban", "/ban", or ";mute"
 * @param {import('discord.js').Interaction|import('discord.js').Message|import('discord.js').GuildMember} target
 * @returns {boolean}
 */
function checkPermission(commandKey, target) {
    ensureFreshPermissions();

    if (!commandKey) {
        console.warn(`[checkPermission] Empty command key provided.`);
        return false;
    }

    // Resolve member, user, and guild from interaction, message, or member
    let member = null;
    let user = null;
    let guild = null;

    if (!target) {
        console.warn(`[checkPermission] No target provided for command "${commandKey}". Denied.`);
        return false;
    }

    if (target.roles) {
        // GuildMember directly passed
        member = target;
        user = target.user || { id: target.id };
        guild = target.guild;
    } else if (target.user && target.guild) {
        // Interaction passed
        member = target.member;
        user = target.user;
        guild = target.guild;
    } else if (target.author) {
        // Message passed
        member = target.member;
        user = target.author;
        guild = target.guild;
    } else if (target.id) {
        // User object (e.g. DM)
        user = target;
    }

    const userId = user?.id || member?.id;

    // Normalize command key
    const rawKey = String(commandKey).trim();
    const cleanKey = rawKey.replace(/^(\/|{prefix}|;|\!|\?)/, '').trim().toLowerCase();

    // Look up rule
    let rule = permissionsData[cleanKey] || permissionsData[rawKey] || permissionsData['/' + cleanKey];

    // If still not found, check with prefix
    if (!rule) {
        const prefix = process.env.PREFIX || ';';
        rule = permissionsData['{prefix}' + cleanKey] || permissionsData[prefix + cleanKey];
    }

    // Missing from JSON -> Deny by default and log a warning
    if (!rule) {
        console.warn(`[checkPermission] Command "${commandKey}" is MISSING from permissions.json. Denied by default.`);
        return false;
    }

    const allowedRoles = toIdArray(rule.roles);
    const allowedMembers = toIdArray(rule.members);

    // 1. Check unrestricted / public access (@everyone or *)
    if (allowedRoles.includes('@everyone') || allowedRoles.includes('*') || rule.unrestricted === true) {
        return true;
    }

    // 2. Check Member ID (User ID whitelist)
    if (userId && allowedMembers.includes(userId)) {
        return true;
    }

    // If no member object available (e.g. in DM), cannot check roles
    if (!member) {
        return false;
    }

    // 3. Check Roles
    if (allowedRoles.length > 0) {
        const memberRoleIds = member.roles?.cache ? member.roles.cache : (Array.isArray(member.roles) ? member.roles : []);
        const hasRole = member.roles?.cache
            ? allowedRoles.some(roleId => member.roles.cache.has(roleId))
            : (Array.isArray(member.roles) ? allowedRoles.some(roleId => member.roles.includes(roleId)) : false);

        if (hasRole) {
            return true;
        }
    }

    // 4. Backward compatibility check for Discord PermissionFlags if still present
    if (Array.isArray(rule.permissions) && rule.permissions.length > 0 && member.permissions) {
        for (const perm of rule.permissions) {
            try {
                if (member.permissions.has(perm)) {
                    return true;
                }
            } catch (err) {
                // Ignore invalid permission flag name
            }
        }
    }

    return false;
}

module.exports = {
    checkPermission,
    loadPermissions,
    reloadPermissions: loadPermissions,
    toIdArray
};
