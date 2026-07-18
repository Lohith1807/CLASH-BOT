const cheerio = require("cheerio");
const proxyFetch = require("./proxyFetch");
const fs = require("fs");
const path = require("path");

async function fwaClanData(tag, { EmbedBuilder, emoji: emojiUtils, coc, guild }) {
    const tagMatch = tag.match(/#([A-Z0-9]+)/i);
    const cleanTag = tagMatch ? tagMatch[1].toUpperCase() : tag.replace("#", "").toUpperCase();
    const formattedTag = `#${cleanTag}`;

    const url = `https://fwastats.com/Clan/${cleanTag}/Members.json`;
    const url2 = `https://fwastats.com/Clan/${cleanTag}/Weight`;

    const fwaHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": process.env.FWA_COOKIE || ""
    };

    const statsWorkerBase = process.env.FWASTATS_WORKER_URL;

    let clanData;
    try {
        if (statsWorkerBase) {
            const res = await fetch(`${statsWorkerBase}?url=${encodeURIComponent(url)}`, {
                headers: { "Fwa-Cookie": process.env.FWA_COOKIE || "" }
            }).catch(() => null);
            if (res && res.ok) {
                const resData = await res.json();
                clanData = typeof resData === "string" ? JSON.parse(resData) : resData;
            }
        }
        if (!clanData) {
            const res1Data = await proxyFetch(url);
            clanData = typeof res1Data === "string" ? JSON.parse(res1Data) : res1Data;
        }
    } catch (err) {
        const res1 = await fetch(url, { headers: fwaHeaders });
        if (!res1.ok) throw new Error("Failed to fetch FWA members JSON");
        const res1Data = await res1.json();
        clanData = typeof res1Data === "string" ? JSON.parse(res1Data) : res1Data;
    }

    let html;
    try {
        if (statsWorkerBase) {
            const res = await fetch(`${statsWorkerBase}?url=${encodeURIComponent(url2)}`, {
                headers: { "Fwa-Cookie": process.env.FWA_COOKIE || "" }
            }).catch(() => null);
            if (res && res.ok) {
                html = await res.text();
            }
        }
        if (!html) {
            html = await proxyFetch(url2);
        }
    } catch (err) {
        const res2 = await fetch(url2, { headers: fwaHeaders });
        if (!res2.ok) throw new Error("Failed to fetch FWA weight page");
        html = await res2.text();
    }
    const $ = cheerio.load(html);

    let clanName = "";
    if (coc) {
        const cocClan = await coc.getClan(formattedTag).catch(() => null);
        if (cocClan) {
            clanName = cocClan.name;
        }
    }
    if (!clanName) {
        clanName = $("body > div.container.body-content.fill > div.well > div > div > h3").text().trim();
    }
    if (!clanName) {
        clanName = formattedTag;
    }

    let lastDate = "";

    const clanRolesPath = path.join(__dirname, "../data/clanrole.json");
    const wwPath = path.join(__dirname, "../data/ww.json");

    let wwData = {};
    if (fs.existsSync(wwPath)) {
        try {
            wwData = JSON.parse(fs.readFileSync(wwPath, "utf8"));
            
            const tagKeys = [
                formattedTag,
                cleanTag,
                tag,
                tag.toUpperCase(),
                tag.toLowerCase()
            ];
            
            for (const key of tagKeys) {
                if (wwData[key] && wwData[key].lastUpdated) {
                    lastDate = wwData[key].lastUpdated;
                    break;
                }
            }
        } catch (err) {
            console.error("Error parsing ww.json:", err);
        }
    }

    if (!lastDate) {
        lastDate = "Requires FWA_COOKIE or submission too long ago";
        $(".alert").each((i, el) => {
            const txt = $(el).text().trim();
            if (txt.toLowerCase().includes("ago") || txt.toLowerCase().includes("submit")) {
                const strongText = $(el).find("strong").text().trim() || $(el).find("b").text().trim();
                if (strongText) {
                    lastDate = strongText;
                } else {
                    const html = $(el).html() || "";
                    const firstPart = html.split(/<br\s*\/?>/i)[0];
                    lastDate = cheerio.load(firstPart).text().trim() || txt.split('\n')[0].trim();
                }
            }
        });
    }

    const thEmojiMap = {
        18: emojiUtils.getEmoji("th18"),
        17: emojiUtils.getEmoji("th17"),
        16: emojiUtils.getEmoji("th16"),
        15: emojiUtils.getEmoji("th15"),
        14: emojiUtils.getEmoji("th14"),
        13: emojiUtils.getEmoji("th13"),
        12: emojiUtils.getEmoji("th12"),
        11: emojiUtils.getEmoji("th11"),
    };

    const clanWeight = {};
    for (const member of clanData) {
        try {
            const playerName = member.name;
            const townHallLevel = member.townHall;
            const weight = parseInt(member.weight, 10);

            let equivalent;
            if (weight > 170000 && weight <= 179000) equivalent = 18;
            else if (weight > 160000 && weight <= 169000) equivalent = 17;
            else if (weight > 150000 && weight <= 160000) equivalent = 16;
            else if (weight > 140000 && weight <= 150000) equivalent = 15;
            else if (weight > 130000 && weight <= 140000) equivalent = 14;
            else if (weight > 120000 && weight <= 130000) equivalent = 13;
            else if (weight > 110000 && weight <= 120000) equivalent = 12;
            else if (weight > 90000 && weight <= 110000) equivalent = 11;
            else equivalent = townHallLevel;

            clanWeight[playerName] = {
                townHall: townHallLevel,
                weight,
                eqvweight: equivalent
            };
        } catch {
        }
    }

    const sortedClanWeight = Object.entries(clanWeight)
        .sort((a, b) => b[1].weight - a[1].weight);

    let formattedLastDate = lastDate;
    if (lastDate) {
        const match = lastDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (match) {
            const [_, dayStr, monthStr, yearStr] = match;
            const d = parseInt(dayStr, 10);
            const m = parseInt(monthStr, 10);
            const y = parseInt(yearStr, 10);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const subDate = new Date(y, m - 1, d);
            subDate.setHours(0, 0, 0, 0);
            const diffMs = today.getTime() - subDate.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            
            let suffix = "";
            if (diffDays === 0) {
                suffix = " (today)";
            } else if (diffDays === 1) {
                suffix = " (1 day ago)";
            } else if (diffDays > 1) {
                suffix = ` (${diffDays} days ago)`;
            } else if (diffDays === -1) {
                suffix = " (tomorrow)";
            } else if (diffDays < -1) {
                suffix = ` (in ${Math.abs(diffDays)} days)`;
            }
            
            formattedLastDate = lastDate.replace(`${dayStr}/${monthStr}/${yearStr}`, `${dayStr}/${monthStr}/${yearStr}${suffix}`);
        }
    }

    const perPage = 20;
    const pages = [];
    const totalPages = Math.ceil(sortedClanWeight.length / perPage);

    for (let page = 0; page < totalPages; page++) {
        const fields = sortedClanWeight.slice(page * perPage, (page + 1) * perPage).map(([player, data], index) => ({
            name: `${page * perPage + index + 1}. ${player}`,
            value: `${thEmojiMap[data.townHall] || `TH${data.townHall}`} | ⚖ ${data.weight.toLocaleString()} | Real Weight: ${thEmojiMap[data.eqvweight] || `TH${data.eqvweight}`}`,
            inline: false
        }));

        const embed = new EmbedBuilder()
            .setTitle(`${emojiUtils.getEmoji("clancastle")} ${clanName} — FWA Weight Report`)
            .setDescription(`Last Submission: **${formattedLastDate}**\n📄 Page ${page + 1} of ${totalPages}`)
            .setColor("Random")
            .addFields(fields)
            .setFooter({ text: "Blood alliance", iconURL: (guild && guild.iconURL({ size: 128 })) || undefined })
            .setTimestamp();

        pages.push(embed);
    }

    return pages;
}

async function checkFWAWeights(client) {
    if (!client) {
        console.error("checkFWAWeights: client is not defined");
        return;
    }
    const wwPath = path.join(__dirname, "../data/ww.json");
    if (!fs.existsSync(wwPath)) return;

    let wwData;
    try {
        wwData = JSON.parse(fs.readFileSync(wwPath, "utf8"));
    } catch (err) {
        console.error("checkFWAWeights read error:", err);
        return;
    }

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const emojiUtils = require("./emoji.js");

    const clanRolesPath = path.join(__dirname, "../data/clanrole.json");
    let clanRoles = {};
    if (fs.existsSync(clanRolesPath)) {
        try {
            clanRoles = JSON.parse(fs.readFileSync(clanRolesPath, "utf8"));
        } catch (err) {
            console.error("Error reading clanrole.json:", err);
        }
    }

    const lastCheckPath = path.join(__dirname, "../data/ww_last_check.json");
    let lastCheckData = {};
    if (fs.existsSync(lastCheckPath)) {
        try {
            lastCheckData = JSON.parse(fs.readFileSync(lastCheckPath, "utf8"));
        } catch (err) {
            console.error("Error reading ww_last_check.json:", err);
        }
    }

    const statsWorkerBase = process.env.FWASTATS_WORKER_URL;
    const fwaHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": process.env.FWA_COOKIE || ""
    };

    let updated = false;
    let lastCheckUpdated = false;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const todayStr = `${day}/${month}/${year}`;

    const keysToCheck = new Set(Object.keys(wwData));

    for (const clanTag of keysToCheck) {
        if (lastCheckData[clanTag] === todayStr) {
            continue;
        }

        const record = wwData[clanTag];

        // Check FWA Weight Reminder (25 days ago)
        if (record && record.lastUpdated) {
            let diffDays = -1;
            const match = record.lastUpdated.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (match) {
                const [_, dayStr, monthStr, yearStr] = match;
                const d = parseInt(dayStr, 10);
                const m = parseInt(monthStr, 10);
                const y = parseInt(yearStr, 10);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const subDate = new Date(y, m - 1, d);
                subDate.setHours(0, 0, 0, 0);
                const diffMs = today.getTime() - subDate.getTime();
                diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            }

            const tagMatch = clanTag.match(/#([A-Z0-9]+)/i);
            const cleanTag = tagMatch ? tagMatch[1].toUpperCase() : clanTag.replace("#", "").toUpperCase();
            const normalizedClanTag = `#${cleanTag}`;
            const roleData = clanRoles[normalizedClanTag] || clanRoles[clanTag];

            if (diffDays === 25) {
                if (roleData) {
                    const targetChannelId = roleData.leadChannelId && roleData.leadChannelId.trim() !== ""
                        ? roleData.leadChannelId
                        : roleData.channelId;
                    if (targetChannelId) {
                        try {
                            const channel = await client.channels.fetch(targetChannelId).catch(() => null);
                            if (channel) {
                                const leaderRolePing = roleData.leaderRoleId ? `<@&${roleData.leaderRoleId}>` : "";
                                const submissionUrl = `https://fwastats.com/Clan/${cleanTag}/Weight`;

                                const alaramEmoji = emojiUtils.getEmoji("alaram") || "⏰";
                                const arrowEmoji = emojiUtils.getEmoji("arrow") || "➡️";
                                const heartEmoji = emojiUtils.getEmoji("heart") || "❤️";

                                const reminderEmbed = new EmbedBuilder()
                                    .setTitle(`${alaramEmoji} **War Weight Submission Reminder**`)
                                    .setDescription(
                                        `Hey Cheif ,\n` +
                                        `the war weight submission done before 25 days  this is just a reminder , make sure submit it on time \n\n` +
                                        `**Submission Link :** ${arrowEmoji} [Click here](${submissionUrl})\n\n` +
                                        `Yours Truly\n` +
                                        `${heartEmoji} **Blood Team**`
                                    )
                                    .setColor("Orange")
                                    .setTimestamp();

                                const submittedBtn = new ButtonBuilder()
                                    .setCustomId(`ww_submit_update_${cleanTag}`)
                                    .setLabel("Submitted")
                                    .setStyle(ButtonStyle.Success)
                                    .setEmoji(emojiUtils.getEmojiObject("gtick") || "✅");
                                const btnRow = new ActionRowBuilder().addComponents(submittedBtn);

                                await channel.send({
                                    content: leaderRolePing,
                                    embeds: [reminderEmbed],
                                    components: [btnRow]
                                });
                            }
                        } catch (sendErr) {
                            console.error(`Failed to send reminder for ${clanTag}:`, sendErr);
                        }
                    }
                }
            } else if (diffDays === 27) {
                if (roleData) {
                    const targetChannelId = roleData.leadChannelId && roleData.leadChannelId.trim() !== ""
                        ? roleData.leadChannelId
                        : roleData.channelId;
                    if (targetChannelId) {
                        try {
                            const channel = await client.channels.fetch(targetChannelId).catch(() => null);
                            if (channel) {
                                const leaderRolePing = roleData.leaderRoleId ? `<@&${roleData.leaderRoleId}>` : "";
                                
                                const lazyEmbed = new EmbedBuilder()
                                    .setTitle(`⚠️ **War Weight Submission Overdue**`)
                                    .setDescription(`I think you guys are lazy to submit war weight 😭`)
                                    .setColor("Red")
                                    .setTimestamp();
                                    
                                await channel.send({
                                    content: leaderRolePing,
                                    embeds: [lazyEmbed]
                                });
                            }
                        } catch (sendErr) {
                            console.error(`Failed to send overdue reminder for ${clanTag}:`, sendErr);
                        }
                    }
                }
            }
        }

        // Mark as checked today
        lastCheckData[clanTag] = todayStr;
        lastCheckUpdated = true;
    }

    if (lastCheckUpdated) {
        try {
            fs.writeFileSync(lastCheckPath, JSON.stringify(lastCheckData, null, 2), "utf8");
        } catch (err) {
            console.error("checkFWAWeights lastCheck write error:", err);
        }
    }
}

fwaClanData.checkFWAWeights = checkFWAWeights;
module.exports = fwaClanData;
