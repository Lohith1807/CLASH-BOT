

module.exports = {
  name: "ww",
  description: "Get FWA weight report for a clan",
  async execute(message, args, context) {
    const { emoji: emojiUtils, data: dataManager } = context;
    const fwaClanData = require("../../../utils/fwadata.js");
    let tag = args[0];
    if (!tag) {
      return message.channel.send(`⚠️ Please provide a clan tag or nickname. Example: ${context.prefix}ww #CLANTAG`);
    }

    const argUpper = tag.toUpperCase();
    const clanRoles = dataManager.getClanRoles();
    let isNickname = false;
    for (const [cTag, info] of Object.entries(clanRoles)) {
      if (info.nickName && info.nickName.toUpperCase() === argUpper) {
        tag = cTag;
        isNickname = true;
        break;
      }
    }
    if (!isNickname && !tag.startsWith('#')) {
      tag = '#' + tag;
    }

    let loadingMsg;
    let progressInterval;
    try {
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType , MessageFlags } = require('discord.js');

      let progress = 0;
      const getBar = (p) => `\u001b[1;32m${"▰".repeat(p)}\u001b[0m\u001b[30m${"▱".repeat(5 - p)}\u001b[0m`;

      const loadEmbed = new EmbedBuilder()
        .setDescription(`Loading war weight of players...\n\`\`\`ansi\n[${getBar(0)}] (0%)\n\`\`\``)
        .setColor("Random");
      loadingMsg = await message.channel.send({ embeds: [loadEmbed] });

      progressInterval = setInterval(() => {
        progress++;
        if (progress > 4) progress = 4;
        const newEmbed = new EmbedBuilder()
          .setDescription(`Loading war weight of players...\n\`\`\`ansi\n[${getBar(progress)}] (${progress * 20}%)\n\`\`\``)
          .setColor("Random");
        loadingMsg.edit({ embeds: [newEmbed] }).catch(() => {});
      }, 1000);

      const guild = message.guild || message.client.guilds.cache.get('1153720899715993681');
      let pages = await fwaClanData(tag, { ...context, guild });
      
      clearInterval(progressInterval);
      
      if (pages.length === 0) {
        await loadingMsg.delete().catch(() => {});
        return message.channel.send("❌ No data found.");
      }

      // Briefly show 100% before displaying the result
      const fullEmbed = new EmbedBuilder()
          .setDescription(`Loading war weight of players...\n\`\`\`ansi\n[${getBar(5)}] (100%)\n\`\`\``)
          .setColor("Random");
      await loadingMsg.edit({ embeds: [fullEmbed] }).catch(() => {});

      let currentPage = 0;

      const leftEmoji = emojiUtils.getEmojiObject("larrow");
      const rightEmoji = emojiUtils.getEmojiObject("rarrow");
      const refreshEmoji = emojiUtils.getEmojiObject("refresh");

      const getRow = (page, maxPages) => {
        const row = new ActionRowBuilder();
        
        const prevBtn = new ButtonBuilder()
          .setCustomId('ww_prev')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0 || maxPages <= 1);
        if (leftEmoji && leftEmoji.id) prevBtn.setEmoji({ id: leftEmoji.id });
        else prevBtn.setEmoji('⬅️');

        const nextBtn = new ButtonBuilder()
          .setCustomId('ww_next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === maxPages - 1 || maxPages <= 1);
        if (rightEmoji && rightEmoji.id) nextBtn.setEmoji({ id: rightEmoji.id });
        else nextBtn.setEmoji('➡️');

        const refreshBtn = new ButtonBuilder()
          .setCustomId('ww_refresh')
          .setStyle(ButtonStyle.Secondary);
        if (refreshEmoji && refreshEmoji.id) refreshBtn.setEmoji({ id: refreshEmoji.id });
        else refreshBtn.setEmoji('🔄');

        const compoBtn = new ButtonBuilder()
          .setCustomId('ww_compo')
          .setStyle(ButtonStyle.Secondary);
        const memEmoji = emojiUtils.getEmojiObject("mem");
        if (memEmoji && memEmoji.id) compoBtn.setEmoji({ id: memEmoji.id });
        else compoBtn.setEmoji('👥');

        row.addComponents(prevBtn, nextBtn, refreshBtn, compoBtn);
        return row;
      };

      await loadingMsg.edit({ 
        embeds: [pages[currentPage]], 
        components: [getRow(currentPage, pages.length)] 
      });
      const msg = loadingMsg;

      const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        filter: (i) => (i.customId === 'ww_prev' || i.customId === 'ww_next' || i.customId === 'ww_refresh' || i.customId === 'ww_compo') && i.user.id === message.author.id,
        time: 30 * 60 * 1000
      });

      collector.on("collect", async (i) => {
        try {
          if (i.user.id !== message.author.id) {
            return i.reply({ content: "⚠️ You cannot use these buttons!", flags: [MessageFlags.Ephemeral] });
          }

          if (i.customId === 'ww_compo') {
            await i.deferReply({ flags: [MessageFlags.Ephemeral] });
            try {
              const clan = await context.coc.getClan(tag);
              const thEmojis = {
                18: emojiUtils.getEmoji("th18"), 17: emojiUtils.getEmoji("th17"), 16: emojiUtils.getEmoji("th16"),
                15: emojiUtils.getEmoji("th15"), 14: emojiUtils.getEmoji("th14"), 13: emojiUtils.getEmoji("th13"),
                12: emojiUtils.getEmoji("th12"), 11: emojiUtils.getEmoji("th11")
              };
              const thCounts = {};
              let totalTH = 0;
              let totalMembers = 0;

              clan.memberList.forEach(m => {
                thCounts[m.townHallLevel] = (thCounts[m.townHallLevel] || 0) + 1;
                totalTH += m.townHallLevel;
                totalMembers++;
              });

              const sortedTH = Object.entries(thCounts).sort((a, b) => b[0] - a[0]);
              let desc = "";
              sortedTH.forEach(entry => {
                const emojiStr = thEmojis[entry[0]] || "🏰";
                desc += `**TH${entry[0]}** ${emojiStr} **${entry[1]}**\n`;
              });

              let eqvDesc = "";
              const eqvCounts = pages.eqvCounts || {};
              const sortedEqvTH = Object.entries(eqvCounts).sort((a, b) => b[0] - a[0]);
              sortedEqvTH.forEach(entry => {
                const emojiStr = thEmojis[entry[0]] || "🏰";
                eqvDesc += `**TH${entry[0]}** ${emojiStr} **${entry[1]}**\n`;
              });

              const avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";
              const now = new Date();
              const options = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
              const timestamp = now.toLocaleString('en-GB', options).replace(',', '');
              const { EmbedBuilder } = require('discord.js');
              
              const compoEmbed = new EmbedBuilder()
                .setTitle(clan.name + " Townhalls")
                .addFields(
                  { name: "CoC API Compo", value: desc || "No data", inline: true },
                  { name: "War Weight Compo", value: eqvDesc || "No data", inline: true }
                )
                .setColor(0xFF0000)
                .setThumbnail(clan.badgeUrls.medium)
                .setFooter({ text: "Accounts: " + totalMembers + " | Avg TH: " + avgTH + " | Updated: " + timestamp });

              const compoRefreshBtn = new ButtonBuilder()
                .setCustomId("ww_compo_refresh_" + tag.replace("#", ""))
                .setLabel("Refresh Data")
                .setStyle(ButtonStyle.Secondary);
              if (refreshEmoji && refreshEmoji.id) compoRefreshBtn.setEmoji({ id: refreshEmoji.id });
              else compoRefreshBtn.setEmoji("🔄");

              const compoBtnRow = new ActionRowBuilder().addComponents(compoRefreshBtn);
              await i.editReply({ embeds: [compoEmbed], components: [compoBtnRow] });
            } catch (err) {
              console.error(err);
              await i.editReply({ content: "❌ Error fetching compo data." });
            }
            return;
          }

          if (i.customId === 'ww_refresh') {
            try {
              pages = await fwaClanData(tag, { ...context, guild });
            } catch (fetchErr) {
              console.error("ww command refresh error:", fetchErr);
              return;
            }
            if (currentPage >= pages.length) {
              currentPage = pages.length - 1;
            }
            if (currentPage < 0) currentPage = 0;
          } else if (i.customId === 'ww_next' && currentPage < pages.length - 1) {
            currentPage++;
          } else if (i.customId === 'ww_prev' && currentPage > 0) {
            currentPage--;
          }

          await i.update({ 
            embeds: [pages[currentPage]], 
            components: [getRow(currentPage, pages.length)] 
          });
        } catch (err) {
          console.error("Button collector error:", err);
        }
      });

      collector.on("end", async () => {
        try {
          await msg.edit({ components: [] });
        } catch (err) {
          if (err.code !== 10008 && err.code !== 'ChannelNotCached') {
            console.warn("Failed to clear buttons:", err);
          }
        }
      });
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      console.error(err);
      // loadingMsg might be defined inside the try block, but we can't easily access it.
      message.channel.send("Failed to fetch FWA weight data. Check the clan tag and try again.");
    }
  }
};
