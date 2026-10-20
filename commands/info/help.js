const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ComponentType,
    MessageFlags
} = require("discord.js");
const { getEmojiObject } = require("../../utils/emoji.js");

// ─────────────────────────────────────────────────────────────
// Permission Checkers
// ─────────────────────────────────────────────────────────────

function hasAnyRole(member, roleIds) {
    if (!member || !member.roles || !member.roles.cache) return false;
    const allowed = (roleIds || []).map(r => r?.toString().trim()).filter(Boolean);
    if (allowed.length === 0) return false;
    if (typeof member.roles.cache.some === "function") {
        return member.roles.cache.some(r => allowed.includes(r.id));
    }
    if (typeof member.roles.cache[Symbol.iterator] === "function") {
        for (const [id] of member.roles.cache) {
            if (allowed.includes(id)) return true;
        }
    }
    return false;
}

function isAdminMember(member, config) {
    if (!member) return false;
    if (member.permissions && typeof member.permissions.has === "function" && member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    return hasAnyRole(member, config?.ADMIN_ROLE_IDS);
}

function isModMember(member, config) {
    if (!member) return false;
    if (isAdminMember(member, config)) return true;
    if (member.permissions && typeof member.permissions.has === "function") {
        if (
            member.permissions.has(PermissionFlagsBits.BanMembers) ||
            member.permissions.has(PermissionFlagsBits.KickMembers) ||
            member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
            member.permissions.has(PermissionFlagsBits.ManageMessages)
        ) {
            return true;
        }
    }
    const modRoles = [
        ...(config?.ADMIN_ROLE_IDS || []),
        ...(config?.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0].trim()] : []),
        ...(config?.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1].trim()] : [])
    ];
    return hasAnyRole(member, modRoles);
}

function isStaffMember(member, config) {
    if (!member) return false;
    if (isAdminMember(member, config)) return true;
    const staffRoles = [
        ...(config?.ADMIN_ROLE_IDS || []),
        ...(config?.STAFF_ROLE_IDS || []),
        ...(config?.ALL_STAFF_ROLE_IDS || []),
        config?.ALL_LEAD_ROLE_ID,
        config?.ALL_LEADS_ID,
        config?.TRAINEE_ROLE_ID,
        config?.CWL_STAFF_ROLE_ID
    ];
    return hasAnyRole(member, staffRoles) || (member.permissions && typeof member.permissions.has === "function" && member.permissions.has(PermissionFlagsBits.ManageRoles));
}

function isLeaderMember(member, config) {
    if (!member) return false;
    if (isAdminMember(member, config)) return true;
    if (isStaffMember(member, config)) return true;
    const leaderRoles = [
        config?.ALL_LEAD_ROLE_ID,
        config?.ALL_LEADS_ID,
        process.env.ALL_LEAD_ROLE_ID,
        process.env.ALL_LEADS_ID
    ];
    if (hasAnyRole(member, leaderRoles)) return true;
    if (member.roles && member.roles.cache) {
        if (typeof member.roles.cache.some === "function") {
            return member.roles.cache.some(r => {
                const name = (r.name || "").toLowerCase();
                return name.includes("lead") || name.includes("co-lead");
            });
        }
        if (typeof member.roles.cache[Symbol.iterator] === "function") {
            for (const item of (member.roles.cache.values ? member.roles.cache.values() : member.roles.cache)) {
                const name = (item?.name || "").toLowerCase();
                if (name.includes("lead") || name.includes("co-lead")) return true;
            }
        }
    }
    return false;
}

// ─────────────────────────────────────────────────────────────
// Command Categories (Accurate names & code-verified descriptions)
// ─────────────────────────────────────────────────────────────

const normalCommands = [
    {
        name: "link",
        description: "Link your Clash of Clans account (or force-link by @user or User ID)",
        usage: "{p}link #TAG or {p}link @user/#ID #TAG",
        aliases: [],
        example: "{p}link 1153720899715993681 #YQGQQYGV",
        details: "Link your Clash of Clans player account to your Discord user. Admins can force-link by mentioning a user or providing their Discord User ID."
    },
    {
        name: "unlink",
        description: "Unlink your Clash of Clans account (or force-unlink by @user or User ID)",
        usage: "{p}unlink [#TAG] or {p}unlink @user/#ID [#TAG]",
        aliases: [],
        example: "{p}unlink 1153720899715993681 #YQGQQYGV",
        details: "Remove the link between a Clash of Clans account and Discord. Admins can force-unlink by mentioning a user or providing their Discord User ID."
    },
    {
        name: "profile",
        description: "View your linked Clash of Clans accounts and statistics",
        usage: "{p}profile [@user/#TAG]",
        aliases: ["p"],
        example: "{p}profile",
        details: "Display linked accounts, hero levels, badges, trophies, and in-game details. You can view your own profile, mention a user, or specify a tag."
    },
    {
        name: "player",
        description: "Show visual Clash of Clans player profile card",
        usage: "{p}player [@user/#TAG]",
        aliases: [],
        example: "{p}player #YQGQQYGV",
        details: "Show a visual player card for a Clash of Clans account with Town Hall, heroes, trophies, and clan status."
    },
    {
        name: "clan",
        description: "Show clan information, family categories, and statistics",
        usage: "{p}clan [tag]",
        aliases: ["clans"],
        example: "{p}clan #2QG2C889",
        details: "View detailed statistics for any clan, including member count, trophy requirements, war status, CWL league, and leaders."
    },
    {
        name: "compo",
        description: "Show Town Hall composition breakdown of a clan",
        usage: "{p}compo [#TAG/all]",
        aliases: [],
        example: "{p}compo #2QG2C889",
        details: "Display the breakdown of Town Hall levels for a specific clan or all tracked alliance clans."
    },
    {
        name: "bases",
        description: "Show FWA base layout links with direct in-game copy links",
        usage: "{p}bases",
        aliases: [],
        example: "{p}bases",
        details: "Get active Farm War Alliance (FWA) base design links for every Town Hall level to open directly in-game."
    },
    {
        name: "fwa",
        description: "Information and beginner guide about Farm War Alliance (FWA)",
        usage: "{p}fwa",
        aliases: [],
        example: "{p}fwa",
        details: "Comprehensive guide about Farm War Alliance (FWA), war rules, mirror attacks, lottery system, and easy loot farming."
    },
    {
        name: "cwl",
        description: "Information about Lazy CWL strategy and alliance placement",
        usage: "{p}cwl",
        aliases: [],
        example: "{p}cwl",
        details: "Information and rules regarding Lazy CWL, dual participation, and earning CWL medals."
    },
    {
        name: "warweight",
        description: "Instructions and interactive calculator for CoC war weight",
        usage: "{p}warweight",
        aliases: ["war"],
        example: "{p}warweight",
        details: "Step-by-step instructions and interactive calculator for checking your village war weight."
    },
    {
        name: "ww",
        description: "Get FWA war weight report and player weights for a clan",
        usage: "{p}ww <#TAG/nickname>",
        aliases: [],
        example: "{p}ww #2QG2C889",
        details: "Calculate and generate a paginated FWA war weight roster for all players in a clan."
    },
    {
        name: "rww",
        description: "Get clan Town Hall composition comparison (live API vs WW)",
        usage: "{p}rww <#TAG/nickname>",
        aliases: [],
        example: "{p}rww #2QG2C889",
        details: "Overview of a clan's Town Hall distribution combined with war weight values."
    },
    {
        name: "ping",
        description: "Check bot latency, websocket heartbeat, and system status",
        usage: "{p}ping",
        aliases: [],
        example: "{p}ping",
        details: "Check bot response latency, Discord API websocket ping, and system status."
    },
    {
        name: "help",
        description: "Display available commands and detailed command usage",
        usage: "{p}help [command]",
        aliases: ["h"],
        example: "{p}help profile",
        details: "Display the commands overview or detailed help for a specific command."
    }
];

const leaderCommands = [
    {
        name: "strikeadd",
        description: "Add a strike to a player",
        usage: "/strikeadd tag:#TAG reason:<text>",
        aliases: [],
        example: "/strikeadd tag:#YQGQQYGV reason:Missed war attack",
        details: "Log an official strike against a player for rule violations."
    },
    {
        name: "strike-remove",
        description: "Remove a strike from a player",
        usage: "/strike-remove tag:#TAG index:<number>",
        aliases: ["strikeremove"],
        example: "/strike-remove tag:#YQGQQYGV index:1",
        details: "Remove an active strike entry from a player's record."
    },
    {
        name: "strike-list",
        description: "View strike list for a player or clan",
        usage: "/strike-list [tag:#TAG]",
        aliases: ["strikelist"],
        example: "/strike-list tag:#YQGQQYGV",
        details: "Display all recorded strikes and violation histories."
    },
    {
        name: "as",
        description: "Check Clash of Clans base and assign clan roles",
        usage: "{p}as <#TAG/@user>",
        aliases: [],
        example: "{p}as @Member",
        details: "Check a user's Clash of Clans base and assign the appropriate clan roles."
    },
    {
        name: "reapply",
        description: "Process clan leave and assign re-apply roles for a member",
        usage: "/reapply member:@user",
        aliases: ["re"],
        example: "/reapply member:@Member",
        details: "Process clan leave, strip existing clan roles, and assign re-apply roles."
    },
    {
        name: "clan-members",
        description: "Manage clan members list and interactive roster inspector",
        usage: "/clan-members clan:<tag>",
        aliases: [],
        example: "/clan-members clan:#2QG2C889",
        details: "Interactive roster inspector for all members in a clan."
    },
    {
        name: "clan-cc",
        description: "Get CC links for all clan members, separated by linked status",
        usage: "/clan-cc clan:<tag>",
        aliases: ["clancc"],
        example: "/clan-cc clan:#2QG2C889",
        details: "Roster breakdown grouped by leadership and Town Hall levels with Clash of Stats links."
    },
    {
        name: "scan-clan",
        description: "Scan war roster for an FWA clan — linked vs unlinked members",
        usage: "/scan-clan clantag:<clan/tag>",
        aliases: [],
        example: "/scan-clan clantag:#2QG2C889",
        details: "Scan current war members of an FWA clan and identify linked vs unlinked players."
    },
    {
        name: "claninfo",
        description: "Get detailed clan info, war stats, and FWA association",
        usage: "/claninfo [clan:<tag>]",
        aliases: [],
        example: "/claninfo clan:#2QG2C889",
        details: "Fetch official FWA points balance, sync group, and live statistics for a clan."
    },
    {
        name: "family-clans",
        description: "Shows the list of FWA, War, or CWL clans",
        usage: "/family-clans category:<fwa/war/cwl>",
        aliases: [],
        example: "/family-clans category:fwa",
        details: "Categorized clan browser with quick links and member capacities."
    },
    {
        name: "weight",
        description: "Check if a player is rushed based on war weight",
        usage: "/weight [user:@user]",
        aliases: [],
        example: "/weight user:@Member",
        details: "Evaluate village offense and defense weight to determine rushed status."
    },
    {
        name: "war_search",
        description: "Check the current war status of alliance clans",
        usage: "/war_search clans:<ALL/clan>",
        aliases: [],
        example: "/war_search clans:ALL",
        details: "Scan current live war matches across all FWA clans."
    },
    {
        name: "post-recruitment",
        description: "Manually post a recruitment ad for a clan",
        usage: "/post-recruitment clan:<tag> th:<levels>",
        aliases: ["postrecruitment"],
        example: "/post-recruitment clan:#2QG2C889 th:15,16",
        details: "Post a formatted clan recruitment advertisement into designated recruitment channels."
    },
    {
        name: "edit-recruitment",
        description: "Edit an active recruitment post for a clan",
        usage: "/edit-recruitment clan:<tag>",
        aliases: ["editrecruitment"],
        example: "/edit-recruitment clan:#2QG2C889",
        details: "Update requirements or text of an active clan recruitment post."
    },
    {
        name: "playerlookup",
        description: "Lookup a player by tag or Discord user with account selection dropdown",
        usage: "/playerlookup [tag:#TAG] [user:@user]",
        aliases: [],
        example: "/playerlookup user:@Member",
        details: "Detailed interactive player lookup with account selector."
    },
    {
        name: "playeraccounts",
        description: "Shows linked Clash of Clans accounts for a user",
        usage: "/playeraccounts [discorduser:@user]",
        aliases: [],
        example: "/playeraccounts discorduser:@Member",
        details: "List all Clash of Clans accounts associated with a Discord user."
    },
    {
        name: "<clan-nickname>",
        description: "Force assign clan roles and nickname without verification (e.g. {p}bb @user)",
        usage: "{p}<clan-nickname> @user",
        aliases: ["forceclan", "force-clan"],
        example: "{p}bb @Member",
        details: "Force assign clan roles and nickname to a user using their clan nickname (e.g., ;bb @user) without requiring in-game clan verification."
    }
];

const staffCommands = [
    {
        name: "check",
        description: "Inspect player base, clash profile, strikes, and links",
        usage: "{p}cc <#TAG/@user>",
        aliases: ["cc"],
        example: "{p}cc #YQGQQYGV",
        details: "Inspect a player's base details, linked accounts, ban status, and strikes."
    },
    {
        name: "check-clan",
        description: "Check clan descriptions for Blood Alliance requirements",
        usage: "/check-clan [clan:<tag>]",
        aliases: [],
        example: "/check-clan",
        details: "Verify whether alliance clans meet description and tag guidelines."
    },
    {
        name: "link-summary",
        description: "Summary of linked, unlinked, and duplicate accounts for all clans",
        usage: "/link-summary",
        aliases: [],
        example: "/link-summary",
        details: "Get a comprehensive summary of linked, unlinked, and duplicate accounts across all clans."
    },
    {
        name: "linkcheck",
        description: "Show linked members, unlinked members, and members not in server",
        usage: "{p}linkcheck",
        aliases: [],
        example: "{p}linkcheck",
        details: "Inspect server members without linked accounts or linked accounts not in the server."
    },
    {
        name: "discord-links",
        description: "List all clan players and check if linked",
        usage: "/discord-links clantag:<tag>",
        aliases: [],
        example: "/discord-links clantag:#2QG2C889",
        details: "Display complete clan roster showing linking status for each member."
    },
    {
        name: "check-role",
        description: "Check Discord users with Clan Member role not in the clan",
        usage: "/check-role",
        aliases: [],
        example: "/check-role",
        details: "Identify Discord members holding a Clan Member role who are no longer inside that clan."
    },
    {
        name: "role-refresh",
        description: "Re-check and sync alliance roles for a user",
        usage: "/role-refresh [user:@user]",
        aliases: ["refreshrole"],
        example: "/role-refresh user:@Member",
        details: "Scan a member's linked accounts and sync their clan roles and nicknames."
    },
    {
        name: "wwpanel",
        description: "Post the FWA War Weight Panel with clan selector",
        usage: "/wwpanel",
        aliases: [],
        example: "/wwpanel",
        details: "Send an interactive war weight calculator panel with clan dropdown into the channel."
    },
    {
        name: "sync",
        description: "Manual war sync check and starter vote monitoring",
        usage: "{p}sync",
        aliases: [],
        example: "{p}sync",
        details: "Trigger and inspect current war sync status across all alliance clans."
    },
    {
        name: "wel",
        description: "Send welcome messages and test canvas welcome card",
        usage: "{p}wel [@user] [count]",
        aliases: [],
        example: "{p}wel @Member",
        details: "Test or verify welcome banner generator and member join card processes."
    },
    {
        name: "war_mail",
        description: "Send war mail with a specified decision to a clan's mail channel",
        usage: "/war_mail clan:<tag/name> decision:<win/lose/mis/bl>",
        aliases: [],
        example: "/war_mail clan:BB decision:win",
        details: "Dispatch an official war outcome notice to the clan's Discord mail channel."
    },
    {
        name: "send-fwamails",
        description: "Check the latest war results and send to clan channels",
        usage: "/send-fwamails",
        aliases: ["mail"],
        example: "/send-fwamails",
        details: "Bulk check war outcomes from FWA points API and broadcast match mail to all clans."
    },
    {
        name: "send-warmails",
        description: "Check the latest war results and send to war clan channels",
        usage: "/send-warmails [clan:<tag/name>]",
        aliases: ["warmail"],
        example: "/send-warmails clan:BWC",
        details: "Check live war status from Clash of Clans API and broadcast war match mail to normal war clans."
    },
    {
        name: "checkallwarstest",
        description: "Test war mail without touching live clan channels",
        usage: "/checkallwarstest",
        aliases: [],
        example: "/checkallwarstest",
        details: "Simulate and preview war mail distributions in a private test channel."
    },
    {
        name: "cwl-clan",
        description: "Manage CWL clans",
        usage: "/cwl-clan action:<add/edit>",
        aliases: [],
        example: "/cwl-clan action:edit",
        details: "Add, edit, or toggle active status of CWL participating clans."
    },
    {
        name: "cwl-compo",
        description: "Show townhall composition for CWL clans",
        usage: "/cwl-compo clan:<tag/all>",
        aliases: [],
        example: "/cwl-compo clan:all",
        details: "View Town Hall level distribution for CWL participating clans."
    },
    {
        name: "staff-pannel",
        description: "Show the staff command dashboard panel",
        usage: "/staff-pannel",
        aliases: [],
        example: "/staff-pannel",
        details: "Interactive staff control panel with quick action buttons."
    },
    {
        name: "staff-members",
        description: "Manage staff members for clans",
        usage: "/staff-members",
        aliases: [],
        example: "/staff-members",
        details: "Display all server staff members sorted by clan assignments and hierarchy."
    },
    {
        name: "staff-trainee",
        description: "Manage trainee staff members",
        usage: "/staff-trainee action:<add/remove> user:@user",
        aliases: [],
        example: "/staff-trainee action:add user:@Member",
        details: "Grant or revoke staff trainee status for onboarding."
    },
    {
        name: "staff-summary",
        description: "Displays a weekly summary of tickets claimed by staff members",
        usage: "/staff-summary",
        aliases: [],
        example: "/staff-summary",
        details: "View resolution metrics and ticket activity numbers for staff."
    },
    {
        name: "approve",
        description: "Approve the current ticket application",
        usage: "/approve",
        aliases: [],
        example: "/approve",
        details: "Approve the applicant in the current ticket channel and initiate clan onboarding."
    },
    {
        name: "reject",
        description: "Reject the current ticket application",
        usage: "/reject [reason:<text>]",
        aliases: [],
        example: "/reject reason:Does not meet requirements",
        details: "Reject the applicant in the current ticket channel with reason."
    },
    {
        name: "create-ticket",
        description: "Manually create a ticket for a user (Admin/Staff only)",
        usage: "/create-ticket user:@user",
        aliases: [],
        example: "/create-ticket user:@Member",
        details: "Manually spawn a recruitment or support ticket for a specific user."
    },
    {
        name: "handle-claim",
        description: "Transfer the claim of this ticket to another user",
        usage: "/handle-claim user:@user",
        aliases: [],
        example: "/handle-claim user:@StaffMember",
        details: "Transfer ticket ownership or handler assignment to another staff member."
    },
    {
        name: "set-timer",
        description: "Set an auto-close timer for this ticket",
        usage: "/set-timer hours:<number>",
        aliases: ["settimer"],
        example: "/set-timer hours:12",
        details: "Set an automatic response countdown timer on an active ticket."
    },
    {
        name: "ticketadd",
        description: "Add a user or role to the ticket",
        usage: "/ticketadd target:<@user/@role>",
        aliases: [],
        example: "/ticketadd target:@User",
        details: "Grant a user or role permission to view and participate in the current ticket channel."
    },
    {
        name: "delete-ticket",
        description: "Deletes the existing ticket where the command is used",
        usage: "/delete-ticket",
        aliases: [],
        example: "/delete-ticket",
        details: "Safely close and archive an active ticket channel."
    },
    {
        name: "member",
        description: "Add or remove a member",
        usage: "/member action:<add/remove> user:@user",
        aliases: [],
        example: "/member action:add user:@Member",
        details: "Manage clan member verification and roles in the server."
    },
    {
        name: "set-welcome-th",
        description: "Manage the recruited Town Halls in the welcome message",
        usage: "/set-welcome-th [add:<levels>] [remove:<levels>]",
        aliases: ["setrecruiting"],
        example: "/set-welcome-th add:16,17",
        details: "Update the list of recruiting Town Halls displayed on welcome embeds."
    },
    {
        name: "playercount",
        description: "List all users and the number of accounts they have linked",
        usage: "/playercount",
        aliases: [],
        example: "/playercount",
        details: "Paginated list of server members and their total linked accounts."
    },
    {
        name: "lsweb",
        description: "List all clans stored in the MongoDB database",
        usage: "/lsweb",
        aliases: [],
        example: "/lsweb",
        details: "Display all clans currently saved in the MongoDB database."
    },
    {
        name: "addclantoweb",
        description: "Fetch clan data and store it in MongoDB",
        usage: "/addclantoweb clantag:#TAG",
        aliases: ["clanweb"],
        example: "/addclantoweb clantag:#2QG2C889",
        details: "Add a clan to the external database record."
    },
    {
        name: "removeclanweb",
        description: "Remove a clan from MongoDB database",
        usage: "/removeclanweb clantag:#TAG",
        aliases: [],
        example: "/removeclanweb clantag:#2QG2C889",
        details: "Remove a clan record from MongoDB."
    },
    {
        name: "refresh",
        description: "Refresh all clans data in MongoDB from the Clash of Clans API",
        usage: "/refresh",
        aliases: [],
        example: "/refresh",
        details: "Synchronize all MongoDB clan records with live Clash of Clans API data."
    }
];

const modCommands = [
    {
        name: "setup-clan",
        description: "Configure per-clan Auto Role, Auto Post, and Join/Leave Tracker",
        usage: "/setup-clan",
        aliases: [],
        example: "/setup-clan",
        details: "Interactive setup wizard for configuring clan roles, join tracking, and welcome logs."
    },
    {
        name: "clanentry",
        description: "Add or update a clan entry with role, channels, leaders, and type",
        usage: "/clanentry clantag:<tag> nickname:<name> ...",
        aliases: ["role"],
        example: "/clanentry clantag:#2QG2C889 nickname:BB clanstatus:official",
        details: "Register a clan into the bot with automated roles, channels, and leadership setup."
    },
    {
        name: "clanrevoke",
        description: "Remove a clan entry from the registry",
        usage: "/clanrevoke clan:<tag>",
        aliases: ["crr"],
        example: "/clanrevoke clan:#2QG2C889",
        details: "De-register a clan and remove its associated configuration from the bot."
    },
    {
        name: "updateclanentry",
        description: "Update leadership (Leader/Co-Leaders) for a registered clan",
        usage: "/updateclanentry clan:<tag>",
        aliases: [],
        example: "/updateclanentry clan:#2QG2C889",
        details: "Update the registered leader and co-leader roles for a clan."
    },
    {
        name: "crinfo",
        description: "List linked clan roles and info",
        usage: "{p}crinfo",
        aliases: [],
        example: "{p}crinfo",
        details: "View all configured clan role mappings and active alliance tags."
    },
    {
        name: "update-ww",
        description: "Manage TH war weight thresholds for the test server",
        usage: "/update-ww action:<add/remove/list> ...",
        aliases: [],
        example: "/update-ww action:list",
        details: "Configure expected war weight threshold boundaries for Town Halls."
    },
    {
        name: "updatebase",
        description: "Update an FWA base link for a specific Town Hall level",
        usage: "/updatebase th:<level> link:<url>",
        aliases: [],
        example: "/updatebase th:17 link:https://link.clashofclans.com/...",
        details: "Update the public base design link for a Town Hall level."
    },
    {
        name: "delete",
        description: "Delete messages by count, date range, or user",
        usage: "/delete [amount:<1-1000>] [date:<date>] [user:@user]",
        aliases: [],
        example: "/delete amount:50",
        details: "Bulk delete messages by count, date range, or specific user."
    },
    {
        name: "delc",
        description: "Deletes the current category and all its channels",
        usage: "{p}delc",
        aliases: [],
        example: "{p}delc",
        details: "Quickly delete an entire category and all channels contained within it."
    },
    {
        name: "ban",
        description: "Ban a member from the server",
        usage: "/ban target:@user [reason:<text>] [delete_days:<0-7>]",
        aliases: [],
        example: "/ban target:@User reason:Breaking server rules",
        details: "Permanently ban a member from the Discord server."
    },
    {
        name: "unban",
        description: "Unban a user from the server by their user ID",
        usage: "/unban user_id:<id> [reason:<text>]",
        aliases: [],
        example: "/unban user_id:123456789012345678",
        details: "Remove a ban from a user by their Discord user ID."
    },
    {
        name: "kick",
        description: "Kick a member from the server",
        usage: "/kick target:@user [reason:<text>]",
        aliases: [],
        example: "/kick target:@User reason:Inactivity",
        details: "Kick a user from the server while allowing them to rejoin."
    },
    {
        name: "mute",
        description: "Timeout (mute) a member for a specified duration",
        usage: "/mute target:@user duration:<time> [reason:<text>]",
        aliases: [],
        example: "/mute target:@User duration:1h reason:Spamming",
        details: "Apply a timeout to restrict a member from sending messages."
    },
    {
        name: "unmute",
        description: "Remove timeout (unmute) from a member",
        usage: "/unmute target:@user [reason:<text>]",
        aliases: [],
        example: "/unmute target:@User",
        details: "Lift an active timeout from a member early."
    },
    {
        name: "lockchannel",
        description: "Lock a channel to prevent members from sending messages",
        usage: "/lockchannel [channel:#channel] [reason:<text>]",
        aliases: [],
        example: "/lockchannel",
        details: "Prevent @everyone from sending messages in the specified channel."
    },
    {
        name: "unlockchannel",
        description: "Unlock a channel to allow members to send messages again",
        usage: "/unlockchannel [channel:#channel]",
        aliases: [],
        example: "/unlockchannel",
        details: "Restore normal messaging permissions to a locked channel."
    },
    {
        name: "dm-user",
        description: "Send a direct message to all users with a specific role",
        usage: "/dm-user user:@user message:<text>",
        aliases: [],
        example: "/dm-user user:@User message:Please check your ticket",
        details: "Deliver a private direct message from the bot to a member."
    },
    {
        name: "checkinvite",
        description: "Check the details of a server invite link or code",
        usage: "/checkinvite code:<invite>",
        aliases: [],
        example: "/checkinvite code:bloodalliance",
        details: "Analyze server invite tracking and member referral numbers."
    }
];

const adminCommands = [
    {
        name: "setup-clan",
        description: "Manage per-clan settings: Auto Role, Auto Post, Join/Leave Tracker",
        usage: "/setup-clan",
        aliases: [],
        example: "/setup-clan",
        details: "Interactive setup wizard for configuring clan roles, join tracking, and welcome logs."
    },
    {
        name: "setup-tickets",
        description: "Sends the ticket setup panel",
        usage: "/setup-tickets",
        aliases: [],
        example: "/setup-tickets",
        details: "Configure ticket categories, log channels, and post the ticket application panel."
    },
    {
        name: "clans",
        description: "List all alliance clans, leaders, and co-leaders",
        usage: "{p}clans",
        aliases: [],
        example: "{p}clans",
        details: "List all configured alliance clans, clan types, and leadership rosters."
    },
    {
        name: "crinfo",
        description: "List linked clan roles and info",
        usage: "{p}crinfo",
        aliases: [],
        example: "{p}crinfo",
        details: "View all configured clan role mappings and active alliance tags."
    },
    {
        name: "nickall",
        description: "Update nicknames for all members based on linked accounts",
        usage: "{p}nickall",
        aliases: [],
        example: "{p}nickall",
        details: "Mass update server nicknames for clan members according to their linked in-game names."
    },
    {
        name: "autorolerefresh",
        description: "Re-check and sync roles/nicknames (Admin only)",
        usage: "/autorolerefresh",
        aliases: [],
        example: "/autorolerefresh",
        details: "Trigger a full sync pass of automatic alliance and clan roles."
    },
    {
        name: "syncemoji",
        description: "Re-sync all emojis from Bot Dev Portal",
        usage: "/syncemoji",
        aliases: [],
        example: "/syncemoji",
        details: "Synchronize emojis from the dedicated emoji storage server."
    },
    {
        name: "fetchemoji",
        description: "Fetch clan badges from clanrole.json and add them as emojis",
        usage: "/fetchemoji",
        aliases: [],
        example: "/fetchemoji",
        details: "Fetch clan badges and import them as custom emojis in the server."
    },
    {
        name: "getemojis",
        description: "Get all emojis from Developer Portal and add them to server",
        usage: "{p}getemojis",
        aliases: [],
        example: "{p}getemojis",
        details: "Import application emojis from Dev Portal to server without deleting existing ones."
    },
    {
        name: "clanentry",
        description: "Add or update a clan entry with role, channels, and leaders",
        usage: "/clanentry clantag:<tag> nickname:<name> ...",
        aliases: [],
        example: "/clanentry clantag:#2QG2C889 nickname:BB clanstatus:official",
        details: "Add or update a clan entry with role, channels, leaders, and type."
    },
    {
        name: "clanrevoke",
        description: "Remove a clan entry from the registry",
        usage: "/clanrevoke clan:<tag>",
        aliases: [],
        example: "/clanrevoke clan:#2QG2C889",
        details: "Remove a clan entry from the registry."
    },
    {
        name: "update-ww",
        description: "Manage TH war weight thresholds for test server",
        usage: "/update-ww action:<add/remove/list> ...",
        aliases: [],
        example: "/update-ww action:list",
        details: "Configure expected war weight threshold boundaries for Town Halls."
    },
    {
        name: "checkallwarstest",
        description: "Test war mail distribution to a single test channel",
        usage: "/checkallwarstest",
        aliases: [],
        example: "/checkallwarstest",
        details: "Test war mail distribution to a single test channel without touching live clan channels."
    }
];

// ─────────────────────────────────────────────────────────────
// Embed Builders
// ─────────────────────────────────────────────────────────────

function buildNormalEmbed(prefix, whiteRight, client) {
    const lines = normalCommands.map(cmd => `${whiteRight} \`${cmd.name}\` - ${cmd.description}`);
    const botName = client?.user?.username || "Clash Bot";

    return new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({
            name: `${botName} Commands`,
            iconURL: client?.user?.displayAvatarURL({ dynamic: true }) || null
        })
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `Prefix: ${prefix} • Type ${prefix}help <command> for more info`
        });
}

function buildLeaderEmbed(prefix, whiteRight, client) {
    const lines = leaderCommands.map(cmd => `${whiteRight} \`${cmd.name}\` - ${cmd.description}`);
    const botName = client?.user?.username || "Clash Bot";

    return new EmbedBuilder()
        .setColor(0xF1C40F)
        .setAuthor({
            name: `${botName} — Clan Leader Commands`,
            iconURL: client?.user?.displayAvatarURL({ dynamic: true }) || null
        })
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `Prefix: ${prefix} • Leaders Only • Total: ${leaderCommands.length} commands`
        });
}

function buildStaffEmbed(prefix, whiteRight, client, page = 1) {
    const pageSize = 25;
    const totalPages = Math.ceil(staffCommands.length / pageSize);
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const currentCommands = staffCommands.slice(startIndex, startIndex + pageSize);

    const lines = currentCommands.map(cmd => `${whiteRight} \`${cmd.name}\` - ${cmd.description}`);
    const botName = client?.user?.username || "Clash Bot";

    return new EmbedBuilder()
        .setColor(0x3498DB)
        .setAuthor({
            name: `${botName} — Staff Commands (Page ${currentPage}/${totalPages})`,
            iconURL: client?.user?.displayAvatarURL({ dynamic: true }) || null
        })
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `Prefix: ${prefix} • Page ${currentPage} of ${totalPages} (${staffCommands.length} total) • Type ${prefix}help <command> for more info`
        });
}

function buildModEmbed(prefix, whiteRight, client) {
    const lines = modCommands.map(cmd => `${whiteRight} \`${cmd.name}\` - ${cmd.description}`);
    const botName = client?.user?.username || "Clash Bot";

    return new EmbedBuilder()
        .setColor(0xE67E22)
        .setAuthor({
            name: `${botName} — Moderation Commands`,
            iconURL: client?.user?.displayAvatarURL({ dynamic: true }) || null
        })
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `Prefix: ${prefix} • Moderation Only • Total: ${modCommands.length} commands`
        });
}

function buildAdminEmbed(prefix, whiteRight, client) {
    const lines = adminCommands.map(cmd => `${whiteRight} \`${cmd.name}\` - ${cmd.description}`);
    const botName = client?.user?.username || "Clash Bot";

    return new EmbedBuilder()
        .setColor(0xE74C3C)
        .setAuthor({
            name: `${botName} — Administration Commands`,
            iconURL: client?.user?.displayAvatarURL({ dynamic: true }) || null
        })
        .setDescription(lines.join("\n"))
        .setFooter({
            text: `Prefix: ${prefix} • Administrator Only • Total: ${adminCommands.length} commands`
        });
}

function buildDetailEmbed(cmd, prefix, whiteRight) {
    const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle(`${whiteRight} Command: ${prefix}${cmd.name}`)
        .setDescription(cmd.details || cmd.description)
        .addFields({
            name: "Usage",
            value: `\`${cmd.usage.replace(/\{p\}/g, prefix)}\``,
            inline: true
        });

    if (cmd.aliases && cmd.aliases.length > 0) {
        embed.addFields({
            name: "Aliases",
            value: cmd.aliases.map(a => `\`${prefix}${a}\``).join(", "),
            inline: true
        });
    }

    if (cmd.example) {
        embed.addFields({
            name: "Example",
            value: `\`${cmd.example.replace(/\{p\}/g, prefix)}\``,
            inline: false
        });
    }

    embed.setFooter({ text: `Prefix: ${prefix}` });
    return embed;
}

// ─────────────────────────────────────────────────────────────
// Button Row Builders
// ─────────────────────────────────────────────────────────────

function buildButtonsRow(authorId, currentCategory = null) {
    const row = new ActionRowBuilder();

    // Emoji objects from emoji.js
    const leaderEmoji = getEmojiObject("fwalead") || getEmojiObject("stars") || { name: "⭐" };
    const staffEmoji = getEmojiObject("sheild") || { name: "🛡️" };
    const modEmoji = getEmojiObject("cocfight") || { name: "🔨" };
    const adminEmoji = getEmojiObject("crown") || { name: "👑" };

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`help_btn_leaders_${authorId}`)
            .setLabel("Leaders")
            .setEmoji(leaderEmoji)
            .setStyle(currentCategory === "leaders" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`help_btn_staff_${authorId}`)
            .setLabel("Staff")
            .setEmoji(staffEmoji)
            .setStyle(currentCategory === "staff" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`help_btn_mod_${authorId}`)
            .setLabel("Mod")
            .setEmoji(modEmoji)
            .setStyle(currentCategory === "mod" ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`help_btn_admin_${authorId}`)
            .setLabel("Admin")
            .setEmoji(adminEmoji)
            .setStyle(currentCategory === "admin" ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );

    return row;
}

function buildStaffPageButtons(authorId, page = 1) {
    const pageSize = 25;
    const totalPages = Math.ceil(staffCommands.length / pageSize);
    const leftEmoji = getEmojiObject("larrow") || { name: "◀" };
    const rightEmoji = getEmojiObject("rarrow") || { name: "▶" };

    const pageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`help_staff_prev_${authorId}_${page}`)
            .setLabel("Prev")
            .setEmoji(leftEmoji)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`help_staff_page_${authorId}`)
            .setLabel(`Page ${page} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`help_staff_next_${authorId}_${page}`)
            .setLabel("Next")
            .setEmoji(rightEmoji)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
    );

    return pageRow;
}

// ─────────────────────────────────────────────────────────────
// Command Export
// ─────────────────────────────────────────────────────────────

module.exports = {
    name: "help",
    description: "Display available commands and their overview",
    aliases: ["h"],
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Display available commands and their overview")
        .addStringOption(option =>
            option.setName("command")
                .setDescription("The command to get detailed information about")
                .setRequired(false)
        ),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === "function" && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;

        const { emoji: emojiUtils, config, client } = ctx;
        const prefix = ctx.prefix || config?.PREFIX || ";";
        const whiteRight = (emojiUtils && emojiUtils.getEmoji("white_right")) || "<:white_right:1543655440733184102>";

        const member = input.member;
        const author = isInteraction ? input.user : input.author;

        if (!isInteraction && input.deletable) {
            input.delete().catch(() => {});
        }

        let query = null;
        if (isInteraction) {
            await input.deferReply().catch(() => {});
            query = input.options.getString("command")?.trim().toLowerCase();
        } else if (Array.isArray(args) && args.length > 0) {
            query = args[0].trim().toLowerCase();
        }

        // Direct category shortcut: leaders
        if (query === "leaders" || query === "leader") {
            if (!isLeaderMember(member, config)) {
                const noPermEmbed = new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Leaders can use this.");
                if (isInteraction) return input.editReply({ embeds: [noPermEmbed] });
                return input.channel.send({ embeds: [noPermEmbed] });
            }
            const leaderEmbed = buildLeaderEmbed(prefix, whiteRight, client);
            const row = buildButtonsRow(author.id, "leaders");
            if (isInteraction) return input.editReply({ embeds: [leaderEmbed], components: [row] });
            return input.channel.send({ embeds: [leaderEmbed], components: [row] });
        }

        // Direct category shortcut: staff
        if (query === "staff") {
            if (!isStaffMember(member, config)) {
                const noPermEmbed = new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Staffs can use this.");
                if (isInteraction) return input.editReply({ embeds: [noPermEmbed] });
                return input.channel.send({ embeds: [noPermEmbed] });
            }
            const staffEmbed = buildStaffEmbed(prefix, whiteRight, client, 1);
            const pageRow = buildStaffPageButtons(author.id, 1);
            if (isInteraction) return input.editReply({ embeds: [staffEmbed], components: [pageRow] });
            return input.channel.send({ embeds: [staffEmbed], components: [pageRow] });
        }

        // Direct category shortcut: mod
        if (query === "mod") {
            if (!isModMember(member, config)) {
                const noPermEmbed = new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Mod can use this.");
                if (isInteraction) return input.editReply({ embeds: [noPermEmbed] });
                return input.channel.send({ embeds: [noPermEmbed] });
            }
            const modEmbed = buildModEmbed(prefix, whiteRight, client);
            const row = buildButtonsRow(author.id, "mod");
            if (isInteraction) return input.editReply({ embeds: [modEmbed], components: [row] });
            return input.channel.send({ embeds: [modEmbed], components: [row] });
        }

        // Direct category shortcut: admin
        if (query === "admin") {
            if (!isAdminMember(member, config)) {
                const noPermEmbed = new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Admin can use this.");
                if (isInteraction) return input.editReply({ embeds: [noPermEmbed] });
                return input.channel.send({ embeds: [noPermEmbed] });
            }
            const adminEmbed = buildAdminEmbed(prefix, whiteRight, client);
            const row = buildButtonsRow(author.id, "admin");
            if (isInteraction) return input.editReply({ embeds: [adminEmbed], components: [row] });
            return input.channel.send({ embeds: [adminEmbed], components: [row] });
        }

        // Specific command lookup
        if (query) {
            const cleanQuery = query.startsWith(prefix) ? query.slice(prefix.length) : query;
            const allPublic = normalCommands;
            const allLeader = isLeaderMember(member, config) ? leaderCommands : [];
            const allStaff = isStaffMember(member, config) ? staffCommands : [];
            const allMod = isModMember(member, config) ? modCommands : [];
            const allAdmin = isAdminMember(member, config) ? adminCommands : [];

            const targetCmd =
                allPublic.find(c => c.name === cleanQuery || c.aliases.includes(cleanQuery)) ||
                allLeader.find(c => c.name === cleanQuery || c.aliases.includes(cleanQuery)) ||
                allStaff.find(c => c.name === cleanQuery || c.aliases.includes(cleanQuery)) ||
                allMod.find(c => c.name === cleanQuery || c.aliases.includes(cleanQuery)) ||
                allAdmin.find(c => c.name === cleanQuery || c.aliases.includes(cleanQuery));

            if (!targetCmd) {
                const notFoundMsg = `❌ Command \`${query}\` not found. Type \`${prefix}help\` to see all commands.`;
                if (isInteraction) return input.editReply({ content: notFoundMsg });
                return input.channel.send(notFoundMsg);
            }

            const detailEmbed = buildDetailEmbed(targetCmd, prefix, whiteRight);
            if (isInteraction) return input.editReply({ embeds: [detailEmbed] });
            return input.channel.send({ embeds: [detailEmbed] });
        }

        // ── Default view: Only display Normal commands + [Leaders] [Staff] [Mod] [Admin] buttons ──
        const initialEmbed = buildNormalEmbed(prefix, whiteRight, client);
        const initialRow = buildButtonsRow(author.id);

        let replyMsg;
        if (isInteraction) {
            replyMsg = await input.editReply({ embeds: [initialEmbed], components: [initialRow] });
        } else {
            replyMsg = await input.channel.send({ embeds: [initialEmbed], components: [initialRow] });
        }

        if (!replyMsg || typeof replyMsg.createMessageComponentCollector !== "function") {
            return;
        }

        const collector = replyMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on("collect", async (i) => {
            await handleButton(i, ctx);
        });

        collector.on("end", async () => {
            try {
                const disabledRows = (replyMsg.components || []).map(row => {
                    const newRow = ActionRowBuilder.from(row);
                    newRow.components.forEach(btn => btn.setDisabled(true));
                    return newRow;
                });
                if (isInteraction) {
                    await input.editReply({ components: disabledRows }).catch(() => {});
                } else if (replyMsg && replyMsg.edit) {
                    await replyMsg.edit({ components: disabledRows }).catch(() => {});
                }
            } catch {
                if (isInteraction) {
                    await input.editReply({ components: [] }).catch(() => {});
                } else if (replyMsg && replyMsg.edit) {
                    await replyMsg.edit({ components: [] }).catch(() => {});
                }
            }
        });
    },

    handleButton: handleButton
};

async function handleButton(interaction, context) {
    if (!interaction || !interaction.isButton()) return;
    const btnId = interaction.customId;
    if (!btnId.startsWith("help_")) return;
    if (interaction.replied || interaction.deferred) return;

    const { emoji: emojiUtils, config, client } = context;
    const prefix = context.prefix || config?.PREFIX || ";";
    const whiteRight = (emojiUtils && emojiUtils.getEmoji("white_right")) || "<:white_right:1543655440733184102>";

    const member = interaction.member || (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null);

    // Staff Prev Page (ephemeral staff pagination)
    if (btnId.startsWith("help_staff_prev_")) {
        if (!isStaffMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Staffs can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const parts = btnId.split("_");
        const currPage = parseInt(parts[parts.length - 1], 10) || 2;
        const newPage = Math.max(1, currPage - 1);
        const embed = buildStaffEmbed(prefix, whiteRight, client, newPage);
        const pageRow = buildStaffPageButtons(interaction.user.id, newPage);
        return interaction.update({ embeds: [embed], components: [pageRow] }).catch(() => {});
    }

    // Staff Next Page (ephemeral staff pagination)
    if (btnId.startsWith("help_staff_next_")) {
        if (!isStaffMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Staffs can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const parts = btnId.split("_");
        const currPage = parseInt(parts[parts.length - 1], 10) || 1;
        const totalPages = Math.ceil(staffCommands.length / 25);
        const newPage = Math.min(totalPages, currPage + 1);
        const embed = buildStaffEmbed(prefix, whiteRight, client, newPage);
        const pageRow = buildStaffPageButtons(interaction.user.id, newPage);
        return interaction.update({ embeds: [embed], components: [pageRow] }).catch(() => {});
    }

    // Leaders Tab — send ephemeral (private) reply
    if (btnId.startsWith("help_btn_leaders_")) {
        if (!isLeaderMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Leaders can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const embed = buildLeaderEmbed(prefix, whiteRight, client);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Staff Tab — send ephemeral (private) reply
    if (btnId.startsWith("help_btn_staff_")) {
        if (!isStaffMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Staffs can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const embed = buildStaffEmbed(prefix, whiteRight, client, 1);
        const pageRow = buildStaffPageButtons(interaction.user.id, 1);
        return interaction.reply({ embeds: [embed], components: [pageRow], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Mod Tab — send ephemeral (private) reply
    if (btnId.startsWith("help_btn_mod_")) {
        if (!isModMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Mod can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const embed = buildModEmbed(prefix, whiteRight, client);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Admin Tab — send ephemeral (private) reply
    if (btnId.startsWith("help_btn_admin_")) {
        if (!isAdminMember(member, config)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription("⛔ Only Admin can use this.")],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        const embed = buildAdminEmbed(prefix, whiteRight, client);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Normal Tab — send ephemeral (private) reply
    if (btnId.startsWith("help_btn_normal_")) {
        const embed = buildNormalEmbed(prefix, whiteRight, client);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
}
