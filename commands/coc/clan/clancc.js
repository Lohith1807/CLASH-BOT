const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function buildClanCCEmbeds(clanTag, coc, dataManager, emoji) {
    const userData = dataManager.getUserData();
    let clan;
    try {
        clan = await coc.getClan(clanTag);
    } catch (e) {
        return null;
    }
    
    const linkedTags = new Set();
    for (const userId in userData) {
        const accounts = userData[userId];
        for (const acc of accounts) {
            linkedTags.add(acc.tag);
        }
    }
    
    const members = clan.memberList || [];
    
    const linkedEmoji = emoji.getEmoji("gtick") || "✅";
    const unlinkedEmoji = emoji.getEmoji("bluex") || "❌";
    
    let maxNameLength = 15;
    members.forEach(m => {
        const len = m.name.replace(/`/g, "").length;
        if (len > maxNameLength) maxNameLength = len;
    });

    const headerName = "Name".padEnd(maxNameLength, ' ');

    const roleOrder = ["leader", "coLeader", "admin", "member"];
    const roleNames = {
        "leader": `${emoji.getEmoji("crown") || "👑"} Leaders`,
        "coLeader": `${emoji.getEmoji("sheild") || "🛡️"} Co-Leaders`,
        "admin": `${emoji.getEmoji("bluestar") || "⚔️"} Elders`,
        "member": `${emoji.getEmoji("mem") || "🔰"} Members`
    };

    const linkedMembers = members.filter(m => linkedTags.has(m.tag));
    const unlinkedMembers = members.filter(m => !linkedTags.has(m.tag));

    function buildLinesByRole(membersArray, isLinked) {
        const lines = [];
        const emojiToUse = isLinked ? linkedEmoji : unlinkedEmoji;
        
        for (const role of roleOrder) {
            const roleMembers = membersArray.filter(m => m.role === role);
            if (roleMembers.length > 0) {
                lines.push(`\n**${roleNames[role]}**`);
                for (const m of roleMembers) {
                    const cleanName = m.name.replace(/`/g, "'");
                    const paddedName = cleanName.padEnd(maxNameLength, ' ');
                    const tagUrl = encodeURIComponent(m.tag.replace("#", ""));
                    lines.push(`${emojiToUse} \`${paddedName}\` [CC](https://cc.fwafarm.com/cc_n/member.php?tag=${tagUrl})`);
                }
            }
        }
        return lines;
    }

    const linkedLines = buildLinesByRole(linkedMembers, true);
    const unlinkedLines = buildLinesByRole(unlinkedMembers, false);

    const linkedChunks = [];
    const headerLinked = `💬 \`${headerName}\` **CC Link**\n`;
    
    let currentLinkedChunk = `**Clan CC links for ${clan.name} (${clan.tag})**\n\n` + headerLinked;
    if (linkedLines.length === 0) currentLinkedChunk += "No linked players found in this clan.\n";
    for (const line of linkedLines) {
        if (currentLinkedChunk.length + line.length + 1 > 3500) {
            linkedChunks.push(currentLinkedChunk);
            currentLinkedChunk = headerLinked + line + "\n";
        } else {
            currentLinkedChunk += line + "\n";
        }
    }
    if (currentLinkedChunk && currentLinkedChunk !== headerLinked) linkedChunks.push(currentLinkedChunk);

    const unlinkedChunks = [];
    let currentUnlinkedChunk = headerLinked;
    if (unlinkedLines.length === 0) currentUnlinkedChunk += "No unlinked players found in this clan.\n";
    for (const line of unlinkedLines) {
        if (currentUnlinkedChunk.length + line.length + 1 > 3500) {
            unlinkedChunks.push(currentUnlinkedChunk);
            currentUnlinkedChunk = headerLinked + line + "\n";
        } else {
            currentUnlinkedChunk += line + "\n";
        }
    }
    if (currentUnlinkedChunk && currentUnlinkedChunk !== headerLinked) unlinkedChunks.push(currentUnlinkedChunk);

    const allEmbeds = [];

    const titleColor = Math.floor(Math.random() * 0xFFFFFF);

    for (let i = 0; i < linkedChunks.length; i++) {
        const titleSuffix = linkedChunks.length > 1 ? ` (Part ${i + 1}/${linkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`${clan.name} (Linked)${titleSuffix}`)
            .setThumbnail(i === 0 ? (clan.badgeUrls?.large || clan.badgeUrls?.medium) : null)
            .setColor(titleColor)
            .setDescription(linkedChunks[i])
            .setFooter({ text: "FWA Chocolate Clash Links" })
            .setTimestamp();
        allEmbeds.push(embed);
    }

    for (let i = 0; i < unlinkedChunks.length; i++) {
        const titleSuffix = unlinkedChunks.length > 1 ? ` (Part ${i + 1}/${unlinkedChunks.length})` : "";
        const embed = new EmbedBuilder()
            .setTitle(`Non-Linked Players${titleSuffix}`)
            .setColor(0xE74C3C)
            .setDescription(unlinkedChunks[i])
            .setFooter({ text: "FWA Chocolate Clash Links" })
            .setTimestamp();
        allEmbeds.push(embed);
    }

    return allEmbeds;
}

module.exports = {
    name: "clan-cc",
    data: new SlashCommandBuilder()
        .setName('clan-cc')
        .setDescription('Get CC links for all clan members, separated by linked status.')
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('The clan tag or nickname to lookup')
                .setRequired(true)
        ),
        
    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        if (!ctx) return;
        
        const { EmbedBuilder, coc, emoji, data: dataManager, ActionRowBuilder, ButtonBuilder, ButtonStyle } = ctx;
        let query = isInteraction ? input.options.getString('clantag') : args.join(" ");
        if (!query) {
             return isInteraction ? input.reply("Usage: /clan-cc clantag") : input.channel.send("Usage: ;clan-cc clantag");
        }
        
        if (isInteraction) await input.deferReply().catch(() => {});
        else if (input.deletable) input.delete().catch(() => {});
        
        const loadingEmoji = emoji.getEmoji("alaram") || "⏳";
        const loadingColor = Math.floor(Math.random() * 16777215);
        const loadingEmbed = new EmbedBuilder()
            .setColor(loadingColor)
            .setDescription(`${loadingEmoji} Fetching Clan CC Information...`);
            
        let replyMsg;
        if (isInteraction) {
            replyMsg = await input.editReply({ embeds: [loadingEmbed] }).catch(() => null);
        } else {
            replyMsg = await input.channel.send({ embeds: [loadingEmbed] }).catch(() => null);
        }
        
        let clanTag = null;
        const arg = query.toUpperCase();
        const clanRoles = dataManager.getClanRoles();
        for (const [tag, info] of Object.entries(clanRoles)) {
            if (info.nickName && info.nickName.toUpperCase() === arg) {
                clanTag = tag;
                break;
            }
        }
        if (!clanTag) {
            clanTag = arg.startsWith("#") ? arg : "#" + arg;
        }
        
        const embeds = await buildClanCCEmbeds(clanTag, coc, dataManager, emoji);
        
        if (!embeds) {
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Could not fetch clan data for \`${query}\`.`);
            if (isInteraction) return await input.editReply({ embeds: [errEmbed] }).catch(() => {});
            else if (replyMsg) return await replyMsg.edit({ embeds: [errEmbed] }).catch(() => {});
            return;
        }
        
        const refreshEmoji = emoji.getEmojiObject("refresh") || "🔄";
        const refreshBtn = new ButtonBuilder()
            .setCustomId(`clan_cc_refresh_${clanTag.replace("#", "")}`)
            .setLabel("Refresh Data")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(refreshEmoji);
            
        const btnRow = new ActionRowBuilder().addComponents(refreshBtn);
        
        if (isInteraction) {
            await input.editReply({ embeds, components: [btnRow] }).catch(() => {});
        } else if (replyMsg) {
            await replyMsg.edit({ embeds, components: [btnRow] }).catch(() => {});
        }
    },
    buildClanCCEmbeds
};
