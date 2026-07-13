const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: "fetchemoji",
  description: "Fetch clan badges and add them as emojis",
  data: new SlashCommandBuilder()
    .setName('fetchemoji')
    .setDescription('Fetch clan badges from clanrole.json and add them as emojis in the server'),

  async execute(interaction, context) {
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
    } catch (e) {
        return; // Interaction already expired due to network lag
    }

    const { coc, data: dataManager, emoji: emojiUtils, config } = context;
    
    const targetGuildId = config.EMOJI_SERVER_ID || process.env.EMOJI_SERVER_ID;
    if (!targetGuildId) {
        await interaction.editReply({ content: "❌ `EMOJI_SERVER_ID` is not set in your `.env` file." }).catch(() => {});
        return;
    }

    const guild = interaction.client.guilds.cache.get(targetGuildId);

    if (!guild) {
        await interaction.editReply({ content: `❌ Could not find the emoji server with ID \`${targetGuildId}\`. Make sure the bot is in that server!` }).catch(() => {});
        return;
    }

    try {
      const clanRoles = dataManager.getClanRoles();
      const newEmojis = {};
      let logs = [];
      const entries = Object.entries(clanRoles).filter(([_, info]) => info.nickName);
      const totalClans = entries.length;
      let processed = 0;

      if (totalClans === 0) {
          await interaction.editReply({ content: `⚠️ No clans with a \`nickName\` found in \`clanrole.json\`. Nothing to fetch.` }).catch(() => {});
          return;
      }

      await interaction.editReply({ content: `⏳ Starting emoji fetch for **${totalClans}** clans...` }).catch(() => {});

      for (const [tag, info] of entries) {
        processed++;
        const emojiName = info.nickName.toLowerCase();

        // Show progress BEFORE each API call so the user sees activity
        await interaction.editReply({ content: `⏳ Fetching clan **${processed}/${totalClans}**: \`${tag}\` (${emojiName})...` }).catch(() => {});

        try {
            const clan = await coc.getClan(tag);
            if (!clan.badgeUrls || !clan.badgeUrls.large) {
                logs.push(`❌ No badge found for \`${clan.name}\``);
            } else {
                const existingEmoji = guild.emojis.cache.find(e => e.name === emojiName);
                if (existingEmoji) {
                    await existingEmoji.delete().catch(() => {});
                }

                const createdEmoji = await guild.emojis.create({
                    attachment: clan.badgeUrls.large,
                    name: emojiName
                });

                newEmojis[emojiName] = createdEmoji.id;
                logs.push(`✅ Created ${createdEmoji.toString()} for \`${clan.name}\``);
            }
        } catch (err) {
            logs.push(`❌ Failed to process clan \`${tag}\` (${emojiName}): ${err.message}`);
        }

        // Small delay between clans to avoid CoC API rate limits
        if (processed < totalClans) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (Object.keys(newEmojis).length > 0) {
          for (const [key, val] of Object.entries(newEmojis)) {
              emojiUtils.emojis[key] = val;
          }

          const emojiFilePath = path.join(__dirname, "../../../utils/emoji.js");
          let content = fs.readFileSync(emojiFilePath, 'utf8');
          
          let emojiStr = "const emojis = {\n";
          const emEntries = Object.entries(emojiUtils.emojis);
          emEntries.forEach(([key, val], idx) => {
              emojiStr += `  ${key}: "${val}"${idx < emEntries.length - 1 ? ',' : ''}\n`;
          });
          emojiStr += "};";
          
          content = content.replace(/const emojis = \{[\s\S]*?\};/, emojiStr);
          fs.writeFileSync(emojiFilePath, content, 'utf8');
          
          logs.push(`\n✅ Successfully updated \`utils/emoji.js\` with ${Object.keys(newEmojis).length} new/updated emojis.`);
      } else {
          logs.push(`\n⚠️ No new emojis were created.`);
      }

      const finalMsg = logs.join('\n');
      const chunks = finalMsg.match(/[\s\S]{1,1999}/g) || [];
      
      for (let i = 0; i < chunks.length; i++) {
          if (i === 0) await interaction.editReply({ content: chunks[i] }).catch(() => {});
          else await interaction.followUp({ content: chunks[i] }).catch(() => {});
      }
      
    } catch (error) {
      console.error("Error in fetchemoji:", error.message);
      const errMsg = "⚠ Error processing request.";
      if (interaction.deferred || interaction.replied) await interaction.editReply(errMsg).catch(() => {});
      else await interaction.reply(errMsg).catch(() => {});
    }
  }
};
