const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const fs = require("fs");
const path = require("path");

function getCwlClans() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, "../../../data/cwlclans.json"), "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function calculateEmbedSize(embed) {
  let size = 0;
  if (embed.data.title) size += embed.data.title.length;
  if (embed.data.description) size += embed.data.description.length;
  if (embed.data.footer?.text) size += embed.data.footer.text.length;
  if (embed.data.author?.name) size += embed.data.author.name.length;
  if (embed.data.fields) {
    for (const field of embed.data.fields) {
      size += field.name.length + field.value.length;
    }
  }
  return size;
}

async function buildClanEmbed(clanTag, data, clanData, { EmbedBuilder, emoji }) {
  if (!clanData) return null;

  const stored = data[clanTag] || { leaders: [], coLeaders: [] };
  const tagNoHash = clanTag.replace("#", "");
  const tagWithHash = encodeURIComponent("#" + tagNoHash);

  const diamondEmoji = emoji.getEmoji("whitefwa");
  const leaderEmoji = emoji.getEmoji("fwalead");
  const th18Emoji = emoji.getEmoji("th18");
  const th17Emoji = emoji.getEmoji("th17");
  const th16Emoji = emoji.getEmoji("th16");
  const th15Emoji = emoji.getEmoji("th15");
  const th14Emoji = emoji.getEmoji("th14");
  const capitalEmoji = emoji.getEmoji("ccw");
  const castleEmoji = emoji.getEmoji("clancastle");
  const leagueEmoji = emoji.getEmoji("cwl");
  const arrowEmoji = emoji.getEmoji("arrow");
  const clashEmoji = emoji.getEmoji("coc");
  const crownEmoji = emoji.getEmoji("crown");
  const memEmoji = emoji.getEmoji("mem");

  const joinTypeMap = {
    open:       emoji.getEmoji("gtick") + " Anyone Can Join",
    inviteOnly: emoji.getEmoji("question") + " Invite Only",
    closed:     emoji.getEmoji("bluex") + " Closed"
  };
  const joinType = joinTypeMap[clanData.type] || clanData.type || "Unknown";

  const familyFriendly = clanData.isFamilyFriendly === true
    ? emoji.getEmoji("heart") + " Yes"
    : emoji.getEmoji("bluex") + " No";

  var description =
    diamondEmoji + " **FWA** " + diamondEmoji + "\n" +
    leaderEmoji + " **Accepting:** " + th18Emoji + " " + th17Emoji + " " + th16Emoji + " " + th15Emoji + " " + th14Emoji + "\n" +
    capitalEmoji + " **Clan Capital:** " + (clanData.clanCapital ? clanData.clanCapital.capitalHallLevel : "?") + "\n" +
    castleEmoji + " **Clan Level:** " + clanData.clanLevel + "\n" +
    leagueEmoji + " **CWL:** Lazy Cwl\n" +
    memEmoji + " **Members:** " + clanData.members + "/50\n" +
    emoji.getEmoji("cyandot") + " **Join Type:** " + joinType + "\n" +
    emoji.getEmoji("pinkdot") + " **Family Friendly:** " + familyFriendly + "\n\n" +
    arrowEmoji + " **Open in Game:** [Click Here](https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + tagNoHash + ")\n" +
    clashEmoji + " **Clash of Stats:** [Click Here](https://www.clashofstats.com/clans/" + tagNoHash + ")\n" +
    arrowEmoji + " **CC Link:** [Click Here](https://cc.fwafarm.com/cc_n/clan.php?tag=" + tagWithHash + ")\n\n" +
    crownEmoji + " **Leaders**:\n" + ((stored.leaders && stored.leaders.length > 0) ? stored.leaders.join("\n") : "None") + "\n" +
    crownEmoji + " **Co-Leaders**:\n" + ((stored.coLeaders && stored.coLeaders.length > 0) ? stored.coLeaders.join("\n") : "None") + "\n\n";

  if (description.length > 4096) {
    description = description.slice(0, 4093) + "...";
  }

  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle(clanData.name + " (" + clanTag + ")")
    .setThumbnail(clanData.badgeUrls ? clanData.badgeUrls.large : null)
    .setDescription(description);
}

async function buildWarClanEmbed(clanTag, context) {
  var coc = context.coc;
  var EmbedBuilder = context.EmbedBuilder;
  var getEmoji = context.emoji.getEmoji;

  var clan = await coc.getClan(clanTag);

  var totalWars = clan.warWins + (clan.warLosses || 0);
  var winRatio = totalWars > 0 ? (clan.warWins / totalWars).toFixed(2) : "0.00";
  var link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clan.tag.replace("#", "");
  var locationStr = clan.location && clan.location.name ? "🌐 " + clan.location.name : "N/A";
  var leaderMember = clan.memberList.find(function (m) { return m.role === "leader"; });
  var leaderName = leaderMember ? leaderMember.name : "Unknown";

  var joinTypeMap = {
    open:       getEmoji("gtick") + " Anyone Can Join",
    inviteOnly: getEmoji("question") + " Invite Only",
    closed:     getEmoji("bluex") + " Closed"
  };
  var joinType = joinTypeMap[clan.type] || clan.type || "Unknown";

  var familyFriendly = clan.isFamilyFriendly === true
    ? getEmoji("heart") + " Yes"
    : getEmoji("bluex") + " No";

  var embed = new EmbedBuilder()
    .setTitle(clan.name)
    .setThumbnail(clan.badgeUrls ? clan.badgeUrls.medium : null)
    .setColor(Math.floor(Math.random() * 0xffffff))
    .setDescription(
      "Tag: [" + clan.tag + "](" + link + ")\n" +
      "Trophies: " + getEmoji("throphy") + " " + clan.clanPoints + " | " + getEmoji("clancastle") + " " + (clan.clanCapitalPoints || 0) + "\n" +
      "Required Trophies: " + getEmoji("throphy") + " " + clan.requiredTrophies + "\n" +
      "Location: " + locationStr + "\n\n" +
      "Leader: " + leaderName + "\n" +
      "Level: " + clan.clanLevel + "\n" +
      "Members: " + getEmoji("mem") + " " + clan.members + "/50\n" +
      "Join Type: " + joinType + "\n" +
      "Family Friendly: " + familyFriendly + "\n\n" +
      "CWL: " + (clan.warLeague ? clan.warLeague.name : "N/A") + "\n" +
      "Wars Won: " + getEmoji("uparrow") + " " + clan.warWins + "\n" +
      "Wars Lost: " + getEmoji("downarrow") + " " + (clan.warLosses || 0) + "\n" +
      "War Streak: " + getEmoji("graph") + " " + clan.warWinStreak + "\n" +
      "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
      "Description: " + (clan.description || "No description provided.")
    )
    .setTimestamp();

  return embed;
}

async function buildCwlClanEmbed(clanTag, cwlData, clanData, { EmbedBuilder, emoji }) {
  if (!clanData) return null;

  const stored = cwlData[clanTag] || {}; 
  const style = stored.style || "lazy";

  const tagNoHash = clanTag.replace("#", "");

  const leagueEmoji = emoji.getEmoji("cwl") || "🏆";
  const castleEmoji = emoji.getEmoji("clancastle") || "🏰";
  const arrowEmoji = emoji.getEmoji("arrow") || "➡️";
  const clashEmoji = emoji.getEmoji("coc") || "⚔️";
  const memEmoji = emoji.getEmoji("mem") || "👥";

  var description =
    leagueEmoji + " **" + (style.charAt(0).toUpperCase() + style.slice(1)) + " CWL** " + leagueEmoji + "\n" +
    castleEmoji + " **Clan Level:** " + clanData.clanLevel + "\n" +
    memEmoji + " **Members:** " + clanData.members + "/50\n" +
    leagueEmoji + " **League:** " + (clanData.warLeague ? clanData.warLeague.name : "Unranked") + "\n\n" +
    arrowEmoji + " **Open in Game:** [Click Here](https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + tagNoHash + ")\n" +
    clashEmoji + " **Clash of Stats:** [Click Here](https://www.clashofstats.com/clans/" + tagNoHash + ")\n";

  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(clanData.name + " (" + clanTag + ")")
    .setThumbnail(clanData.badgeUrls ? clanData.badgeUrls.large : null)
    .setDescription(description)
    .setTimestamp();
}

async function buildAvailabilityEmbed(tags, title, context) {
  var coc = context.coc;
  var EmbedBuilder = context.EmbedBuilder;

  var text = "";
  for(let tag of tags) {
    try {
      var clan = await coc.getClan(tag);
      if(clan.members < 50) {
        text += "**" + clan.name + "** (`" + clan.tag + "`) - **" + (50 - clan.members) + "** spots left\n";
      }
    } catch(err) {}
  }
  
  if(!text) text = "No clans have available spots right now.";

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(text)
    .setColor(0x3498DB);
}

module.exports = {
  name: "clan",
  buildClanEmbed,
  buildWarClanEmbed,
  buildCwlClanEmbed,
  buildAvailabilityEmbed,
  async execute(message, args, context) {
    const { coc, data: dataManager, emoji: emojiUtils, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = context;
    var getEmoji = emojiUtils.getEmoji;
    var getEmojiObject = emojiUtils.getEmojiObject;

    if (message.deletable) message.delete().catch(function () { });

    if (message.mentions.users.size > 0) {
      const userId = message.mentions.users.first().id;
      const data = dataManager.getClanRoles();
      const entries = Object.entries(data).filter(function ([clanTag, info]) {
        return (info.leaders && info.leaders.includes("<@" + userId + ">")) ||
          (info.coLeaders && info.coLeaders.includes("<@" + userId + ">"));
      });

      if (entries.length === 0) return message.channel.send("That user is not linked to any clan.");

      const fwaEntries = entries.filter(([, cfg]) => (cfg.clanType || "fwa").toLowerCase() !== "war");
      const warEntries = entries.filter(([, cfg]) => (cfg.clanType || "fwa").toLowerCase() === "war");

      for (const [clanTag, clanConfig] of fwaEntries) {
        try {
          const clanData = await coc.getClan(clanTag);
          const embed = await buildClanEmbed(clanTag, data, clanData, context);
          if (!embed) continue;

          const refreshEmoji = emojiUtils.getEmojiObject("refresh");
          const refreshBtn = new ButtonBuilder()
            .setCustomId("wclans_refresh_fwa_" + clanTag.replace("#", ""))
            .setLabel("Refresh Data")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(refreshEmoji || "🔄");
          const btnRow = new ActionRowBuilder().addComponents(refreshBtn);

          await message.channel.send({ embeds: [embed], components: [btnRow] });
        } catch (err) {
          if (err.response) {
            if (err.response.status !== 404) {
              console.error(`Error fetching FWA clan info for @user: Clash API returned status ${err.response.status}`);
            }
          } else {
            console.error("Error fetching FWA clan info for @user:", err.message || err);
          }
        }
      }

      for (const [clanTag] of warEntries) {
        try {
          const embed = await buildWarClanEmbed(clanTag, context);
          if (!embed) continue;

          const getEmojiObject = emojiUtils.getEmojiObject;
          const refreshEmoji = getEmojiObject("refresh");
          const btn = new ButtonBuilder()
            .setCustomId("wclans_refresh_war_" + clanTag.replace("#", ""))
            .setLabel("Refresh Data")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(refreshEmoji || "🔄");
          const btnRow = new ActionRowBuilder().addComponents(btn);

          await message.channel.send({ embeds: [embed], components: [btnRow] });
        } catch (err) {
          if (err.response) {
            if (err.response.status !== 404) {
              console.error(`Error fetching WAR clan info for @user: Clash API returned status ${err.response.status}`);
            }
          } else {
            console.error("Error fetching WAR clan info for @user:", err.message || err);
          }
        }
      }

      return;
    }

    if (args[0]) {
      const arg = args[0].toUpperCase();
      let clanTag = null;
      let isNickname = false;
      const clanRoles = dataManager.getClanRoles();

      for (const [tag, info] of Object.entries(clanRoles)) {
        if (info.nickName && info.nickName.toUpperCase() === arg) {
          clanTag = tag;
          isNickname = true;
          break;
        }
      }

      if (!clanTag) {
        clanTag = arg.startsWith("#") ? arg : "#" + arg;
      }

      if (!isNickname) {
        return showWarClanDetail(message, clanTag, context, arg);
      }

      try {
        const clanData = await coc.getClan(clanTag);
        const data = dataManager.getClanRoles();
        const embed = await buildClanEmbed(clanTag, data, clanData, context);
        if (!embed) return message.channel.send("Could not generate clan info.");

        const refreshEmoji = emojiUtils.getEmojiObject("refresh");
        const refreshBtn = new ButtonBuilder()
          .setCustomId("wclans_refresh_fwa_" + clanTag.replace("#", ""))
          .setLabel("Refresh Data")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(refreshEmoji || "🔄");
        const btnRow = new ActionRowBuilder().addComponents(refreshBtn);

        return message.channel.send({ embeds: [embed], components: [btnRow] });
      } catch (err) {
        if (err.response) {
          if (err.response.status !== 404) {
            console.error(`Clash API Error: ${err.config?.method?.toUpperCase()} ${err.config?.url} returned status ${err.response.status}`);
          }
        } else {
          console.error("Error in clan execute:", err.message || err);
        }

        if (err.response) {
          const status = err.response.status;
          if (status === 404) {
            const embed = new EmbedBuilder()
              .setTitle("❌ Clan Not Found")
              .setDescription(`Clan is not found with nickname: \`${arg}\``)
              .setColor(0xFF0000)
              .setTimestamp();
            return message.channel.send({ embeds: [embed] });
          }
          if (status === 503) {
            const embed = new EmbedBuilder()
              .setTitle("❌ API Maintenance")
              .setDescription("Clash of Clans API is currently in maintenance. Please try again later.")
              .setColor(0xFF0000)
              .setTimestamp();
            return message.channel.send({ embeds: [embed] });
          }
          if (status === 403) {
            const embed = new EmbedBuilder()
              .setTitle("❌ Access Denied")
              .setDescription("Can't access Clash of Clans API. Please contact server admins.")
              .setColor(0xFF0000)
              .setTimestamp();
            return message.channel.send({ embeds: [embed] });
          }
        }

        const embed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("An error occurred while fetching clan data. Please re-check the tag/nickname and try again.")
          .setColor(0xFF0000)
          .setTimestamp();
        return message.channel.send({ embeds: [embed] });
      }
    }

    var loadingMsg = await message.channel.send("⏳ Fetching dashboard...");

    const arrowAnim  = getEmoji("arrow");
    const crownAnim  = getEmoji("crown");
    const fightAnim  = getEmoji("cocfight");
    const fwaAnim    = getEmoji("bluefwa");
    const heartAnim  = getEmoji("heart");
    const starAnim   = getEmoji("bluestar");
    const graphAnim  = getEmoji("graph");
    const upAnim     = getEmoji("uparrow");
    const cocEmoji   = getEmoji("coc");
    const cwlEmoji   = getEmoji("cwl");

    var description =
      crownAnim + " **Blood Alliance** — A powerhouse family of elite clans.\n" +
      heartAnim + " Built for wars, farming, CWL, and nonstop growth.\n" +
      fightAnim + " From casual players to hardcore warriors — **we have a home for everyone.**\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      fwaAnim + " **FWA Clans** — Lazy war farming, max loot, zero stress.\n" +
      fightAnim + " **WAR Clans** — Competitive wars, serious attackers only.\n" +
      cwlEmoji + " **CWL Clans** — Clan War League, battle for medals & glory.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      arrowAnim + " **Select a category below to explore our clans!**";

    const clanBanner = new AttachmentBuilder("./assets/images/cocba.png");

    var embed = new EmbedBuilder()
      .setTitle(cocEmoji + "  Blood Alliance Family Clans  " + cocEmoji)
      .setColor(0xD4A017)
      .setDescription(description)
      .setImage("attachment://cocba.png")
      .setFooter({ text: "Blood Alliance" })
      .setTimestamp();

    var row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("clans10_btn_fwa").setLabel("FWA Clans").setStyle(ButtonStyle.Primary).setEmoji(getEmojiObject("bluefwa") || "💎"),
      new ButtonBuilder().setCustomId("clans10_btn_war").setLabel("WAR Clans").setStyle(ButtonStyle.Danger).setEmoji(getEmojiObject("cocfight") || "⚔️"),
      new ButtonBuilder().setCustomId("clans10_btn_cwl").setLabel("CWL Clans").setStyle(ButtonStyle.Success).setEmoji(getEmojiObject("cwl") || "🏆")
    );

    var row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("clans_info_fwa").setLabel("What is FWA?").setStyle(ButtonStyle.Primary).setEmoji(getEmojiObject("question") || "ℹ️"),
      new ButtonBuilder().setCustomId("clans_info_cwl").setLabel("What is CWL?").setStyle(ButtonStyle.Danger).setEmoji(getEmojiObject("cwl") || "🏆"),
      new ButtonBuilder().setCustomId("clans_info_stats").setLabel("Statistics").setStyle(ButtonStyle.Success).setEmoji(getEmojiObject("graph") || "📊")
    );

    await loadingMsg.edit({ content: null, embeds: [embed], components: [row1, row2], files: [clanBanner] });
  },
};

async function showWarClanDetail(message, clanTag, context, originalArg) {
  var coc = context.coc;
  var dataManager = context.data;
  var EmbedBuilder = context.EmbedBuilder;
  var ActionRowBuilder = context.ActionRowBuilder;
  var StringSelectMenuBuilder = context.StringSelectMenuBuilder;
  var ButtonBuilder = context.ButtonBuilder;
  var ButtonStyle = context.ButtonStyle;
  var getEmoji = context.emoji.getEmoji;
  var getEmojiObject = context.emoji.getEmojiObject;

  try {
    var clan = await coc.getClan(clanTag);

    var totalWars = clan.warWins + (clan.warLosses || 0);
    var winRatio = totalWars > 0 ? (clan.warWins / totalWars).toFixed(2) : "0.00";
    var link = "https://link.clashofclans.com/en?action=OpenClanProfile&tag=" + clan.tag.replace("#", "");
    var locationStr = clan.location && clan.location.name ? "🌐 " + clan.location.name : "N/A";
    var leaderMember = clan.memberList.find(function (m) { return m.role === "leader"; });
    var leaderName = leaderMember ? leaderMember.name : "Unknown";

    var joinTypeMap = {
      open:       getEmoji("gtick") + " Anyone Can Join",
      inviteOnly: getEmoji("question") + " Invite Only",
      closed:     getEmoji("bluex") + " Closed"
    };
    var joinType = joinTypeMap[clan.type] || clan.type || "Unknown";

    var familyFriendly = clan.isFamilyFriendly === true
      ? getEmoji("heart") + " Yes"
      : getEmoji("bluex") + " No";

    var embed = new EmbedBuilder()
      .setTitle(clan.name)
      .setThumbnail(clan.badgeUrls ? clan.badgeUrls.medium : null)
      .setColor(Math.floor(Math.random() * 0xffffff))
      .setDescription(
        "Tag: [" + clan.tag + "](" + link + ")\n" +
        "Trophies: " + getEmoji("throphy") + " " + clan.clanPoints + " | " + getEmoji("clancastle") + " " + (clan.clanCapitalPoints || 0) + "\n" +
        "Required Trophies: " + getEmoji("throphy") + " " + clan.requiredTrophies + "\n" +
        "Location: " + locationStr + "\n\n" +
        "Leader: " + leaderName + "\n" +
        "Level: " + clan.clanLevel + "\n" +
        "Members: " + getEmoji("mem") + " " + clan.members + "/50\n" +
        getEmoji("cyandot") + " Join Type: " + joinType + "\n" +
        getEmoji("pinkdot") + " Family Friendly: " + familyFriendly + "\n\n" +
        "CWL: " + (clan.warLeague ? clan.warLeague.name : "N/A") + "\n" +
        "Wars Won: " + getEmoji("uparrow") + " " + clan.warWins + "\n" +
        "Wars Lost: " + getEmoji("downarrow") + " " + (clan.warLosses || 0) + "\n" +
        "War Streak: " + getEmoji("graph") + " " + clan.warWinStreak + "\n" +
        "Win Ratio: " + getEmoji("graph") + " " + winRatio + "\n\n" +
        "Description: " + (clan.description || "No description provided.")
      )
      .setTimestamp();

    var selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("wclans_select_" + clan.tag.replace("#", ""))
        .setPlaceholder("Select to see more details...")
        .addOptions([
          { label: "Player Tags & Roles", description: "View player tags and clan roles", value: "tags_roles", emoji: getEmojiObject("mem") },
          { label: "Trophies & League", description: "View current trophies and leagues", value: "trophies_league", emoji: getEmojiObject("throphy") },
          { label: "Last Joining Date", description: "View when members joined the clan", value: "joining", emoji: getEmojiObject("alaram") },
          { label: "Player Progress", description: "View player levels and progress", value: "progress", emoji: getEmojiObject("graph") },
          { label: "Attacks & Defenses", description: "View combat statistics", value: "attacks_defenses", emoji: getEmojiObject("cocfight") },
          { label: "War History", description: "View recent clan war logs", value: "warlog", emoji: getEmojiObject("cwl") }
        ])
    );

    var refreshEmoji = getEmojiObject("refresh");
    var btn = new ButtonBuilder()
      .setCustomId("wclans_refresh_war_" + clan.tag.replace("#", ""))
      .setLabel("Refresh Data")
      .setStyle(ButtonStyle.Secondary);

    if (refreshEmoji) {
      btn.setEmoji(refreshEmoji);
    } else {
      btn.setEmoji("🔄");
    }

    var buttonRow = new ActionRowBuilder().addComponents(btn);

    await message.channel.send({ embeds: [embed], components: [selectRow, buttonRow] });
  } catch (err) {
    if (err.response) {
      if (err.response.status !== 404) {
        console.error(`Clash API Error: ${err.config?.method?.toUpperCase()} ${err.config?.url} returned status ${err.response.status}`);
      }
    } else {
      console.error("Error in showWarClanDetail:", err.message || err);
    }

    if (err.response) {
      if (err.response.status === 404) {
        if (originalArg && originalArg.startsWith("#")) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Clan Not Found")
            .setDescription(`Clan is not found with tag: \`${originalArg}\``)
            .setColor(0xFF0000)
            .setTimestamp();
          return message.channel.send({ embeds: [embed] });
        } else {
          const clanRoles = dataManager.getClanRoles();
          const tags = Object.keys(clanRoles);
          let nickList = [];
          for (let i = 0; i < tags.length; i++) {
            const info = clanRoles[tags[i]];
            if (info.nickName) nickList.push(`• **${info.nickName}** (\`${tags[i]}\`)`);
          }

          const helpEmbed = new EmbedBuilder()
            .setTitle("❌ Clan Not Found")
            .setDescription(`Clan is not found with nickname: \`${originalArg || clanTag}\`\n\n**Available Nicknames:**\n${nickList.join("\n") || "No nicknames configured."}`)
            .setColor(0xFF0000)
            .setFooter({ text: "Tip: Use the nicknames above or a full clan tag (#TAG)" })
            .setTimestamp();

          return message.channel.send({ embeds: [helpEmbed] });
        }
      }
      if (err.response.status === 503) {
        const embed = new EmbedBuilder()
          .setTitle("❌ API Maintenance")
          .setDescription("Clash of Clans API is currently in maintenance. Please try again later.")
          .setColor(0xFF0000)
          .setTimestamp();
        return message.channel.send({ embeds: [embed] });
      }
      if (err.response.status === 403) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Access Denied")
          .setDescription("Can't access Clash of Clans API. Please contact server admins.")
          .setColor(0xFF0000)
          .setTimestamp();
        return message.channel.send({ embeds: [embed] });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("❌ Error fetching detailed clan data. Re-check once.")
      .setColor(0xFF0000)
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }
}
