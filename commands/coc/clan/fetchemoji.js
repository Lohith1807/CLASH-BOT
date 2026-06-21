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
    const { coc, data: dataManager, emoji: emojiUtils, config } = context;
    
    const targetGuildId = config.EMOJI_SERVER_ID || process.env.EMOJI_SERVER_ID;
    if (!targetGuildId) {
        return interaction.reply({ content: "❌ `EMOJI_SERVER_ID` is not set in your `.env` file.", ephemeral: true });
    }

    const guild = interaction.client.guilds.cache.get(targetGuildId);

    if (!guild) {
        return interaction.reply({ content: `❌ Could not find the emoji server with ID \`${targetGuildId}\`. Make sure the bot is in that server!`, ephemeral: true });
    }

    try {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply();

      const clanRoles = dataManager.getClanRoles();
      const newEmojis = {};
      let logs = [];

      for (const [tag, info] of Object.entries(clanRoles)) {
        if (!info.nickName) continue;
        
        const emojiName = info.nickName.toLowerCase();
        
        try {
            const clan = await coc.getClan(tag);
            if (!clan.badgeUrls || !clan.badgeUrls.large) {
                logs.push(`❌ No badge found for \`${clan.name}\``);
                continue;
            }

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
            
        } catch (err) {
            logs.push(`❌ Failed to process clan \`${tag}\`: ${err.message}`);
        }
      }

      if (Object.keys(newEmojis).length > 0) {
          for (const [key, val] of Object.entries(newEmojis)) {
              emojiUtils.emojis[key] = val;
          }

          const emojiFilePath = path.join(__dirname, "../../../utils/emoji.js");
          let content = fs.readFileSync(emojiFilePath, 'utf8');
          
          let emojiStr = "const emojis = {\n";
          const entries = Object.entries(emojiUtils.emojis);
          entries.forEach(([key, val], idx) => {
              emojiStr += `  ${key}: "${val}"${idx < entries.length - 1 ? ',' : ''}\n`;
          });
          emojiStr += "};";
          
          content = content.replace(/const emojis = \{[\s\S]*?\};/, emojiStr);
          fs.writeFileSync(emojiFilePath, content, 'utf8');
          
          logs.push(`\n✅ Successfully updated \`utils/emoji.js\` with ${Object.keys(newEmojis).length} new/updated emojis.`);
      } else {
          logs.push(`\n⚠ No new emojis were created.`);
      }

      const finalMsg = logs.join('\n');
      const chunks = finalMsg.match(/[\s\S]{1,1999}/g) || [];
      
      for (let i = 0; i < chunks.length; i++) {
          if (i === 0) await interaction.editReply({ content: chunks[i] });
          else await interaction.followUp({ content: chunks[i] });
      }
      
    } catch (error) {
      console.error(error);
      const errMsg = "⚠ Error processing request.";
      if (interaction.deferred || interaction.replied) await interaction.editReply(errMsg);
      else await interaction.reply(errMsg);
    }
  }
};
