const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const { getEmoji, getEmojiObject } = require("../../../utils/emoji.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("staff-pannel")
        .setDescription("Show the staff command dashboard panel"),

    async execute(interaction, context) {
        const { emoji: emojiUtils } = context;
        const cocEmojiObj = emojiUtils.getEmojiObject("cocfight") || "🛡️";
        const shieldEmojiObj = emojiUtils.getEmojiObject("sheild") || "🛡️";
        const starsEmojiObj = emojiUtils.getEmojiObject("stars") || "⭐";

        const embed = new EmbedBuilder()
            .setTitle(`${emojiUtils.getEmoji("cocfight") || "🛡️"}  Blood Alliance Staff Panel  ${emojiUtils.getEmoji("cocfight") || "🛡️"}`)
            .setColor(0xD4A017)
            .setDescription(
                "Welcome to the Blood Alliance Staff Command Dashboard.\n\n" +
                "Select a staff division below to view available moderator slash commands and their usage details.\n\n" +
                "👥 **Staff Divisions:**\n" +
                `• ${emojiUtils.getEmoji("sheild") || "🛡️"} **Server Moderator / T-Mod**: Standard moderation and clan operations.\n` +
                `• ${emojiUtils.getEmoji("stars") || "⭐"} **Executive Staff**: Ticket handling and administration.`
            )
            .setFooter({ text: "Blood Alliance Staff System" })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("staffpannel_mod_tmod")
                .setLabel("Mod & T-Mod")
                .setStyle(ButtonStyle.Primary)
                .setEmoji(shieldEmojiObj),
            new ButtonBuilder()
                .setCustomId("staffpannel_executive")
                .setLabel("Executive Staff")
                .setStyle(ButtonStyle.Success)
                .setEmoji(starsEmojiObj)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    },

    async handleButtonPress(interaction, context) {
        const { config, emoji: emojiUtils } = context;
        const id = interaction.customId;

        const hasModRole = (config.STAFF_ROLE_IDS && (
            (config.STAFF_ROLE_IDS[0] && interaction.member.roles.cache.has(config.STAFF_ROLE_IDS[0])) ||
            (config.STAFF_ROLE_IDS[1] && interaction.member.roles.cache.has(config.STAFF_ROLE_IDS[1]))
        )) || interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
        (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => interaction.member.roles.cache.has(id)));

        const hasExecRole = (config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[2] && interaction.member.roles.cache.has(config.STAFF_ROLE_IDS[2])) ||
        interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
        (config.ADMIN_ROLE_IDS && config.ADMIN_ROLE_IDS.some(id => interaction.member.roles.cache.has(id)));

        if (id === "staffpannel_mod_tmod") {
            if (!hasModRole) {
                const errEmbed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("⛔ You aren't Mod/T-Mod to use this");
                return interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }

            const modEmbed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("sheild") || "🛡️"} Mod & T-Mod Commands`)
                .setColor(0x3498DB)
                .setDescription(
                    "Here is the list of updated moderator slash commands and their descriptions:\n\n" +
                    "**`/updatebase`**: Update an FWA base link for a specific Town Hall level or adds a new base for new TH if provided.\n" +
                    "**`/addclantoweb`**: It adds the clan to [website](https://blood-alliance.vercel.app).\n" +
                    "**`/cwl-clan`**: Manage CWL clans (Add, Edit, or Remove from the database list).\n" +
                    "**`/lsweb`**: List all clans stored in the website.\n" +
                    "**`/refresh`**: Refresh all clans data in Website.\n" +
                    "**`/removeclanweb`**: Remove a clan from website.\n" +
                    "**`/ban`**: Ban a member from the server.\n" +
                    "**`/unban`**: Unban a user from the server by their user ID.\n" +
                    "**`/kick`**: Kick a member from the server.\n" +
                    "**`/mute`**: Timeout (mute) a member for a specified duration (up to 28 days).\n" +
                    "**`/unmute`**: Remove timeout (unmute) from a member.\n" +
                    "**`/lockchannel`**: Lock a channel to prevent members from sending messages.\n" +
                    "**`/unlockchannel`**: Unlock a channel to allow members to send messages again.\n" +
                    "**`/set-welcome-th`**: Manage the recruited Town Halls in the welcome message.\n" +
                    "**`/setup-clan`**: Manage per-clan settings: Auto Role, Auto Post, and Join/Leave Tracker.\n" +
                    "**`/staff-members`**: Manage staff members (Add, Update, Remove, or List) assigned to clans.\n" +
                    "**`/clanentry`**: Add clan entry (creates roles, channels, leadership chats, and mail channels).\n" +
                    "**`/updateclanentry`**: Update leadership (Leader/Co-Leaders) for a registered clan.\n" +
                    "**`/create-ticket`**: Manually create a ticket for a user.\n" +
                    "**`/check-clan`**: Check clan descriptions for Blood Alliance requirements.\n" +
                    "**`/delete`**: Delete messages by count, date, or user.\n" +
                    "**`/set-timer`**: Set an auto-close timer for this ticket.\n" +
                    "**`/approve`**: Approve the current ticket application.\n" +
                    "**`/reject`**: Reject the current ticket application.\n" +
                    "**`/handle-claim`**: Transfer the claim of this ticket to another user."
                )
                .setTimestamp();

            return interaction.reply({ embeds: [modEmbed], ephemeral: true });
        }

        if (id === "staffpannel_executive") {
            if (!hasExecRole) {
                const errEmbed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("⛔ You aren't Executive to use this");
                return interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }

            const execEmbed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("stars") || "⭐"} Executive Staff Commands`)
                .setColor(0x2ECC71)
                .setDescription(
                    "Here is the list of Executive Staff commands and their descriptions:\n\n" +
                    "**`/check-clan`**: Check clan descriptions for Blood Alliance requirements.\n" +
                    "**`/delete`**: Delete messages by count, date, or user.\n" +
                    "**`/set-timer`**: Set an auto-close timer for this ticket.\n" +
                    "**`/approve`**: Approve the current ticket application.\n" +
                    "**`/reject`**: Reject the current ticket application.\n" +
                    "**`/handle-claim`**: Transfer the claim of this ticket to another user."
                )
                .setTimestamp();

            return interaction.reply({ embeds: [execEmbed], ephemeral: true });
        }
    }
};
