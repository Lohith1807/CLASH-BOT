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

    apiApp.listen(PUBLIC_PORT, () => {
        const baseURL = `http://clashbotdata.duckdns.org:${PUBLIC_PORT}`;
        console.log(`🚀 Userdata API Server running on port ${PUBLIC_PORT}`);
        console.log(`📂 Userdata Link: ${baseURL}/userdata`);
        console.log(`📂 Wartype Link: ${baseURL}/wartype`);

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
