const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
  name: "rww",
  description: "Get clan townhall composition (CoC API & War Weight Compo)",
  async execute(message, args, context) {
    if (message.deletable) message.delete().catch(() => {});

    const { emoji: emojiUtils, data: dataManager, coc } = context;
    const fwaClanData = require("../../../utils/fwadata.js");

    const input = args.join(" ").trim();
    if (!input) {
      return message.channel.send(`⚠️ Please provide a clan nickname or tag. Example: \`${context.prefix}rww clannickname\` or \`${context.prefix}rww #CLANTAG\``);
    }

    const clanRoles = dataManager.getClanRoles();
    const inputUpper = input.toUpperCase();
    const firstArgUpper = args[0] ? args[0].toUpperCase() : "";
    let tag = input;
    let isNickname = false;

    // Check by full input string or first argument against clan nicknames
    for (const [cTag, info] of Object.entries(clanRoles)) {
      if (info.nickName && (info.nickName.toUpperCase() === inputUpper || info.nickName.toUpperCase() === firstArgUpper)) {
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
      let progress = 0;
      const getBar = (p) => `\u001b[1;32m${"▰".repeat(p)}\u001b[0m\u001b[30m${"▱".repeat(5 - p)}\u001b[0m`;

      const loadEmbed = new EmbedBuilder()
        .setDescription(`Loading townhall composition...\n\`\`\`ansi\n[${getBar(0)}] (0%)\n\`\`\``)
        .setColor("Random");
      loadingMsg = await message.channel.send({ embeds: [loadEmbed] });

      progressInterval = setInterval(() => {
        progress++;
        if (progress > 4) progress = 4;
        const newEmbed = new EmbedBuilder()
          .setDescription(`Loading townhall composition...\n\`\`\`ansi\n[${getBar(progress)}] (${progress * 20}%)\n\`\`\``)
          .setColor("Random");
        loadingMsg.edit({ embeds: [newEmbed] }).catch(() => {});
      }, 1000);

      const guild = message.guild || message.client.guilds.cache.get('1153720899715993681');
      const [clan, pages] = await Promise.all([
        coc.getClan(tag).catch(err => {
          console.error("coc.getClan error in rww:", err.message);
          return null;
        }),
        fwaClanData(tag, { ...context, guild }).catch(err => {
          console.error("fwaClanData error in rww:", err.message);
          return null;
        })
      ]);

      if (progressInterval) clearInterval(progressInterval);

      if (!clan) {
        return loadingMsg.edit({ 
          content: `❌ Could not find clan with tag or nickname: **${input}**. Please check and try again.`, 
          embeds: [] 
        });
      }

      // Briefly show 100% before displaying the result
      const fullEmbed = new EmbedBuilder()
        .setDescription(`Loading townhall composition...\n\`\`\`ansi\n[${getBar(5)}] (100%)\n\`\`\``)
        .setColor("Random");
      await loadingMsg.edit({ embeds: [fullEmbed] }).catch(() => {});

      const thEmojis = {
        18: emojiUtils.getEmoji("th18"), 17: emojiUtils.getEmoji("th17"), 16: emojiUtils.getEmoji("th16"),
        15: emojiUtils.getEmoji("th15"), 14: emojiUtils.getEmoji("th14"), 13: emojiUtils.getEmoji("th13"),
        12: emojiUtils.getEmoji("th12"), 11: emojiUtils.getEmoji("th11")
      };

      const thCounts = {};
      let totalTH = 0;
      let totalMembers = 0;

      if (clan.memberList && Array.isArray(clan.memberList)) {
        clan.memberList.forEach(m => {
          thCounts[m.townHallLevel] = (thCounts[m.townHallLevel] || 0) + 1;
          totalTH += m.townHallLevel;
          totalMembers++;
        });
      }

      const sortedTH = Object.entries(thCounts).sort((a, b) => b[0] - a[0]);
      let desc = "";
      sortedTH.forEach(entry => {
        const emojiStr = thEmojis[entry[0]] || "🏰";
        desc += `**TH${entry[0]}** ${emojiStr} **${entry[1]}**\n`;
      });

      let eqvDesc = "";
      const eqvCounts = (pages && pages.eqvCounts) ? pages.eqvCounts : {};
      const sortedEqvTH = Object.entries(eqvCounts).sort((a, b) => b[0] - a[0]);
      sortedEqvTH.forEach(entry => {
        const emojiStr = thEmojis[entry[0]] || "🏰";
        eqvDesc += `**TH${entry[0]}** ${emojiStr} **${entry[1]}**\n`;
      });

      const avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";
      const now = new Date();
      const options = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
      const timestamp = now.toLocaleString('en-GB', options).replace(',', '');

      const compoEmbed = new EmbedBuilder()
        .setTitle(clan.name + " Townhalls")
        .addFields(
          { name: "CoC API Compo", value: desc || "No data", inline: true },
          { name: "War Weight Compo", value: eqvDesc || "No data", inline: true }
        )
        .setColor(0xFF0000)
        .setThumbnail(clan.badgeUrls ? (clan.badgeUrls.medium || clan.badgeUrls.small) : null)
        .setFooter({ text: "Accounts: " + totalMembers + " | Avg TH: " + avgTH + " | Updated: " + timestamp });

      const refreshEmoji = emojiUtils.getEmojiObject("refresh");
      const compoRefreshBtn = new ButtonBuilder()
        .setCustomId("ww_compo_refresh_" + tag.replace("#", ""))
        .setLabel("Refresh Data")
        .setStyle(ButtonStyle.Secondary);

      if (refreshEmoji && refreshEmoji.id) compoRefreshBtn.setEmoji({ id: refreshEmoji.id });
      else compoRefreshBtn.setEmoji("🔄");

      const compoBtnRow = new ActionRowBuilder().addComponents(compoRefreshBtn);

      await loadingMsg.edit({ embeds: [compoEmbed], components: [compoBtnRow] });
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      console.error("rww command error:", err);
      if (loadingMsg) {
        await loadingMsg.edit({ content: `❌ Failed to fetch townhall composition for **${input}**. Please try again.`, embeds: [], components: [] }).catch(() => {});
      } else {
        message.channel.send(`❌ Failed to fetch townhall composition for **${input}**. Please try again.`).catch(() => {});
      }
    }
  }
};
