const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const cheerio = require("cheerio");
const axios = require("axios");

async function fwaFetch(originalUrl, logger = null) {
    const workerBase = process.env.FWA_WORKER_URL;
    if (!workerBase) throw new Error("FWA_WORKER_URL is not set in .env");

    const tagMatch = originalUrl.match(/[?&]tag=([^&]+)/);
    const workerUrl = tagMatch
        ? `${workerBase}?tag=${tagMatch[1]}`
        : `${workerBase}?url=${encodeURIComponent(originalUrl)}`;

    const res = await axios.get(workerUrl, { timeout: 15000 });
    const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    const isCfBlocked = data.includes("Just a moment") || data.includes("_cf_chl_opt");
    if (isCfBlocked || data.length < 100) throw new Error("Worker returned a blocked/invalid response");
    if (logger) await logger(`✅ Worker fetch succeeded`);
    return data;
}

async function fetchCocClanAndMembers(clanTag, coc) {
  if (!clanTag) return { clan: null, members: null };
  try {
    const clanRes = await coc.getClan(clanTag);
    const membersRes = await coc.getClanMembers(clanTag);
    return { clan: clanRes, members: membersRes?.items || [] };
  } catch (err) {
    return { clan: null, members: null };
  }
}

async function fetchFwaData(clanTag, logger = null) {
  if (!clanTag) return { points: "N/A", association: "Not FWA", activeFwa: false, sync: "N/A" };
  const cleanTag = clanTag.replace(/#/g, "").toUpperCase();
  const pointsUrl = `https://points.fwafarm.com/clan?tag=${encodeURIComponent(cleanTag)}`;

  const fwa = {
    points: "N/A",
    association: "Not FWA",
    activeFwa: false,
    sync: "N/A"
  };

  try {
    const pointsHtml = await fwaFetch(pointsUrl, logger);
    const $points = cheerio.load(pointsHtml || "");
    const pointsText = $points("body").text().replace(/\s+/g, " ").trim();

    const activeFwaMatch = pointsText.match(/Active FWA:\s*(Yes|No)/i);

    // If no recognizable FWA data found → not in FWA system
    if (!activeFwaMatch) {
      fwa.association = "Not FWA";
      fwa.activeFwa = false;
      return fwa;
    }

    fwa.activeFwa = activeFwaMatch[1].toLowerCase() === "yes";
    fwa.association = fwa.activeFwa ? "Official FWA" : "Not FWA";

    const pointsMatch = pointsText.match(/Point Balance\s*[:\-]?\s*([\d,]+)/i)
      || pointsText.match(/Balance\s*[:\-]?\s*([\d,]+)/i);
    if (pointsMatch) fwa.points = pointsMatch[1].replace(/,/g, "");

    const syncMatch = pointsText.match(/Sync\s*(?:Number\s*)?[:\-]?\s*#?(\d+)/i)
      || pointsText.match(/#(\d+)\s*Sync/i);
    if (syncMatch) fwa.sync = `#${syncMatch[1]}`;

  } catch (err) {
    if (logger) await logger(`⚠️ FWA fetch failed for ${clanTag}: ${err.message}`);
  }
  return fwa;
}

function buildEmbedFromData(EmbedBuilder, clan, membersArray, fwa, emoji) {
  const leaderObj = membersArray.find(m => m.role === "leader");
  const leaderName = leaderObj?.name || "Unknown";

  const counts = { coLeader: 0, elder: 0, member: 0 };
  membersArray.forEach(m => {
    if (m.role === "coLeader") counts.coLeader++;
    else if (m.role === "admin") counts.elder++;
    else if (m.role === "member") counts.member++;
  });

  const membersCount = `${clan.members || "N/A"}/50`;
  const location = clan.location?.name || "Unknown";
  const warLeague = clan.warLeague?.name || "Unranked";
  const wins = clan.warWins ?? "N/A";
  const losses = clan.warLosses ?? "N/A";
  const draws = clan.warTies ?? "N/A";
  const streak = clan.warWinStreak ?? "N/A";

  const diamondEmoji = emoji.getEmoji("whitefwa") || "💎";
  const leaderEmoji = emoji.getEmoji("crown") || "👑";
  const memberEmoji = emoji.getEmoji("mem") || "👥";
  const statEmoji = emoji.getEmoji("graph") || "📊";
  const linkEmoji = emoji.getEmoji("link") || "🔗";
  const yesEmoji = emoji.getEmoji("gtick") || "✅";
  const noEmoji = emoji.getEmoji("bluex") || "❌";
  const arrow = emoji.getEmoji("rarroww") || "▸";
  const cyandot = emoji.getEmoji("cyandot") || "🔵";
  const orangedot = emoji.getEmoji("orangedot") || "🟠";
  const pinkdot = emoji.getEmoji("pinkdot") || "🩷";
  const bluedot = emoji.getEmoji("bluedot") || "🔹";

  const embed = new EmbedBuilder()
    .setColor(Math.floor(Math.random() * 16777215))
    .setTitle(`${clan.name} (${clan.tag})`)
    .setThumbnail(clan.badgeUrls?.large || "")
    .addFields(
      {
        name: `${leaderEmoji} Clan Information`,
        value:
          `${cyandot} **Leader:** ${leaderName}\n` +
          `${cyandot} **Members:** ${membersCount}\n` +
          `${cyandot} **Location:** ${location}\n` +
          `${cyandot} **War League:** ${warLeague}`,
        inline: false
      },
      {
        name: `${statEmoji} War Statistics`,
        value:
          `${orangedot} **Wins:** ${wins}\n` +
          `${orangedot} **Losses:** ${losses}\n` +
          `${orangedot} **Draws:** ${draws}\n` +
          `${orangedot} **Win Streak:** ${streak}`,
        inline: false
      },
      {
        name: `${memberEmoji} Leadership`,
        value:
          `${pinkdot} **Co-Leaders:** ${counts.coLeader}\n` +
          `${pinkdot} **Elders:** ${counts.elder}\n` +
          `${pinkdot} **Members:** ${counts.member}`,
        inline: false
      },
      {
        name: `${diamondEmoji} FWA Information`,
        value:
          `${bluedot} **Association:** ${fwa.association}\n` +
          `${bluedot} **Point Balance:** ${fwa.points}\n` +
          `${bluedot} **Sync Number:** ${fwa.sync}\n` +
          `${bluedot} **Active FWA:** ${fwa.activeFwa ? `${yesEmoji} Yes` : `${noEmoji} No`}`,
        inline: false
      },
      {
        name: `${linkEmoji} Links`,
        value:
          `${arrow} [In-Game](https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clan.tag.replace("#", ""))})\n` +
          `${arrow} [Clash of Stats](https://www.clashofstats.com/clans/${encodeURIComponent(clan.tag.replace("#", ""))})\n` +
          `${arrow} [FWA CC](https://cc.fwafarm.com/cc_n/clan.php?tag=${encodeURIComponent(clan.tag.replace("#", ""))})\n` +
          `${arrow} [FWA Points](https://points.fwafarm.com/clan?tag=${encodeURIComponent(clan.tag.replace("#", ""))})`,
        inline: false
      }
    )
    .setFooter({ text: "Blood Alliance" })
    .setTimestamp();

  return embed;
}

module.exports = {
  name: "claninfo",
  description: "Get detailed clan info, war stats, and FWA association.",
  data: new SlashCommandBuilder()
    .setName('claninfo')
    .setDescription('Get detailed clan info, war stats, and FWA association.')
    .addStringOption(option =>
        option.setName('clan')
            .setDescription('The clan tag, nickname, or name to lookup')
            .setRequired(true)
    ),

  async execute(input, args, context) {
    const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
    
    const ctx = isInteraction ? args : context;
    if (!ctx) return;

    const { EmbedBuilder, coc, emoji, client, data: dataManager, ActionRowBuilder, StringSelectMenuBuilder } = ctx;
    
    let clanTag = null;
    let query = null;
    let authorId = isInteraction ? input.user.id : input.author.id;

    if (isInteraction) {
        await input.deferReply().catch(() => {});
        query = input.options.getString('clan');
    } else {
        if (input.mentions.users.size > 0) {
            const userId = input.mentions.users.first().id;
            const clandata = dataManager.getClanRoles();
            const entry = Object.entries(clandata).find(([tag, info]) =>
              (info.leaders && info.leaders.includes(`<@${userId}>`)) ||
              (info.coLeaders && info.coLeaders.includes(`<@${userId}>`))
            );
            if (entry) clanTag = entry[0];
            else return input.channel.send("⚠️ That user is not linked to any clan.");
        } else if (args[0]) {
            query = args.join(" ");
        } else {
            return input.channel.send("Usage: `;claninfo #CLANTAG` or `;claninfo ClanName` or `;claninfo nickname`.");
        }
    }

    if (query && !clanTag) {
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
    }

    let animationInterval = null;
    let replyMsg = null;

    try {
      if (!isInteraction && input.deletable) input.delete().catch(() => { });

      const loadingEmoji = emoji.getEmoji("alaram") || "⏳";
      let dotCount = 0;
      const loadingColor = Math.floor(Math.random() * 16777215);
      const loadingEmbed = new EmbedBuilder()
        .setColor(loadingColor)
        .setDescription(`${loadingEmoji} Fetching Information`);
      
      if (isInteraction) {
          replyMsg = await input.editReply({ embeds: [loadingEmbed] }).catch(() => null);
      } else {
          replyMsg = await input.channel.send({ embeds: [loadingEmbed] }).catch(() => null);
      }

      if (replyMsg) {
          animationInterval = setInterval(async () => {
            dotCount = (dotCount + 1) % 4;
            const dots = ".".repeat(dotCount);
            const updatedEmbed = new EmbedBuilder()
              .setColor(loadingColor)
              .setDescription(`${loadingEmoji} Fetching Information ${dots}`);
            
            if (isInteraction) await input.editReply({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
            else await replyMsg.edit({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
          }, 1500);
      }

      const apiLogger = async (msg) => {
        const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
        const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);
        if (logChannel) await logChannel.send(`\`[CLAN CMD]\` ${msg}`).catch(() => null);
      };

      let { clan, members } = await fetchCocClanAndMembers(clanTag, coc);

      if (!clan && query && !query.startsWith("#")) {
        const clanName = query;
        if (animationInterval) clearInterval(animationInterval);

        try {
          const results = await coc.searchClans(clanName, 10);
          const clans = results?.items || [];

          if (clans.length === 0) {
            const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ No clans found matching "**${clanName}**".`);
            if (isInteraction) return await input.editReply({ embeds: [errEmbed], components: [] }).catch(() => {});
            else return await replyMsg.edit({ embeds: [errEmbed], components: [] }).catch(() => {});
          }

          if (clans.length === 1) {
            clanTag = clans[0].tag;
          } else {
            const options = clans.map((c) => ({
              label: `${c.name}`.substring(0, 100),
              description: `${c.tag} | Lvl ${c.clanLevel} | ${c.members}/50 members`.substring(0, 100),
              value: c.tag
            }));

            const customId = `claninfo_search_${authorId}_${Date.now()}`;
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(customId)
              .setPlaceholder("Select a clan...")
              .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const resultEmbed = new EmbedBuilder()
              .setColor(Math.floor(Math.random() * 16777215))
              .setTitle(`🔍 Search Results for "${clanName}"`)
              .setDescription(clans.map((c, i) => `**${i + 1}.** ${c.name} \`${c.tag}\` — Lvl ${c.clanLevel} | ${c.members}/50`).join("\n"))
              .setFooter({ text: "Select a clan from the dropdown below" });

            if (isInteraction) replyMsg = await input.editReply({ embeds: [resultEmbed], components: [row] }).catch(() => null);
            else replyMsg = await replyMsg.edit({ embeds: [resultEmbed], components: [row] }).catch(() => null);

            if (!replyMsg) return;

            try {
              const filter = (i) => i.customId === customId && i.user.id === authorId;
              const collected = await (isInteraction ? input.fetchReply() : replyMsg).awaitMessageComponent({ filter, time: 120000 }).catch(() => null);
              
              if (!collected) {
                const timeoutEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("⏰ Selection timed out (2 minutes). Please try again.");
                if (isInteraction) return await input.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                else return await replyMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
              }

              clanTag = collected.values[0];
              await collected.deferUpdate().catch(() => {});
            } catch (timeoutErr) {
            }
          }

          const refetch = await fetchCocClanAndMembers(clanTag, coc);
          clan = refetch.clan;
          members = refetch.members;
        } catch (searchErr) {
          if (searchErr.response) {
            console.error(`❌ Clan name search error: Clash API returned status ${searchErr.response.status}`);
          } else {
            console.error("❌ Clan name search error:", searchErr.message || searchErr);
          }
          const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ Error searching for clans.");
          if (isInteraction) return await input.editReply({ embeds: [errEmbed], components: [] }).catch(() => {});
          else if (replyMsg) return await replyMsg.edit({ embeds: [errEmbed], components: [] }).catch(() => {});
          return;
        }

        if (isInteraction) await input.editReply({ embeds: [loadingEmbed], components: [] }).catch(() => {});
        else if (replyMsg) await replyMsg.edit({ embeds: [loadingEmbed], components: [] }).catch(() => {});

        if (replyMsg) {
            animationInterval = setInterval(async () => {
              dotCount = (dotCount + 1) % 4;
              const dots = ".".repeat(dotCount);
              const updatedEmbed = new EmbedBuilder().setColor(loadingColor).setDescription(`${loadingEmoji} Fetching Information ${dots}`);
              if (isInteraction) await input.editReply({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
              else await replyMsg.edit({ embeds: [updatedEmbed] }).catch(() => { clearInterval(animationInterval); });
            }, 1500);
        }
      }

      if (!clan) {
          if (animationInterval) clearInterval(animationInterval);
          let errorDesc = "❌ Could not fetch clan from Clash of Clans API.";
          if (query) {
            if (query.startsWith("#")) {
              errorDesc = `❌ Clan is not found with tag: \`${query}\``;
            } else {
              errorDesc = `❌ Clan is not found with nickname: \`${query}\``;
            }
          }
          const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(errorDesc);
          if (isInteraction) return await input.editReply({ embeds: [errEmbed] }).catch(() => {});
          else if (replyMsg) return await replyMsg.edit({ embeds: [errEmbed] }).catch(() => {});
          return;
      }

      const fwa = await fetchFwaData(clanTag, apiLogger);
      const embed = buildEmbedFromData(EmbedBuilder, clan, members, fwa, emoji);

      if (animationInterval) clearInterval(animationInterval);
      if (isInteraction) await input.editReply({ embeds: [embed] }).catch(() => {});
      else if (replyMsg) await replyMsg.edit({ embeds: [embed] }).catch(() => {});

    } catch (err) {
      if (animationInterval) clearInterval(animationInterval);
      if (err.response) {
        console.error(`❌ Error in claninfo command: Clash API returned status ${err.response.status}`);
      } else {
        console.error("❌ Error in claninfo command:", err.message || err);
      }
      const errEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription("❌ An error occurred while fetching clan info.");
      if (isInteraction) return await input.editReply({ embeds: [errEmbed] }).catch(() => {});
      else if (replyMsg) return await replyMsg.edit({ embeds: [errEmbed] }).catch(() => {});
    }
  },
  fetchCocClanAndMembers,
  fetchFwaData,
  buildEmbedFromData
};
