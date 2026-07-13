const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'staffTickets.json');

function getMostRecentResetTime() {
    // Current time
    const now = new Date();
    
    // Create a date object for the most recent Sunday at 02:00 UTC (which is 07:30 IST)
    // Sunday is day 0 in JavaScript's getUTCDay()
    let lastReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0, 0));
    
    // Move backwards to Sunday
    let day = lastReset.getUTCDay();
    lastReset.setUTCDate(lastReset.getUTCDate() - day);

    // If today is Sunday, but the time is before 02:00 UTC, the most recent reset was LAST Sunday
    if (now.getTime() < lastReset.getTime()) {
        lastReset.setUTCDate(lastReset.getUTCDate() - 7);
    }
    
    return lastReset.getTime();
}

function loadData() {
    try {
        if (!fs.existsSync(dataPath)) {
            return { lastReset: 0, staff: {} };
        }
        const data = fs.readFileSync(dataPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading staffTickets.json:", e);
        return { lastReset: 0, staff: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 4));
    } catch (e) {
        console.error("Error writing staffTickets.json:", e);
    }
}

function checkAndReset(data) {
    const recentReset = getMostRecentResetTime();
    // If the last reset recorded in the file is older than the most recent Sunday 7:30 AM IST
    if (data.lastReset < recentReset) {
        data.lastReset = recentReset;
        data.staff = {};
        saveData(data);
    }
}

function recordClaim(user) {
    const data = loadData();
    checkAndReset(data);
    
    if (!data.staff[user.id]) {
        data.staff[user.id] = {
            username: user.username,
            claims: 0
        };
    }
    
    data.staff[user.id].claims += 1;
    data.staff[user.id].username = user.username; // keep username up to date
    
    saveData(data);
}

function removeClaim(userId) {
    const data = loadData();
    checkAndReset(data);
    
    if (data.staff[userId] && data.staff[userId].claims > 0) {
        data.staff[userId].claims -= 1;
        saveData(data);
        return true;
    }
    return false;
}

function getSummary() {
    const data = loadData();
    checkAndReset(data);
    return data;
}

module.exports = {
    recordClaim,
    removeClaim,
    getSummary,
    getMostRecentResetTime // exported for testing if needed
};
