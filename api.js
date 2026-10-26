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

    // Helper to read clan rules safely from data/clanrules.json
    const getClanRulesData = () => {
        const dataPath = path.join(__dirname, "data/clanrules.json");
        try {
            if (!fs.existsSync(dataPath)) return null;
            const raw = fs.readFileSync(dataPath, "utf8");
            if (!raw || !raw.trim()) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    };

    // Helper to save clan rules safely to data/clanrules.json
    const saveClanRulesData = (data) => {
        const dataPath = path.join(__dirname, "data/clanrules.json");
        const content = JSON.stringify(data, null, 2);
        try { fs.writeFileSync(dataPath, content); } catch (_) {}
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

    // ==========================================
    // PERMISSIONS API ENDPOINTS
    // ==========================================

    const getPermissionsData = () => {
        const dataPath = path.join(__dirname, "config/permissions.json");
        try {
            if (!fs.existsSync(dataPath)) return null;
            const raw = fs.readFileSync(dataPath, "utf8");
            if (!raw || !raw.trim()) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    };

    const savePermissionsData = (data) => {
        const dataPath = path.join(__dirname, "config/permissions.json");
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(dataPath, content, "utf8");
    };

    // GET /permissions - View all permissions
    apiApp.get("/permissions", (req, res) => {
        try {
            const data = getPermissionsData();
            if (!data) {
                return res.status(404).json({ error: "permissions.json not found" });
            }
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /permissions/:command - View specific command permissions
    apiApp.get("/permissions/:command", (req, res) => {
        try {
            const data = getPermissionsData();
            if (!data) {
                return res.status(404).json({ error: "permissions.json not found" });
            }
            const cmd = req.params.command.toLowerCase().trim();
            if (!data[cmd]) {
                return res.status(404).json({ error: `Command "${cmd}" not found in permissions.json` });
            }
            res.json({
                command: cmd,
                ...data[cmd]
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // POST / PUT /permissions - Bulk update or single command via body
    const handleSavePermissions = (req, res) => {
        try {
            const currentData = getPermissionsData() || {};
            const newData = req.body;
            if (!newData || typeof newData !== "object" || Object.keys(newData).length === 0) {
                return res.status(400).json({ error: "Invalid data format" });
            }

            if (newData.command && (newData.roles !== undefined || newData.members !== undefined)) {
                const cmd = newData.command.toLowerCase().trim();
                currentData[cmd] = {
                    roles: newData.roles || {},
                    members: Array.isArray(newData.members) ? newData.members : []
                };
                savePermissionsData(currentData);
                return res.json({
                    status: "success",
                    message: `Permissions updated for command "${cmd}"`,
                    command: cmd,
                    data: currentData[cmd]
                });
            }

            savePermissionsData(newData);
            res.json({
                status: "success",
                message: "All permissions updated successfully",
                count: Object.keys(newData).length
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    apiApp.post("/permissions", handleSavePermissions);
    apiApp.put("/permissions", handleSavePermissions);

    // POST / PUT /permissions/:command - Add or update a specific command
    const handleSaveSingleCommandPermissions = (req, res) => {
        try {
            const currentData = getPermissionsData() || {};
            const cmd = req.params.command.toLowerCase().trim();
            const newData = req.body;

            if (!newData || typeof newData !== "object") {
                return res.status(400).json({ error: "Invalid data format" });
            }

            const existing = currentData[cmd] || { roles: {}, members: [] };

            currentData[cmd] = {
                roles: newData.roles !== undefined ? newData.roles : (existing.roles || {}),
                members: newData.members !== undefined ? (Array.isArray(newData.members) ? newData.members : []) : (existing.members || [])
            };

            savePermissionsData(currentData);
            res.json({
                status: "success",
                message: `Permissions updated for command "${cmd}"`,
                command: cmd,
                data: currentData[cmd]
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    };

    apiApp.post("/permissions/:command", handleSaveSingleCommandPermissions);
    apiApp.put("/permissions/:command", handleSaveSingleCommandPermissions);

    // DELETE /permissions/:command - Delete a command entry
    apiApp.delete("/permissions/:command", (req, res) => {
        try {
            const currentData = getPermissionsData();
            if (!currentData) {
                return res.status(404).json({ error: "permissions.json not found" });
            }
            const cmd = req.params.command.toLowerCase().trim();
            if (!currentData[cmd]) {
                return res.status(404).json({ error: `Command "${cmd}" not found in permissions.json` });
            }

            delete currentData[cmd];
            savePermissionsData(currentData);
            res.json({
                status: "success",
                message: `Command "${cmd}" deleted from permissions.json`
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Helper to resolve Discord guild
    const getDiscordGuild = async () => {
        if (!client) return null;
        const guildId = process.env.GUILD_ID || "1153720899715993681";
        return client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    };

    // ADD A ROLE TO A COMMAND (Auto-fetches role name from Discord if not given)
    apiApp.post("/permissions/:command/roles", async (req, res) => {
        try {
            const currentData = getPermissionsData() || {};
            const cmd = req.params.command.toLowerCase().trim();
            const { roleId, roleName } = req.body;

            const id = roleId || (typeof req.body === 'string' ? req.body : null);
            if (!id) {
                return res.status(400).json({ error: "Please provide 'roleId' in request body" });
            }

            if (!currentData[cmd]) {
                currentData[cmd] = { roles: {}, members: [] };
            }
            if (!currentData[cmd].roles || Array.isArray(currentData[cmd].roles)) {
                currentData[cmd].roles = {};
            }

            // Auto-fetch role name from Discord if not provided
            let finalRoleName = roleName;
            if (!finalRoleName) {
                const guild = await getDiscordGuild();
                if (guild) {
                    const discordRole = guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
                    if (discordRole) {
                        finalRoleName = discordRole.name;
                    }
                }
            }
            if (!finalRoleName) {
                finalRoleName = id === "@everyone" ? "@everyone" : `Role_${id}`;
            }

            currentData[cmd].roles[finalRoleName] = id;
            savePermissionsData(currentData);

            res.json({
                status: "success",
                message: `Added role "${finalRoleName}" (${id}) to command "${cmd}"`,
                command: cmd,
                role: { name: finalRoleName, id: id },
                roles: currentData[cmd].roles
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // REMOVE A ROLE FROM A COMMAND (Accepts role ID or role name)
    apiApp.delete("/permissions/:command/roles/:roleIdentifier", (req, res) => {
        try {
            const currentData = getPermissionsData();
            if (!currentData) {
                return res.status(404).json({ error: "permissions.json not found" });
            }
            const cmd = req.params.command.toLowerCase().trim();
            if (!currentData[cmd] || !currentData[cmd].roles) {
                return res.status(404).json({ error: `Command "${cmd}" has no roles configured` });
            }

            const identifier = decodeURIComponent(req.params.roleIdentifier).trim();
            let deletedKey = null;

            // 1. Match by role name key
            if (currentData[cmd].roles[identifier] !== undefined) {
                deletedKey = identifier;
                delete currentData[cmd].roles[identifier];
            } else {
                // 2. Match by role ID value
                for (const [name, id] of Object.entries(currentData[cmd].roles)) {
                    if (id === identifier) {
                        deletedKey = name;
                        delete currentData[cmd].roles[name];
                        break;
                    }
                }
            }

            if (!deletedKey) {
                return res.status(404).json({ error: `Role "${identifier}" not found in command "${cmd}"` });
            }

            savePermissionsData(currentData);
            res.json({
                status: "success",
                message: `Removed role "${deletedKey}" from command "${cmd}"`,
                command: cmd,
                roles: currentData[cmd].roles
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ADD A MEMBER TO A COMMAND (Auto-fetches Discord username if not given)
    apiApp.post("/permissions/:command/members", async (req, res) => {
        try {
            const currentData = getPermissionsData() || {};
            const cmd = req.params.command.toLowerCase().trim();
            const { userId, username } = req.body;

            const id = userId || (typeof req.body === 'string' ? req.body : null);
            if (!id) {
                return res.status(400).json({ error: "Please provide 'userId' in request body" });
            }

            if (!currentData[cmd]) {
                currentData[cmd] = { roles: {}, members: [] };
            }

            // Auto-fetch username from Discord if missing
            let finalUsername = username;
            if (!finalUsername && client) {
                const user = await client.users.fetch(id).catch(() => null);
                if (user) {
                    finalUsername = user.username || user.tag;
                }
            }

            if (Array.isArray(currentData[cmd].members)) {
                if (!currentData[cmd].members.includes(id)) {
                    currentData[cmd].members.push(id);
                }
            } else if (typeof currentData[cmd].members === 'object' && currentData[cmd].members !== null) {
                const nameKey = finalUsername || id;
                currentData[cmd].members[nameKey] = id;
            } else {
                currentData[cmd].members = [id];
            }

            savePermissionsData(currentData);

            res.json({
                status: "success",
                message: `Added member "${finalUsername || id}" (${id}) to command "${cmd}"`,
                command: cmd,
                user: { id, username: finalUsername || id },
                members: currentData[cmd].members
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // REMOVE A MEMBER FROM A COMMAND (Accepts user ID or username)
    apiApp.delete("/permissions/:command/members/:userIdentifier", (req, res) => {
        try {
            const currentData = getPermissionsData();
            if (!currentData) {
                return res.status(404).json({ error: "permissions.json not found" });
            }
            const cmd = req.params.command.toLowerCase().trim();
            if (!currentData[cmd] || !currentData[cmd].members) {
                return res.status(404).json({ error: `Command "${cmd}" has no members configured` });
            }

            const identifier = decodeURIComponent(req.params.userIdentifier).trim();
            let removed = false;

            if (Array.isArray(currentData[cmd].members)) {
                const initialLength = currentData[cmd].members.length;
                currentData[cmd].members = currentData[cmd].members.filter(m => m !== identifier);
                removed = currentData[cmd].members.length < initialLength;
            } else if (typeof currentData[cmd].members === 'object' && currentData[cmd].members !== null) {
                if (currentData[cmd].members[identifier] !== undefined) {
                    delete currentData[cmd].members[identifier];
                    removed = true;
                } else {
                    for (const [name, id] of Object.entries(currentData[cmd].members)) {
                        if (id === identifier) {
                            delete currentData[cmd].members[name];
                            removed = true;
                            break;
                        }
                    }
                }
            }

            if (!removed) {
                return res.status(404).json({ error: `Member "${identifier}" not found in command "${cmd}"` });
            }

            savePermissionsData(currentData);
            res.json({
                status: "success",
                message: `Removed member "${identifier}" from command "${cmd}"`,
                command: cmd,
                members: currentData[cmd].members
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /guild/roles - Fetch server roles with names & IDs for easy dashboard selection
    apiApp.get("/guild/roles", async (req, res) => {
        try {
            if (!client) {
                return res.status(503).json({ error: "Discord client is not ready" });
            }
            const guildId = process.env.GUILD_ID || "1153720899715993681";
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                return res.status(404).json({ error: `Guild "${guildId}" not found` });
            }
            const roles = await guild.roles.fetch();
            const list = roles
                .filter(r => r.id !== guild.id)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.hexColor,
                    position: r.position
                }))
                .sort((a, b) => b.position - a.position);

            res.json({
                guildId: guild.id,
                guildName: guild.name,
                count: list.length,
                roles: list
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    apiApp.listen(PUBLIC_PORT, () => {
        const baseURL = `http://clashbotdata.duckdns.org:${PUBLIC_PORT}`;
        console.log(`🚀 Userdata API Server running on port ${PUBLIC_PORT}`);
        console.log(`📂 Userdata Link: ${baseURL}/userdata`);
        console.log(`📂 Wartype Link: ${baseURL}/wartype`);
        console.log(`📂 TicketData Link: ${baseURL}/ticketdata`);
        console.log(`📂 ClanRules Link: ${baseURL}/clanrules`);
        console.log(`📂 Permissions Link: ${baseURL}/permissions`);
        console.log(`📂 Guild Roles Link: ${baseURL}/guild/roles`);

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
