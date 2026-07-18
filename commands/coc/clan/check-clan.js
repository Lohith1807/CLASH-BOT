const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// In-memory cache for clan names to speed up autocomplete responses
const clanNameCache = new Map();

/**
 * Check description content for requirements.
 * Matches are case-insensitive.
 * @param {string} description 
 * @returns {Object}
 */
function checkClanDescription(description) {
  const desc = description || "";
  const hasMention = desc.toLowerCase().includes("blood alliance");
  const hasLink = desc.toLowerCase().includes("tiny.cc/blood-alliance");
  return {
    hasMention,
    hasLink,
    met: hasMention && hasLink
  };
}

/**
 * Build a beautiful Discord embed for a single clan requirement check.
 * @param {Object} clan - Clan data from CoC API
 * @param {Object} status - Output from checkClanDescription
 * @param {Object} emoji - Emoji helper utility
 * @returns {EmbedBuilder}
 */
function buildCheckEmbed(clan, status, emoji) {
  const tick = emoji.getEmoji("gtick") || "✅";
  const cross = emoji.getEmoji("bluex") || "❌";
  const checkEmoji = (val) => val ? tick : cross;
  
  // Custom theme colors: Emerald Green for Met, Crimson Red for Missing
  const embedColor = status.met ? 0x2ECC71 : 0xE74C3C;
  const clanLink = `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clan.tag.replace("#", ""))}`;
  
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`Clan Description Check: ${clan.name}`)
    .setThumbnail(clan.badgeUrls?.large || clan.badgeUrls?.medium || "")
    .addFields(
      { name: "Clan Name & Tag", value: `[${clan.name}](${clanLink}) (\`${clan.tag}\`)`, inline: false },
      { name: "Blood Alliance Mention", value: `${checkEmoji(status.hasMention)} ${status.hasMention ? "Met" : "Missing"}`, inline: true },
      { name: "tiny.cc/blood-alliance Link", value: `${checkEmoji(status.hasLink)} ${status.hasLink ? "Met" : "Missing"}`, inline: true },
      { name: "Overall Status", value: status.met ? "✅ **Alliance Requirements Met**" : "❌ **Alliance Requirements Not Met**", inline: false },
      { name: "Current Description", value: clan.description ? `\`\`\`\n${clan.description}\n\`\`\`` : "*No Description Set*", inline: false }
    )
    .setFooter({ text: "Blood Alliance" })
    .setTimestamp();
    
  return embed;
}

module.exports = {
  name: "check-clan",
  description: "Check clan descriptions for Blood Alliance requirements.",
  data: new SlashCommandBuilder()
    .setName('check-clan')
    .setDescription('Check clan descriptions for Blood Alliance requirements.')
    .addStringOption(option => 
      option.setName('clan')
        .setDescription('Select a clan to check, or choose "All Clans"')
        .setRequired(true)
        .setAutocomplete(true)),

  async autocomplete(interaction, context) {
    const { data: dataManager, coc } = context;
    const focusedValue = interaction.options.getFocused().toLowerCase();
    
    const clanRoles = dataManager.getClanRoles();
    const tags = Object.keys(clanRoles);

    // Pre-fetch real clan names in the background for any tags not already cached
    for (const tag of tags) {
      if (!clanNameCache.has(tag)) {
        clanNameCache.set(tag, clanRoles[tag].nickName || tag); // Temporary fallback to nickname or tag
        coc.getClan(tag).then(clan => {
          if (clan && clan.name) {
            clanNameCache.set(tag, clan.name);
          }
        }).catch(() => {}); // Suppress API failures silently during autocomplete
      }
    }

    const choices = [{ name: "All Clans", value: "all" }];
    for (const tag of tags) {
      const realName = clanNameCache.get(tag) || clanRoles[tag].nickName || tag;
      const nickname = clanRoles[tag].nickName;
      const displayName = nickname ? `${realName} (${nickname}) [${tag}]` : `${realName} [${tag}]`;
      choices.push({ name: displayName.substring(0, 100), value: tag });
    }

    const filtered = choices.filter(choice => 
      choice.name.toLowerCase().includes(focusedValue) || 
      choice.value.toLowerCase().includes(focusedValue)
    ).slice(0, 25);

    await interaction.respond(filtered).catch(() => {});
  },

  async execute(interaction, context) {
    const { coc, data: dataManager, emoji } = context;
    
    // Defer the interaction immediately to buy time (especially for checking all clans)
    await interaction.deferReply().catch(() => {});
    
    const clanArg = interaction.options.getString('clan');
    
    if (clanArg === 'all') {
      const clanRoles = dataManager.getClanRoles();
      const tags = Object.keys(clanRoles);
      
      if (tags.length === 0) {
        return interaction.editReply("⚠ No clans found in `clanrole.json`.").catch(() => {});
      }

      await interaction.editReply(`⏳ Checking all ${tags.length} clans. Fetching details and sending separate embeds...`).catch(() => {});
      
      // Fetch all clans in parallel
      const checkPromises = tags.map(async (tag) => {
        try {
          const clan = await coc.getClan(tag);
          const status = checkClanDescription(clan.description);
          const embed = buildCheckEmbed(clan, status, emoji);
          return { success: true, tag, status, embed };
        } catch (err) {
          const errorEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(`Clan Check Failed: ${tag}`)
            .setDescription(`❌ Failed to fetch details for clan tag \`${tag}\`.`)
            .setTimestamp();
          return { success: false, tag, embed: errorEmbed };
        }
      });
      
      const results = await Promise.all(checkPromises);
      
      let metCount = 0;
      let missingCount = 0;
      let failCount = 0;
      
      for (const res of results) {
        if (!res.success) {
          failCount++;
        } else if (res.status.met) {
          metCount++;
        } else {
          missingCount++;
        }
      }

      // Send each clan check embed as a separate followUp message
      for (const res of results) {
        await interaction.followUp({ embeds: [res.embed] }).catch(() => {});
      }
      
      // Update the main interaction reply with a summary statistics report
      const summaryText = `📊 **Clan Check Summary:**\n` +
                          `▸ Total Clans: **${tags.length}**\n` +
                          `▸ Requirements Met: **${metCount}**\n` +
                          `▸ Requirements Missing: **${missingCount}**\n` +
                          `▸ Failed to Fetch: **${failCount}**\n\n` +
                          `*Individual embeds have been sent above.*`;
                          
      await interaction.editReply({ content: summaryText }).catch(() => {});
      
    } else {
      // Check a single specified clan
      try {
        const clan = await coc.getClan(clanArg);
        const status = checkClanDescription(clan.description);
        const embed = buildCheckEmbed(clan, status, emoji);
        await interaction.editReply({ content: null, embeds: [embed] }).catch(() => {});
      } catch (err) {
        console.error(`Error checking clan ${clanArg}:`, err.message);
        const errEmbed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle("Clan Check Failed")
          .setDescription(`❌ Could not fetch clan details for tag \`${clanArg}\`. Please check the tag or try again later.`)
          .setTimestamp();
        await interaction.editReply({ content: null, embeds: [errEmbed] }).catch(() => {});
      }
    }
  }
};
