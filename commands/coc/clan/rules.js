const { EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");

let assignClanModule = null;
try {
    assignClanModule = require("../../discord/tickets/assignclan.js");
} catch (err) {
    console.error("[Rules Command] Could not require assignclan.js:", err.message);
}

const DEFAULT_CLAN_RULES = [
    "Be active daily and participate in wars and CWL.",
    "Always use both war attacks — missing attacks may lead to demotion.",
    "Donate correct troops only as requested.",
    "Respect all members — teamwork builds victory.",
    "No rushed bases allowed in main clan — use feeder clans if needed.",
    "Maintain a healthy competitive spirit, no toxicity."
];

/**
 * Fallback builder for clan rules embed if assignclan module isn't available
 */
function fallbackBuildClanRulesEmbed(clanTag, clanData, clanConfig, context) {
    try {
        const dataManager = context?.data;
        let allRules = null;
        if (dataManager && typeof dataManager.getClanRules === "function") {
            try {
                allRules = dataManager.getClanRules();
            } catch (_) {}
        }
        if (!allRules) {
            const dataPath = path.join(__dirname, "../../../data/clanrules.json");
            try {
                if (fs.existsSync(dataPath)) {
                    allRules = JSON.parse(fs.readFileSync(dataPath, "utf8"));
                }
            } catch (_) {}
        }

        const tagWithHash = (clanTag || clanData?.tag || "").toUpperCase();
        const cleanTag = tagWithHash.replace(/^#/, "");
        const nick = (clanConfig?.nickName || "").toUpperCase();

        const defaultConf = allRules?.default || {
            title: "{clanName} Rules",
            rules: DEFAULT_CLAN_RULES,
            color: "#E74C3C"
        };
        const clansMap = allRules?.clans || allRules || {};

        let specificConf = null;
        if (tagWithHash && clansMap[tagWithHash]) {
            specificConf = clansMap[tagWithHash];
        } else if (cleanTag && clansMap[cleanTag]) {
            specificConf = clansMap[cleanTag];
        } else if (nick && clansMap[nick]) {
            specificConf = clansMap[nick];
        } else if (tagWithHash && clansMap["#" + cleanTag]) {
            specificConf = clansMap["#" + cleanTag];
        }

        if (!specificConf && clansMap && typeof clansMap === "object") {
            const targetCleanTag = cleanTag.toUpperCase();
            const targetNick = nick.toUpperCase();
            const targetName = (clanData?.name || clanConfig?.name || "").toUpperCase();
            for (const [key, val] of Object.entries(clansMap)) {
                if (key === "default" || !val || typeof val !== "object") continue;
                const keyClean = key.toUpperCase().replace(/^#/, "");
                const valNick = (val.nickName || "").toUpperCase();
                const valName = (val.name || "").toUpperCase();
                if (
                    (targetCleanTag && keyClean === targetCleanTag) ||
                    (targetNick && valNick === targetNick) ||
                    (targetName && (valName === targetName || valNick === targetName)) ||
                    (targetNick && valName === targetNick)
                ) {
                    specificConf = val;
                    break;
                }
            }
        }

        let rules = (specificConf && Array.isArray(specificConf.rules) && specificConf.rules.length > 0)
            ? specificConf.rules
            : (defaultConf && Array.isArray(defaultConf.rules) && defaultConf.rules.length > 0 ? defaultConf.rules : DEFAULT_CLAN_RULES);

        const emojiUtils = context?.emoji;
        let blackdot = (emojiUtils && typeof emojiUtils.getEmoji === "function") ? emojiUtils.getEmoji("blackdot") : "";
        if (!blackdot) blackdot = "•";

        const clanName = clanData?.name || clanConfig?.name || clanConfig?.nickName || (clanTag ? "Clan" : "Blood Alliance");
        let rawTitle = specificConf?.title || defaultConf?.title || "{clanName} Rules";
        let title = rawTitle.replace(/\{clan(name)?\}/gi, clanName);
        if (title.trim().toLowerCase() === "clan rules") {
            title = `${clanName} Rules`;
        }
        if (title.length > 256) {
            title = title.slice(0, 253) + "...";
        }

        let validRules = rules
            .filter(r => typeof r === "string" && r.trim().length > 0)
            .map(r => `${blackdot} ${r.trim()}`);
        if (validRules.length === 0) {
            validRules = DEFAULT_CLAN_RULES.map(r => `${blackdot} ${r}`);
        }

        let description = validRules.join("\n\n");
        if (description.length > 4096) {
            description = validRules.join("\n");
            if (description.length > 4096) description = description.slice(0, 4093) + "...";
        }

        let embedColor = 0xE74C3C;
        const colorVal = specificConf?.color || defaultConf?.color;
        if (colorVal) {
            if (typeof colorVal === "number") {
                embedColor = colorVal;
            } else if (typeof colorVal === "string") {
                const cleaned = colorVal.startsWith("#") ? colorVal : `#${colorVal}`;
                if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) embedColor = cleaned;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor);

        const extractImage = (conf) => {
            if (!conf || typeof conf !== "object") return "";
            const possible = [
                conf.image,
                conf.imageUrl,
                conf.image_url,
                conf.banner,
                conf.bannerUrl,
                conf.banner_url,
                conf.footerImage,
                conf.footer_image,
                conf.pic
            ];
            for (const img of possible) {
                if (typeof img === "string" && img.trim().startsWith("http")) return img.trim();
            }
            return "";
        };

        const extractThumbnail = (conf) => {
            if (!conf || typeof conf !== "object") return "";
            const possible = [
                conf.thumbnail,
                conf.thumbnailUrl,
                conf.thumbnail_url,
                conf.thumb,
                conf.logo,
                conf.icon,
                conf.iconURL,
                conf.icon_url
            ];
            for (const thumb of possible) {
                if (typeof thumb === "string" && thumb.trim().startsWith("http")) return thumb.trim();
            }
            return "";
        };

        const extractFooterText = (conf) => {
            if (!conf || typeof conf !== "object") return "";
            const possible = [
                typeof conf.footer === "string" ? conf.footer : (conf.footer?.text || null),
                conf.footerText,
                conf.footer_text
            ];
            for (const txt of possible) {
                if (typeof txt === "string" && txt.trim().length > 0) return txt.trim();
            }
            return "";
        };

        const extractFooterIcon = (conf) => {
            if (!conf || typeof conf !== "object") return "";
            const possible = [
                typeof conf.footer === "object" ? (conf.footer?.iconURL || conf.footer?.icon_url) : null,
                conf.footerIcon,
                conf.footer_icon
            ];
            for (const icon of possible) {
                if (typeof icon === "string" && icon.trim().startsWith("http")) return icon.trim();
            }
            return "";
        };

        const pictureUrl = extractImage(specificConf) || extractImage(defaultConf);
        if (pictureUrl) {
            embed.setImage(pictureUrl);
        }

        let thumbnailUrl = extractThumbnail(specificConf) || extractThumbnail(defaultConf);
        if (!thumbnailUrl && clanData?.badgeUrls) {
            thumbnailUrl = clanData.badgeUrls.large || clanData.badgeUrls.medium || clanData.badgeUrls.small || "";
        }
        if (thumbnailUrl && typeof thumbnailUrl === "string" && thumbnailUrl.trim().startsWith("http")) {
            embed.setThumbnail(thumbnailUrl.trim());
        }

        const rawFooterText = extractFooterText(specificConf) || extractFooterText(defaultConf);
        const footerIcon = extractFooterIcon(specificConf) || extractFooterIcon(defaultConf);

        if (rawFooterText || footerIcon) {
            const footerText = (rawFooterText || `${clanName} Rules`).replace(/\{clan(name)?\}/gi, clanName);
            embed.setFooter({
                text: footerText.slice(0, 2048),
                iconURL: footerIcon || undefined
            });
        }

        return embed;
    } catch (err) {
        console.error("[Rules Command] Error in fallbackBuildClanRulesEmbed:", err);
        return null;
    }
}

function getRulesEmbed(clanTag, clanData, clanConfig, context) {
    if (assignClanModule && typeof assignClanModule.buildClanRulesEmbed === "function") {
        try {
            const embed = assignClanModule.buildClanRulesEmbed(clanTag, clanData, clanConfig, context, { includeThumbnail: true });
            if (embed) return embed;
        } catch (err) {
            console.error("[Rules Command] Error calling assignclan.buildClanRulesEmbed:", err.message);
        }
    }
    return fallbackBuildClanRulesEmbed(clanTag, clanData, clanConfig, context);
}

module.exports = {
    name: "r",
    aliases: ["rules"],
    description: "Display the rules embed for a clan by nickname or tag",

    async execute(message, args, context) {
        const { data: dataManager, coc, config } = context;
        const prefix = context.prefix || config?.PREFIX || ";";

        const clanInput = Array.isArray(args) && args.length > 0 ? args.join(" ").trim() : null;
        const clanRoles = (dataManager && typeof dataManager.getClanRoles === "function") ? dataManager.getClanRoles() : {};

        // If no clan nickname/tag provided or requested alliance/default rules, display general alliance rules
        if (!clanInput || ["alliance", "default", "all"].includes(clanInput.toLowerCase())) {
            const rulesEmbed = getRulesEmbed(null, null, null, context);
            if (rulesEmbed) {
                const availableNicks = Object.values(clanRoles)
                    .map(c => c.nickName)
                    .filter(Boolean)
                    .sort();
                if (availableNicks.length > 0 && !clanInput) {
                    const currentFooter = rulesEmbed.data.footer?.text || "";
                    const footerSuffix = `Tip: Use ${prefix}r <clan> (e.g. ${prefix}r ${availableNicks[0].toLowerCase()})`;
                    rulesEmbed.setFooter({
                        text: currentFooter ? `${currentFooter} • ${footerSuffix}`.slice(0, 2048) : footerSuffix,
                        iconURL: rulesEmbed.data.footer?.icon_url
                    });
                }
                return message.channel.send({ embeds: [rulesEmbed] });
            }
        }

        const cleanInput = clanInput.toUpperCase();
        let clanTag = null;
        let clanConfig = null;

        // 1. Search in clanrole.json by nickname
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.nickName && info.nickName.toUpperCase() === cleanInput) {
                clanTag = tag;
                clanConfig = info;
                break;
            }
        }

        // 2. Search in clanrole.json by tag
        if (!clanTag) {
            const formattedTag = cleanInput.startsWith("#") ? cleanInput : "#" + cleanInput;
            if (clanRoles[formattedTag]) {
                clanTag = formattedTag;
                clanConfig = clanRoles[formattedTag];
            }
        }

        // 3. Fallback: Search in clanrules.json
        if (!clanTag) {
            let rawRules = null;
            if (dataManager && typeof dataManager.getClanRules === "function") {
                try {
                    rawRules = dataManager.getClanRules();
                } catch (_) {}
            }
            const clansMap = rawRules?.clans || {};
            for (const [tag, ruleInfo] of Object.entries(clansMap)) {
                const nick = (ruleInfo.nickName || "").toUpperCase();
                const name = (ruleInfo.name || "").toUpperCase();
                const tagFormatted = (tag.startsWith("#") ? tag : "#" + tag).toUpperCase();
                const inputTagFormatted = cleanInput.startsWith("#") ? cleanInput : "#" + cleanInput;

                if (nick === cleanInput || name === cleanInput || tagFormatted === inputTagFormatted) {
                    clanTag = tagFormatted;
                    clanConfig = ruleInfo;
                    break;
                }
            }
        }

        if (!clanTag) {
            const availableNicks = Object.values(clanRoles)
                .map(c => c.nickName)
                .filter(Boolean)
                .sort();
            const nicksList = availableNicks.length > 0 ? `\n\n**Available clans:** \`${availableNicks.join("`, `")}\`` : "";
            return message.channel.send(`❌ Clan "${clanInput}" was not found in registered clans.${nicksList}`);
        }

        // Fetch live clan data from CoC API if available to populate official clan name
        let clanData = null;
        if (coc && typeof coc.getClan === "function") {
            try {
                clanData = await coc.getClan(clanTag);
            } catch (_) {
                // Ignore API maintenance or temporary network failures
            }
        }
        if (!clanData) {
            clanData = {
                tag: clanTag,
                name: clanConfig?.name || clanConfig?.nickName || clanTag
            };
        }

        const rulesEmbed = getRulesEmbed(clanTag, clanData, clanConfig, context);
        if (!rulesEmbed) {
            return message.channel.send("⚠️ Could not generate the clan rules embed.");
        }

        return message.channel.send({ embeds: [rulesEmbed] });
    }
};
