const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require('dotenv').config();

/**
 * Userdata API Server
 * @param {import('discord.js').Client} client 
 */
function initApi(client) {
    const apiApp = express();
    apiApp.use(express.json());

    // Enable CORS for web dashboards
    apiApp.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            return res.sendStatus(200);
        }
        next();
    });

    const PUBLIC_PORT = process.env.PUBLIC_PORT || 3023;
    const USER_LOG_CHANNEL_ID = process.env.USER_LOG_CHANNEL_ID;

    apiApp.get("/userdata", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/userdata.json");
            if (!fs.existsSync(dataPath)) {
                return res.status(404).json({ error: "userdata.json not found" });
            }
            const data = fs.readFileSync(dataPath, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.send(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.post("/userdata", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/userdata.json");
            const newData = req.body;
            if (!newData || Object.keys(newData).length === 0) {
                return res.status(400).json({ error: "Invalid data" });
            }
            fs.writeFileSync(dataPath, JSON.stringify(newData, null, 2));
            res.json({ status: "success", message: "Data updated" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.get("/wartype", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/wartype.json");
            if (!fs.existsSync(dataPath)) {
                return res.status(404).json({ error: "wartype.json not found" });
            }
            const data = fs.readFileSync(dataPath, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.send(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.post("/wartype", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/wartype.json");
            const newData = req.body;
            if (!newData || Object.keys(newData).length === 0) {
                return res.status(400).json({ error: "Invalid data" });
            }
            fs.writeFileSync(dataPath, JSON.stringify(newData, null, 2));
            res.json({ status: "success", message: "War Type data updated" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.get("/ticketdata", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/ticketData.json");
            if (!fs.existsSync(dataPath)) {
                return res.status(404).json({ error: "ticketData.json not found" });
            }
            const data = fs.readFileSync(dataPath, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.send(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.post("/ticketdata", (req, res) => {
        try {
            const dataPath = path.join(__dirname, "data/ticketData.json");
            const newData = req.body;
            if (!newData || Object.keys(newData).length === 0) {
                return res.status(400).json({ error: "Invalid data" });
            }
            fs.writeFileSync(dataPath, JSON.stringify(newData, null, 2));
            res.json({ status: "success", message: "Ticket data updated" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Helper to read clan rules safely
    const getClanRulesData = () => {
        const dataPath = path.join(__dirname, "data/clanrules.json");
        const rootPath = path.join(__dirname, "clanrules.json");
        const targetPath = fs.existsSync(dataPath) ? dataPath : (fs.existsSync(rootPath) ? rootPath : null);
        if (!targetPath) return null;
        try {
            return JSON.parse(fs.readFileSync(targetPath, "utf8"));
        } catch (_) {
            return null;
        }
    };

    // Helper to save clan rules safely
    const saveClanRulesData = (data) => {
        const dataPath = path.join(__dirname, "data/clanrules.json");
        const rootPath = path.join(__dirname, "clanrules.json");
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(dataPath, content);
        try {
            fs.writeFileSync(rootPath, content);
        } catch (_) {}
    };

    apiApp.get("/clanrules", (req, res) => {
        try {
            const data = getClanRulesData();
            if (!data) {
                return res.status(404).json({ error: "clanrules.json not found" });
            }
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.get("/clanrules/:tag", (req, res) => {
        try {
            const data = getClanRulesData();
            if (!data) {
                return res.status(404).json({ error: "clanrules.json not found" });
            }
            const rawTag = decodeURIComponent(req.params.tag).trim().toUpperCase();
            const tagWithHash = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
            const tagNoHash = tagWithHash.replace('#', '');

            const clansMap = data.clans || {};
            let clanConfig = clansMap[tagWithHash] || clansMap[tagNoHash];

            if (!clanConfig) {
                // Check by nickname
                for (const [t, info] of Object.entries(clansMap)) {
                    if (info.nickName && info.nickName.toUpperCase() === rawTag) {
                        clanConfig = info;
                        break;
                    }
                }
            }

            if (!clanConfig) {
                return res.status(404).json({
                    error: `Clan "${rawTag}" not found in clanrules.json`,
                    default: data.default
                });
            }

            // Return clan config merged with default rules
            const merged = {
                tag: tagWithHash,
                ...clanConfig,
                rules: (Array.isArray(clanConfig.rules) && clanConfig.rules.length > 0)
                    ? clanConfig.rules
                    : (data.default ? data.default.rules : [])
            };

            res.json(merged);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    const handleSaveClanRules = (req, res) => {
        try {
            const currentData = getClanRulesData() || { default: {}, clans: {} };
            const newData = req.body;
            if (!newData || typeof newData !== "object" || Object.keys(newData).length === 0) {
                return res.status(400).json({ error: "Invalid data" });
            }

            // If updating a specific clan by tag field in body
            if (newData.tag && (newData.rules !== undefined || newData.image !== undefined || newData.footer !== undefined)) {
                const tag = (newData.tag.startsWith('#') ? newData.tag : '#' + newData.tag).toUpperCase();
                if (!currentData.clans) currentData.clans = {};
                currentData.clans[tag] = {
                    ...(currentData.clans[tag] || {}),
                    ...newData
                };
                delete currentData.clans[tag].tag;
                saveClanRulesData(currentData);
                return res.json({ status: "success", message: `Clan rules updated for ${tag}`, data: currentData.clans[tag] });
            }

            // Otherwise update entire object
            saveClanRulesData(newData);
            res.json({ status: "success", message: "Clan rules updated", data: newData });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    const handleSaveSingleClanRules = (req, res) => {
        try {
            const currentData = getClanRulesData() || { default: {}, clans: {} };
            const rawTag = decodeURIComponent(req.params.tag).trim().toUpperCase();
            const tagWithHash = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
            const newData = req.body;

            if (!newData || typeof newData !== "object") {
                return res.status(400).json({ error: "Invalid data" });
            }

            if (!currentData.clans) currentData.clans = {};
            const defaultRules = (currentData.default && Array.isArray(currentData.default.rules) && currentData.default.rules.length > 0)
                ? currentData.default.rules
                : [
                    "Be active daily and participate in wars and CWL.",
                    "Always use both war attacks — missing attacks may lead to demotion.",
                    "Donate correct troops only as requested.",
                    "Respect all members — teamwork builds victory.",
                    "No rushed bases allowed in main clan — use feeder clans if needed.",
                    "Maintain a healthy competitive spirit, no toxicity."
                ];

            const existingClan = currentData.clans[tagWithHash] || {};
            const clanRules = (Array.isArray(newData.rules) && newData.rules.length > 0)
                ? newData.rules
                : (Array.isArray(existingClan.rules) && existingClan.rules.length > 0 ? existingClan.rules : [...defaultRules]);

            currentData.clans[tagWithHash] = {
                title: "{clanName} Rules",
                image: "",
                thumbnail: "",
                footer: { text: "", iconURL: "" },
                color: "#E74C3C",
                ...existingClan,
                ...newData,
                rules: clanRules
            };

            saveClanRulesData(currentData);
            res.json({ status: "success", message: `Rules updated for ${tagWithHash}`, data: currentData.clans[tagWithHash] });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    apiApp.post("/clanrules", handleSaveClanRules);
    apiApp.put("/clanrules", handleSaveClanRules);
    apiApp.post("/clanrules/:tag", handleSaveSingleClanRules);
    apiApp.put("/clanrules/:tag", handleSaveSingleClanRules);

    apiApp.listen(PUBLIC_PORT, () => {
        const baseURL = `http://clashbotdata.duckdns.org:${PUBLIC_PORT}`;
        console.log(`🚀 Userdata API Server running on port ${PUBLIC_PORT}`);
        console.log(`📂 Userdata Link: ${baseURL}/userdata`);
        console.log(`📂 Wartype Link: ${baseURL}/wartype`);
        console.log(`📂 TicketData Link: ${baseURL}/ticketdata`);
        console.log(`📂 ClanRules Link: ${baseURL}/clanrules`);

        setInterval(async () => {
            try {
                await axios.get(`${baseURL}/userdata`);
                
                if (client && USER_LOG_CHANNEL_ID) {
                    const channel = await client.channels.fetch(USER_LOG_CHANNEL_ID).catch(() => null);
                    if (channel) {
                        await channel.send("📡 Userdata API Keep-alive successful").catch(() => null);
                    }
                }
                
            } catch (err) {
                console.error("📡 Keep-alive failed:", err.message);
            }
        }, 10 * 60 * 1000);
    });

    return apiApp;
}

module.exports = initApi;
