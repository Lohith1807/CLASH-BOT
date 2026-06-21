const { AttachmentBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const path = require("path");

function sendReply(ctx, content, isInteraction) {
    if (isInteraction) {
        return ctx.followUp ? ctx.followUp(content) : ctx.channel.send(content);
    }
    return ctx.channel.send(content);
}

module.exports = {
    name: "player",
    description: "Show Clash of Clans player profile card",

    async execute(ctx, args, context) {
        const isInteraction = ctx.isInteraction ? ctx.isInteraction() : false;
        const { ActionRowBuilder: ContextActionRow, StringSelectMenuBuilder, coc, data: dataManager } = context;
        const data = dataManager.getUserData();

        let tag = null;
        let accounts = [];

        if (args[0] && args[0].startsWith("#")) {
            tag = args[0];
        }
        else if (!isInteraction && ctx.mentions && ctx.mentions.users.size > 0) {
            const user = ctx.mentions.users.first();
            accounts = data[user.id] || [];
        }
        else if (!isInteraction) {
            accounts = data[ctx.author.id] || [];
        }

        if (isInteraction && args[0]) tag = args[0];

        if (accounts.length > 1 && !tag) {
            const options = [];
            for (const acc of accounts) {
                let accName = acc.name;
                try {
                    const cocData = await coc.getPlayer(acc.tag);
                    accName = cocData.name;
                } catch (e) {
                }
                options.push({
                    label: `${accName} (${acc.tag})`,
                    value: acc.tag
                });
            }

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select_player_account")
                    .setPlaceholder("Choose an account")
                    .addOptions(options)
            );
            
            const promptMsg = await sendReply(ctx, { content: "👉 Select an account:", components: [row] }, isInteraction);

            const filter = i => i.customId === "select_player_account" && i.user.id === (isInteraction ? ctx.user.id : ctx.author.id);
            const collector = promptMsg.createMessageComponentCollector({ filter, time: 120000, max: 1 });

            collector.on("collect", async i => {
                const selectedTag = i.values[0];
                await i.deferUpdate().catch(() => {});
                await promptMsg.delete().catch(() => {});
                
                return module.exports.execute(ctx, [selectedTag], context);
            });

            collector.on("end", collected => {
                if (collected.size === 0) {
                    promptMsg.edit({ content: "❌ Selection timed out.", components: [] }).catch(() => {});
                }
            });

            return;
        }

        if (accounts.length === 1 && !tag) tag = accounts[0].tag;

        if (!tag) {
            return sendReply(ctx, "⚠️ No account linked. Use `;link` first or provide a tag.", isInteraction);
        }

        let loadingMsg = null;
        if (!isInteraction) {
            loadingMsg = await ctx.channel.send("⏳ Generating player card...").catch(() => null);
        } else if (ctx.deferReply) {
            await ctx.deferReply().catch(() => {});
        }

        try {
            const p = await coc.getPlayer(tag);

            const playerCardPath = path.join(__dirname, "../../../utils/playerCard");
            try {
                delete require.cache[require.resolve(playerCardPath)];
            } catch (e) {}

            const { generatePlayerCard } = require(playerCardPath);

            const buffer = await generatePlayerCard(p);
            const attachment = new AttachmentBuilder(buffer, { name: "player-card.png" });

            if (loadingMsg) await loadingMsg.delete().catch(() => {});

            const emojiUtils = context.emoji || require("../../../utils/emoji");
            const thEmoji = emojiUtils.getEmoji(`th${p.townHallLevel}`) || "🏰";
            const xpEmoji = emojiUtils.getEmoji("xp") || "🌟";
            const trophyEmoji = emojiUtils.getEmoji("throphy") || "🏆";
            const starEmoji = emojiUtils.getEmoji("bluestar") || "⚔️";
            const cocwarEmoji = emojiUtils.getEmoji("cocfight") || "⚔️";
            
            const leagueName = p.league ? p.league.name : "Unranked";
            const leagueEmojiKey = leagueName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const dynLeagueEmoji = emojiUtils.getEmoji(leagueEmojiKey) || emojiUtils.getEmoji("sheild") || "🛡️";

            const conqueror = p.achievements?.find(a => a.name === "Conqueror");
            const totalAttacks = conqueror ? conqueror.value : (p.attackWins || 0);

            const embed = new EmbedBuilder()
                .setColor("#d9a01e")
                .setAuthor({ 
                    name: `${p.name} (${p.tag})`, 
                    iconURL: p.league?.iconUrls?.medium || (ctx.guild ? ctx.guild.iconURL({ dynamic: true }) : (ctx.author || ctx.user).displayAvatarURL({ dynamic: true })) 
                })
                .setDescription(
                    `### ⚔️ Player Profile Details\n` +
                    `${thEmoji} **Town Hall**: \`${p.townHallLevel}\`\n` +
                    `${xpEmoji} **XP Level**: \`${p.expLevel}\`\n` +
                    `${trophyEmoji} **Trophies**: \`${p.trophies}\`\n` +
                    `${cocwarEmoji} **Attack Wins**: \`${totalAttacks}\`\n` +
                    `${starEmoji} **War Stars**: \`${p.warStars}\`\n` +
                    `${trophyEmoji} **League**: \`${leagueName}\` ${dynLeagueEmoji}`
                )
                .setImage("attachment://player-card.png")
                .setTimestamp()
                .setFooter({ text: "Clash Bot Profile System", iconURL: ctx.client.user.displayAvatarURL() });

            const refreshBtn = new ButtonBuilder()
                .setCustomId(`refresh_player_${tag}`)
                .setLabel("Refresh Data")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("1506184937458630696"); // Custom refresh emoji

            const row = new ActionRowBuilder().addComponents(refreshBtn);

            const responseMsg = isInteraction
                ? (ctx.editReply ? await ctx.editReply({ embeds: [embed], files: [attachment], components: [row] }) : await ctx.channel.send({ embeds: [embed], files: [attachment], components: [row] }))
                : await ctx.channel.send({ embeds: [embed], files: [attachment], components: [row] });

            const collector = responseMsg.createMessageComponentCollector({
                filter: i => i.customId === `refresh_player_${tag}`,
                time: 300000 // Active for 5 minutes
            });

            collector.on("collect", async (i) => {
                try {
                    await i.deferUpdate().catch(() => {});

                    const freshP = await coc.getPlayer(tag);

                    delete require.cache[require.resolve(playerCardPath)];
                    const { generatePlayerCard: freshGenerate } = require(playerCardPath);

                    const freshBuffer = await freshGenerate(freshP);
                    const freshAttachment = new AttachmentBuilder(freshBuffer, { name: "player-card.png" });

                    const freshLeagueName = freshP.league ? freshP.league.name : "Unranked";
                    const freshLeagueEmojiKey = freshLeagueName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const freshDynLeagueEmoji = emojiUtils.getEmoji(freshLeagueEmojiKey) || emojiUtils.getEmoji("sheild") || "🛡️";

                    const freshConqueror = freshP.achievements?.find(a => a.name === "Conqueror");
                    const freshTotalAttacks = freshConqueror ? freshConqueror.value : (freshP.attackWins || 0);

                    const freshEmbed = new EmbedBuilder()
                        .setColor("#d9a01e")
                        .setAuthor({ 
                            name: `${freshP.name} (${freshP.tag})`, 
                            iconURL: freshP.league?.iconUrls?.medium || (ctx.guild ? ctx.guild.iconURL({ dynamic: true }) : (ctx.author || ctx.user).displayAvatarURL({ dynamic: true })) 
                        })
                        .setDescription(
                            `### ⚔️ Player Profile Details\n` +
                            `${thEmoji} **Town Hall**: \`${freshP.townHallLevel}\`\n` +
                            `${xpEmoji} **XP Level**: \`${freshP.expLevel}\`\n` +
                            `${trophyEmoji} **Trophies**: \`${freshP.trophies}\`\n` +
                            `${cocwarEmoji} **Attack Wins**: \`${freshTotalAttacks}\`\n` +
                            `${starEmoji} **War Stars**: \`${freshP.warStars}\`\n` +
                            `**League**: \`${freshLeagueName}\` ${freshDynLeagueEmoji}`
                        )
                        .setImage("attachment://player-card.png")
                        .setTimestamp()
                        .setFooter({ text: "Clash Bot Profile System (Refreshed)", iconURL: ctx.client.user.displayAvatarURL() });

                    await i.editReply({
                        embeds: [freshEmbed],
                        files: [freshAttachment],
                        components: [row]
                    }).catch(async () => {
                        await responseMsg.edit({
                            embeds: [freshEmbed],
                            files: [freshAttachment],
                            components: [row]
                        }).catch(() => {});
                    });

                } catch (err) {
                    console.error("Refresh interaction error:", err);
                }
            });

        } catch (err) {
            console.error("Player card error:", err);
            if (loadingMsg) await loadingMsg.delete().catch(() => {});
            const errMsg = { content: `❌ Error generating player card: ${err.message}` };
            return isInteraction
                ? (ctx.editReply ? ctx.editReply(errMsg) : ctx.channel.send(errMsg))
                : ctx.channel.send(errMsg);
        }
    }
};
