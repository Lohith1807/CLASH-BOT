

module.exports = {
  name: "ww",
  description: "Get FWA weight report for a clan",
  async execute(message, args, context) {
    const { emoji: emojiUtils } = context;
    const fwaClanData = require("../../../utils/fwadata.js");
    const tag = args[0];
    if (!tag) {
      return message.channel.send(`⚠️ Please provide a clan tag. Example: ${context.prefix}ww #CLANTAG`);
    }

    try {
      const guild = message.guild || message.client.guilds.cache.get('1153720899715993681');
      const pages = await fwaClanData(tag, { ...context, guild });
      if (pages.length === 0) return message.channel.send("❌ No data found.");

      let currentPage = 0;

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

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

        row.addComponents(prevBtn, nextBtn, refreshBtn);
        return row;
      };

      const msg = await message.channel.send({ 
        embeds: [pages[currentPage]], 
        components: [getRow(currentPage, pages.length)] 
      });

      const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        filter: (i) => (i.customId === 'ww_prev' || i.customId === 'ww_next' || i.customId === 'ww_refresh') && i.user.id === message.author.id,
        time: 30 * 60 * 1000
      });

      collector.on("collect", async (i) => {
        try {
          if (i.user.id !== message.author.id) {
            return i.reply({ content: "⚠️ You cannot use these buttons!", ephemeral: true });
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
          console.warn("Failed to clear buttons:", err);
        }
      });
    } catch (err) {
      console.error(err);
      message.channel.send("Failed to fetch FWA weight data. Check the clan tag and try again.");
    }
  }
};
