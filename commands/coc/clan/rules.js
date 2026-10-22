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
            const rulesPath = path.join(__dirname, "../../../data/clanrules.json");
            if (fs.existsSync(rulesPath)) {
                allRules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
            }
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

        let specificConf = clansMap[tagWithHash] || clansMap[cleanTag] || (nick && clansMap[nick]) || (tagWithHash && clansMap["#" + cleanTag]);

        let rules = (specificConf && Array.isArray(specificConf.rules) && specificConf.rules.length > 0)
            ? specificConf.rules
            : (defaultConf && Array.isArray(defaultConf.rules) && defaultConf.rules.length > 0 ? defaultConf.rules : DEFAULT_CLAN_RULES);

        const emojiUtils = context?.emoji;
        let blackdot = (emojiUtils && typeof emojiUtils.getEmoji === "function") ? emojiUtils.getEmoji("blackdot") : "";
        if (!blackdot) blackdot = "•";

        const clanName = clanData?.name || clanConfig?.name || clanConfig?.nickName || "Clan";
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

        const pictureUrl = specificConf?.image || specificConf?.banner || defaultConf?.image || defaultConf?.banner;
        if (pictureUrl && typeof pictureUrl === "string" && pictureUrl.trim().startsWith("http")) {
            embed.setImage(pictureUrl.trim());
        }

        const rawFooterText = (typeof specificConf?.footer === "string" ? specificConf.footer : specificConf?.footer?.text) || specificConf?.footerText || (typeof defaultConf?.footer === "string" ? defaultConf.footer : defaultConf?.footer?.text) || defaultConf?.footerText;
        const footerIcon = (typeof specificConf?.footer === "object" ? (specificConf.footer?.iconURL || specificConf.footer?.icon_url) : null) || specificConf?.footerIcon || (typeof defaultConf?.footer === "object" ? (defaultConf.footer?.iconURL || defaultConf.footer?.icon_url) : null) || defaultConf?.footerIcon;

        if (rawFooterText || footerIcon) {
            const footerText = (rawFooterText || `${clanName} Rules`).replace(/\{clan(name)?\}/gi, clanName);
            embed.setFooter({
                text: footerText.slice(0, 2048),
                iconURL: (footerIcon && typeof footerIcon === "string" && footerIcon.trim().startsWith("http")) ? footerIcon.trim() : undefined
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
            const embed = assignClanModule.buildClanRulesEmbed(clanTag, clanData, clanConfig, context);
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

        // If no clan nickname/tag provided, send a friendly prompt with available clan nicknames
        if (!clanInput) {
            const availableNicks = Object.values(clanRoles)
                .map(c => c.nickName)
                .filter(Boolean)
                .sort();
            const nicksList = availableNicks.length > 0 ? `\n\n**Available clans:** \`${availableNicks.join("`, `")}\`` : "";
            return message.channel.send(`⚠️ Please provide a clan nickname or tag. Example: \`${prefix}r bb\`${nicksList}`);
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
            return message.channel.send(`❌ Clan "${clanInput}" was not found in registered clans.`);
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
