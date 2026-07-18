const axios = require("axios");
const config = require("../config/config.js");

const cocApi = axios.create({
    baseURL: "https://api.clashofclans.com/v1",
    headers: {
        Authorization: `Bearer ${config.COC_API_TOKEN}`,
    },
    timeout: 5000, // 5 seconds timeout to prevent hanging
});

let discordClient = null;
let isInMaintenance = false;
let maintenanceCheckUntil = 0;

function init(client) {
    discordClient = client;
}

async function announceMaintenanceState(isStarted) {
    if (!discordClient) return;
    const API_LOGS_ID = process.env.API_LOGS || config.LOG_CHANNEL_ID || "1482784031954305024";
    const logChannel = await discordClient.channels.fetch(API_LOGS_ID).catch(() => null);
    if (!logChannel) return;

    const message = isStarted ? "Clash of Clans Maintainance Started" : "Clash of Clans Maintainance Ended";
    await logChannel.send(message).catch(() => null);
}

cocApi.interceptors.request.use(reqConfig => {
    if (isInMaintenance && Date.now() < maintenanceCheckUntil) {
        return Promise.reject(new Error("API_MAINTENANCE_PAUSE"));
    }
    return reqConfig;
});

cocApi.interceptors.response.use(
    response => {
        if (isInMaintenance) {
            isInMaintenance = false;
            maintenanceCheckUntil = 0;
            announceMaintenanceState(false);
        }
        return response;
    },
    error => {
        if (error.response && error.response.status === 503) {
            if (!isInMaintenance) {
                isInMaintenance = true;
                announceMaintenanceState(true);
            }
            // Pause polling for 5 minutes
            maintenanceCheckUntil = Date.now() + 5 * 60 * 1000;
            return Promise.reject(new Error("API_MAINTENANCE_PAUSE"));
        }
        return Promise.reject(error);
    }
);

/**
 * Format tag to ensure it has # prefix
 * @param {string} tag 
 * @returns {string}
 */
function formatTag(tag) {
    if (!tag) return "";
    const cleaned = tag.toUpperCase().replace(/O/g, '0');
    return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
}

/**
 * Encode tag for URL
 * @param {string} tag 
 * @returns {string}
 */
function encodeTag(tag) {
    return encodeURIComponent(formatTag(tag));
}

/**
 * Fetch player data by tag
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getPlayer(tag) {
    try {
        const response = await cocApi.get(`/players/${encodeTag(tag)}`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch clan data by tag
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getClan(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch war log for a clan
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getWarLog(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}/warlog`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch current war for a clan
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getCurrentWar(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}/currentwar`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch member list for a clan
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getClanMembers(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}/members`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Search clans by name
 * @param {string} name - Clan name to search for
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Object>}
 */
async function searchClans(name, limit = 10) {
    try {
        const response = await cocApi.get(`/clans`, {
            params: { name: name, limit: limit }
        });
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch capital raid seasons for a clan
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getCapitalRaidSeason(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}/capitalraidseasons`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Fetch CWL group for a clan
 * @param {string} tag 
 * @returns {Promise<Object>}
 */
async function getClanWarLeagueGroup(tag) {
    try {
        const response = await cocApi.get(`/clans/${encodeTag(tag)}/currentwar/leaguegroup`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getPlayer,
    getClan,
    getClanMembers,
    getWarLog,
    getCurrentWar,
    getCapitalRaidSeason,
    getClanWarLeagueGroup,
    searchClans,
    formatTag,
    init,
};
