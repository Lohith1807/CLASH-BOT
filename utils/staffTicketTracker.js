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
        const parsed = JSON.parse(data);
        
        // Migration: Ensure all staff have claimsByType and total claims
        if (parsed.staff) {
            for (const userId in parsed.staff) {
                const userObj = parsed.staff[userId];
                if (typeof userObj.claims === 'number' && !userObj.claimsByType) {
                    userObj.claimsByType = { 'Other': userObj.claims };
                }
                if (!userObj.claimsByType) {
                    userObj.claimsByType = {};
                }
                
                // Recalculate total claims to be safe
                userObj.claims = Object.values(userObj.claimsByType).reduce((sum, val) => sum + val, 0);
            }
        }
        return parsed;
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

function recordClaim(user, ticketType = 'Other') {
    const data = loadData();
    checkAndReset(data);
    
    if (!data.staff[user.id]) {
        data.staff[user.id] = {
            username: user.username,
            claims: 0,
            claimsByType: {}
        };
    }
    
    if (!data.staff[user.id].claimsByType[ticketType]) {
        data.staff[user.id].claimsByType[ticketType] = 0;
    }
    
    data.staff[user.id].claimsByType[ticketType] += 1;
    data.staff[user.id].claims += 1; // Update total
    data.staff[user.id].username = user.username; // keep username up to date
    
    saveData(data);
}

function removeClaim(userId, ticketType = 'Other') {
    const data = loadData();
    checkAndReset(data);
    
    if (data.staff[userId] && data.staff[userId].claims > 0) {
        if (data.staff[userId].claimsByType && data.staff[userId].claimsByType[ticketType] > 0) {
            data.staff[userId].claimsByType[ticketType] -= 1;
        } else if (data.staff[userId].claimsByType && data.staff[userId].claimsByType['Other'] > 0) {
            // Fallback to removing from Other if the type wasn't found but they have claims
            data.staff[userId].claimsByType['Other'] -= 1;
        } else {
            // Just find any type with > 0 and deduct (fallback)
            for (const type in data.staff[userId].claimsByType) {
                if (data.staff[userId].claimsByType[type] > 0) {
                    data.staff[userId].claimsByType[type] -= 1;
                    break;
                }
            }
        }
        
        data.staff[userId].claims -= 1;
        saveData(data);
        return true;
    }
    return false;
}

function resolveTicketType(channelName) {
    if (!channelName) return 'Other';
    const prefix = channelName.split('-')[0].toLowerCase();
    if (['fwa', 'clan', 'war'].includes(prefix)) return 'Clan Apply';
    if (prefix === 'rep') return 'Rep Apply';
    if (prefix === 'staff') return 'Staff Apply';
    if (prefix === 'alliance') return 'Alliance Join';
    if (prefix === 'help') return 'Help Assistance';
    return 'Other';
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
    resolveTicketType,
    getMostRecentResetTime // exported for testing if needed
};
