const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const emojiUtils = require('../../../utils/emoji.js');

// Helper to extract invite code from a URL or raw input
function extractInviteCode(input) {
    if (!input) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)?([a-zA-Z0-9-]+)/i;
    const match = input.match(regex);
    return match ? match[1] : input.trim();
}

// Function to fetch invite details and build the embed
async function getInviteDetailsAndEmbed(inviteCode, guild, client) {
    let invite = null;
    let fetchError = null;

    // 1. Try to fetch from the local guild invites manager (gives full details: uses, maxUses, createdAt, expiresAt)
    try {
        if (guild) {
            invite = await guild.invites.fetch({ code: inviteCode, force: true });
        }
    } catch (e) {
        fetchError = e;
    }

    // 2. Fall back to client fetch (works for any guild, but details like uses, createdAt might be limited by Discord API)
    if (!invite) {
        try {
            invite = await client.fetchInvite(inviteCode, { withCounts: true });
        } catch (e) {
            fetchError = e;
        }
    }

    if (!invite) {
        // Invite not found or expired
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${emojiUtils.getEmoji("bluex") || "❌"} Invite Check Failed`)
            .setDescription(`Could not retrieve invite details for code \`${inviteCode}\`.\n\nThe invite may be invalid, expired, or the bot might not have permissions to access it.`)
            .setTimestamp();
        
        return { embed: errorEmbed, success: false };
    }

    // Emojis from emoji.js
    const serverIcon = emojiUtils.getEmoji("whitefwa") || "💎";
    const channelIcon = emojiUtils.getEmoji("arrow") || "▸";
    const creatorIcon = emojiUtils.getEmoji("fwalead") || "👑";
    const usesIcon = emojiUtils.getEmoji("mem") || "👥";
    const timeIcon = emojiUtils.getEmoji("alaram") || "⏰";

    const guildName = invite.guild ? invite.guild.name : "Unknown Server";
    const guildId = invite.guild ? invite.guild.id : "N/A";
    const channelName = invite.channel ? invite.channel.name : "N/A";
    const channelMention = invite.channel ? `<#${invite.channel.id}>` : "N/A";
    const creatorMention = invite.inviter ? `<@${invite.inviter.id}>` : "Unknown";
    const creatorName = invite.inviter ? invite.inviter.tag : "Unknown";

    // Formatted uses
    let usesStr = "N/A";
    if (invite.uses !== undefined && invite.uses !== null) {
        const maxUses = invite.maxUses ? invite.maxUses : "∞";
        usesStr = `**${invite.uses}** / ${maxUses}`;
    } else {
        usesStr = "*N/A (External Server)*";
    }

    // Formatted created time
    let createdStr = "N/A";
    if (invite.createdAt) {
        const createdTimestamp = Math.floor(invite.createdAt.getTime() / 1000);
        createdStr = `<t:${createdTimestamp}:F> (<t:${createdTimestamp}:R>)`;
    } else {
        createdStr = "*N/A (External Server)*";
    }

    // Formatted expires time
    let expiresStr = "Never";
    if (invite.expiresAt) {
        const expiresTimestamp = Math.floor(invite.expiresAt.getTime() / 1000);
        expiresStr = `<t:${expiresTimestamp}:F> (<t:${expiresTimestamp}:R>)`;
    } else if (invite.maxAge && invite.createdAt) {
        const expiresTimestamp = Math.floor((invite.createdAt.getTime() + invite.maxAge * 1000) / 1000);
        expiresStr = `<t:${expiresTimestamp}:F> (<t:${expiresTimestamp}:R>)`;
    } else if (invite.maxAge === 0) {
        expiresStr = "Never";
    } else {
        expiresStr = "N/A";
    }

    const embed = new EmbedBuilder()
        .setAuthor({ name: guildName, iconURL: invite.guild?.iconURL({ dynamic: true }) || undefined })
        .setTitle(`Invite Details: \`${invite.code}\``)
        .setThumbnail(invite.guild?.iconURL({ dynamic: true, size: 256 }) || null)
        .setColor(0x5865F2) // Discord blurple
        .setDescription(
            `${serverIcon} **Server:** ${guildName} (\`${guildId}\`)\n` +
            `${channelIcon} **Target Channel:** ${channelMention} (\`#${channelName}\`)\n` +
            `${creatorIcon} **Created By:** ${creatorMention} (\`${creatorName}\`)\n` +
            `${usesIcon} **Players Joined (Uses):** ${usesStr}\n` +
            `${timeIcon} **Created At:** ${createdStr}\n` +
            `${timeIcon} **Expires At:** ${expiresStr}`
        )
        .setFooter({ text: "Blood Alliance Invite Lookup" })
        .setTimestamp();

    return { embed, success: true };
}

module.exports = {
    name: "checkinvite",
    description: "Check the details of a server invite link or code.",
    data: new SlashCommandBuilder()
        .setName('checkinvite')
        .setDescription('Check the details of a server invite link or code.')
        .addStringOption(option =>
            option.setName('invite')
                .setDescription('The invite link or code (e.g. discord.gg/abc or abc)')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const inviteInput = interaction.options.getString('invite');
        const inviteCode = extractInviteCode(inviteInput);

        if (!inviteCode) {
            return interaction.reply({
                content: "❌ Invalid invite code format. Please provide a valid invite link or code.",
                ephemeral: true
            });
        }

        await interaction.deferReply().catch(() => {});

        const { embed, success } = await getInviteDetailsAndEmbed(inviteCode, interaction.guild, interaction.client);

        const row = new ActionRowBuilder();
        const refreshBtn = new ButtonBuilder()
            .setCustomId(`checkinvite_refresh:${inviteCode}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojiUtils.getEmojiObject('refresh') || '🔄')
            .setLabel(success ? "Refresh" : "Retry");

        row.addComponents(refreshBtn);

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        }).catch(() => {});
    },

    async handleRefreshButton(interaction, context) {
        const parts = interaction.customId.split(":");
        const inviteCode = parts[1];

        try {
            await interaction.deferUpdate();
        } catch (e) {
            return;
        }

        const { embed, success } = await getInviteDetailsAndEmbed(inviteCode, interaction.guild, interaction.client);

        const row = new ActionRowBuilder();
        const refreshBtn = new ButtonBuilder()
            .setCustomId(`checkinvite_refresh:${inviteCode}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojiUtils.getEmojiObject('refresh') || '🔄')
            .setLabel(success ? "Refresh" : "Retry");

        row.addComponents(refreshBtn);

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        }).catch(() => {});
    }
};
