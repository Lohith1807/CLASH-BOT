const { SlashCommandBuilder } = require('discord.js');


async function buildClanEmbed(clan, { EmbedBuilder, emoji }) {
  const thEmojis = {
    18: emoji.getEmoji("th18"),
    17: emoji.getEmoji("th17"),
    16: emoji.getEmoji("th16"),
    15: emoji.getEmoji("th15"),
    14: emoji.getEmoji("th14"),
    13: emoji.getEmoji("th13"),
    12: emoji.getEmoji("th12"),
    11: emoji.getEmoji("th11"),
  };
  const thCounts = {};
  let totalTH = 0;
  let totalMembers = 0;

  for (const member of clan.memberList) {
    const th = member.townHallLevel;
    thCounts[th] = (thCounts[th] || 0) + 1;
    totalTH += th;
    totalMembers++;
  }

  const sortedTH = Object.entries(thCounts).sort((a, b) => b[0] - a[0]);

  let desc = "";
  for (const [th, count] of sortedTH) {
    const emoji = thEmojis[th] || "🏰";
    desc += `**TH${th}** ${emoji} **${count}**\n`;
  }

  const avgTH = totalMembers > 0 ? (totalTH / totalMembers).toFixed(2) : "N/A";

  const now = new Date();
  const options = { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
  const timestamp = now.toLocaleString('en-GB', options).replace(',', '');

  return new EmbedBuilder()
    .setTitle(`${clan.name} Townhalls`)
    .setDescription(desc || "No data")
    .setColor("Red")
    .setThumbnail(clan.badgeUrls.medium)
    .setFooter({
      text: `Accounts: ${totalMembers} | Avg TH: ${avgTH} | Updated: ${timestamp}`,
    });
}

module.exports = {
  name: "compo",
  description: "Show clan townhall composition",
  data: new SlashCommandBuilder()
    .setName('compo')
    .setDescription('Show clan townhall composition')
    .addStringOption(option => 
      option.setName('clan')
        .setDescription('The clan tag, nickname, or "all"')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction, context) {
    const { data: dataManager } = context;
    const focusedValue = interaction.options.getFocused().toLowerCase();
    
    const clanRoles = dataManager.getClanRoles();
    const choices = [{ name: "All Clans", value: "all" }];

    for (const [tag, info] of Object.entries(clanRoles)) {
        const name = `${info.nickName || 'Clan'} (${tag})`;
        choices.push({ name, value: tag });
    }

    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(focusedValue) || 
      choice.value.toLowerCase().includes(focusedValue)
    ).slice(0, 25);
    
    await interaction.respond(filtered);
  },

  async execute(input, args, context) {
    const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
    const ctx = isInteraction ? args : context;
    if (!ctx) return;

    const { coc, data: dataManager, EmbedBuilder } = ctx;
    try {
      if (!isInteraction && input.deletable) await input.delete().catch(() => { });

      let arg0;
      if (isInteraction) {
        arg0 = input.options.getString('clan');
        await input.deferReply().catch(() => {});
      } else {
        arg0 = args[0];
      }

      if (arg0?.toLowerCase() === "all") {
        const clanData = dataManager.getClanRoles();
        const allTags = Object.keys(clanData);

        if (allTags.length === 0) {
          return message.channel.send("⚠ No clan tags found in `clandata.json`.");
        }

        for (const tag of allTags) {
          try {
            const clan = await coc.getClan(tag);
            const embed = await buildClanEmbed(clan, ctx);
            if (isInteraction) {
               await input.followUp({ embeds: [embed] });
            } else {
               await input.channel.send({ embeds: [embed] });
            }
          } catch (err) {
            console.error(`❌ Error loading clan ${tag}:`, err);
            const errMsg = `⚠ Error loading data for clan tag \`${tag}\``;
            if (isInteraction) await input.followUp(errMsg);
            else await input.channel.send(errMsg);
          }
        }
        
        if (isInteraction) await input.deleteReply().catch(() => {});
        return;
      }

      if (!arg0) {
        const usageMsg = "⚠ Usage: `/compo clan:` or `;compo #CLANTAG`, `;compo nickname`, or `;compo all`";
        if (isInteraction) return await input.editReply(usageMsg);
        return await input.channel.send(usageMsg);
      }

      let clanTag = arg0;

      const clanRoles = dataManager.getClanRoles();
      const argUpper = clanTag.toUpperCase();
      for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.nickName && info.nickName.toUpperCase() === argUpper) {
          clanTag = tag;
          break;
        }
      }

      const clan = await coc.getClan(clanTag);
      const embed = await buildClanEmbed(clan, ctx);

      const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = ctx;
      const refreshEmoji = ctx.emoji.getEmojiObject("refresh");
      const btn = new ButtonBuilder()
        .setCustomId("compo_refresh_" + clanTag.replace("#", ""))
        .setLabel("Refresh Data")
        .setStyle(ButtonStyle.Secondary);

      if (refreshEmoji) {
        btn.setEmoji(refreshEmoji);
      } else {
        btn.setEmoji("🔄");
      }

      const buttonRow = new ActionRowBuilder().addComponents(btn);
      
      if (isInteraction) {
        await input.editReply({ embeds: [embed], components: [buttonRow] });
      } else {
        await input.channel.send({ embeds: [embed], components: [buttonRow] });
      }

    } catch (error) {
      try {
        const errMsg = "⚠ There was an error processing your command.";
        if (isInteraction && !input.replied && !input.deferred) await input.reply(errMsg);
        else if (isInteraction) await input.editReply(errMsg);
        else await input.channel.send(errMsg);
      } catch { }
    }
  },
};
