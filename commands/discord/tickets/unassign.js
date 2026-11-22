const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { checkPermission } = require('../../../utils/checkPermission.js');
const clanRecruitments = require('../../../utils/clanRecruitments');
const ticketDataStore = require('../../../utils/ticketDataStore');
const dataManager = require('../../../utils/dataManager');
const emojiModule = require('../../../utils/emoji');
const getThEmoji = emojiModule?.getThEmoji;
const getEmoji = emojiModule?.getEmoji;
const rawEmojis = emojiModule?.emojis || {};

/**
 * Resolve Town Hall emoji with fallback
 */
function resolveThEmojiString(thKey, emojiUtils) {
    if (!thKey) return "🏰";
    const cleanNum = String(thKey).toLowerCase().replace(/^th/, '').trim();
    let thEmoji = null;
    if (emojiUtils && typeof emojiUtils.getEmoji === 'function') {
        thEmoji = emojiUtils.getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getEmoji === 'function') {
        thEmoji = getEmoji("th" + cleanNum);
    }
    if (!thEmoji && typeof getThEmoji === 'function') {
        thEmoji = getThEmoji(cleanNum);
    }
    if (!thEmoji && rawEmojis["th" + cleanNum]) {
        thEmoji = `<:th${cleanNum}:${rawEmojis["th" + cleanNum]}>`;
    }
    return thEmoji || "🏰";
}

module.exports = {
    name: "unassign",
    description: "Unassign clan from the current ticket and remove player from clan rotations",
    data: new SlashCommandBuilder()
        .setName("unassign")
        .setDescription("Unassign clan from the current ticket and remove player from clan rotations")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Optional reason for unassigning the clan")
                .setRequired(false)
        ),

    async execute(interaction, context) {
        const { config, emoji: emojiUtils, data: dataMgr } = context;

        // 1. Permission check
        if (!checkPermission('unassign', interaction) && !checkPermission('assignclan', interaction)) {
            return interaction.reply({
                content: "❌ You do not have permission to unassign clans.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        const channel = interaction.channel;
        const TICKET_CATEGORY_ID = config?.TICKET_CATEGORY_ID;
        const isTicketCategory = channel.parentId && channel.parentId === TICKET_CATEGORY_ID;
        const ticketRecord = ticketDataStore.findByChannelId(channel.id);

        // 2. Must work only inside a ticket channel
        if (!isTicketCategory && !ticketRecord) {
            return interaction.reply({
                content: "❌ This command can only be used inside an active ticket channel.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        // 3. Must work only in assigned clan tickets
        const ticketData = ticketRecord?.record || {};
        const assignedClanTag = ticketData.assignedClanTag || ticketData.assignedClan;

        const recData = clanRecruitments.getRecruitmentData();
        const existingAssignment = clanRecruitments.findExistingAssignment(
            recData,
            ticketData.appliedTag || ticketData.playerTag,
            ticketRecord?.ticketId,
            channel.id
        );

        if (!assignedClanTag && !existingAssignment) {
            return interaction.reply({
                content: "❌ This ticket is not currently assigned to any clan.",
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.deferReply();

        // 4. Resolve details
        const clanTag = assignedClanTag || existingAssignment?.clanTag;
        const clanRoles = dataMgr ? dataMgr.getClanRoles() : dataManager.getClanRoles();
        const clanConfig = clanRoles[clanTag] || {};
        const clanName = clanConfig.name || clanConfig.nickName || ticketData.assignedClanName || ticketData.assignedClan || clanTag;

        const playerTag = ticketData.appliedTag || ticketData.playerTag || existingAssignment?.playerEntry?.playerTag;
        const playerName = ticketData.playerName || ticketData.appliedName || ticketData.name || existingAssignment?.playerEntry?.playerName || "Unknown";
        const rawTh = ticketData.playerTh || ticketData.playerth || existingAssignment?.thKey;
        const thKey = rawTh ? clanRecruitments.normalizeTh(rawTh) : (existingAssignment?.thKey || null);
        const ticketId = ticketRecord?.ticketId || existingAssignment?.playerEntry?.ticketId || channel.id;
        const reason = interaction.options.getString("reason");

        // 5. Remove assignment from clan-recruitments.json
        const unassignResult = clanRecruitments.unassignPlayer({
            clanTag,
            playerTag,
            ticketId,
            channelId: channel.id,
            thLevel: thKey
        });

        // 6. Clear assignment from ticketDataStore
        ticketDataStore.clearAssignedClan(channel.id);

        // 7. Remove leader role permissions from ticket channel
        if (clanConfig.leaderRoleId) {
            try {
                await channel.permissionOverwrites.delete(clanConfig.leaderRoleId, `Unassigned by ${interaction.user.tag}`);
            } catch (permErr) {
                console.warn(`[Unassign] Failed to remove leader role permissions:`, permErr.message);
            }
        }

        // 8. Auto-update all active /clan-rotation embeds in Discord in real-time
        try {
            clanRecruitments.updateAllActiveRotationMessages(interaction.client).catch(() => {});
        } catch (_) {}

        // 9. Send announcement embed inside the ticket channel
        const thEmoji = resolveThEmojiString(thKey, emojiUtils);
        const embed = new EmbedBuilder()
            .setTitle("Clan Assignment Removed")
            .setColor(0xE74C3C)
            .setDescription(
                `❌ **Clan assignment has been cancelled for this ticket.**\n\n` +
                `• **Player:** **${playerName}** \`${playerTag || 'N/A'}\`\n` +
                `• **Removed from:** **${clanName}** (\`${clanTag}\`)\n` +
                (thKey ? `• **Town Hall:** ${thEmoji} **${thKey}**\n` : '') +
                (reason ? `• **Reason:** ${reason}\n` : '') +
                `\n*The player has been removed from clan rotations and recruitment counts.*`
            )
            .setFooter({ text: `Unassigned by ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.editReply({
            embeds: [embed]
        });
    }
};
