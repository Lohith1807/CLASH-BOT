const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: "syncemoji",
  description: "Sync emoji IDs, animated flags, and new emojis from Bot Dev Portal into emoji.js",
  data: new SlashCommandBuilder()
    .setName('syncemoji')
    .setDescription('Re-sync all emojis from Bot Dev Portal → auto-fix IDs, animated flags & add new ones'),

  async execute(interaction, context) {
    const { emoji: emojiUtils } = context;

    await interaction.deferReply({ ephemeral: true });

    try {
      const appEmojis = await interaction.client.application.emojis.fetch();

      const emojiFilePath = path.join(__dirname, "../../../utils/emoji.js");
      let content = fs.readFileSync(emojiFilePath, 'utf8');

      const animatedMatch = content.match(/const animatedEmojis = new Set\(\[([\s\S]*?)\]\);/);
      const currentAnimated = new Set();
      if (animatedMatch) {
        const items = animatedMatch[1].match(/"([^"]+)"/g) || [];
        items.forEach(item => currentAnimated.add(item.replace(/"/g, '')));
      }

      const newAnimated = new Set(currentAnimated);
      const logs = [];
      let idUpdates = 0;
      let animatedUpdates = 0;
      let newlyAdded = 0;

      for (const name of Object.keys(emojiUtils.emojis)) {
        const found = appEmojis.find(e => e.name === name);
        if (!found) {
          logs.push(`⚠️ **${name}**: Not found in Dev Portal — skipped`);
          continue;
        }

        if (emojiUtils.emojis[name] !== found.id) {
          logs.push(`🔄 **${name}**: ID \`${emojiUtils.emojis[name]}\` → \`${found.id}\``);
          emojiUtils.emojis[name] = found.id;
          idUpdates++;
        }

        const isAnimatedPortal = found.animated === true;
        const isAnimatedCode = currentAnimated.has(name);
        if (isAnimatedPortal && !isAnimatedCode) {
          logs.push(`🎞️ **${name}**: static in code but animated in portal → fixed`);
          newAnimated.add(name);
          animatedUpdates++;
        } else if (!isAnimatedPortal && isAnimatedCode) {
          logs.push(`🖼️ **${name}**: animated in code but static in portal → fixed`);
          newAnimated.delete(name);
          animatedUpdates++;
        }
      }

      const newEmojiSection = [];
      for (const [, emoji] of appEmojis) {
        if (emojiUtils.emojis[emoji.name] !== undefined) continue; // already tracked

        emojiUtils.emojis[emoji.name] = emoji.id;

        if (emoji.animated) newAnimated.add(emoji.name);

        newEmojiSection.push(`✨ **${emoji.name}** (\`${emoji.id}\`) ${emoji.animated ? '[animated]' : '[static]'} — added`);
        newlyAdded++;
      }

      if (newEmojiSection.length > 0) {
        logs.push(`\n**New emojis added from Dev Portal:**`);
        logs.push(...newEmojiSection);
      }

      if (idUpdates > 0 || animatedUpdates > 0 || newlyAdded > 0) {
        let emojiStr = "const emojis = {\n";
        const entries = Object.entries(emojiUtils.emojis);
        entries.forEach(([key, val], idx) => {
          emojiStr += `  ${key}: "${val}"${idx < entries.length - 1 ? ',' : ''}\n`;
        });
        emojiStr += "};";

        const animatedArr = [...newAnimated];
        let animatedStr = "const animatedEmojis = new Set([\n";
        animatedArr.forEach((name, idx) => {
          animatedStr += `  "${name}"${idx < animatedArr.length - 1 ? ',' : ''}\n`;
        });
        animatedStr += "]);";

        content = content.replace(/const emojis = \{[\s\S]*?\};/, emojiStr);
        content = content.replace(/const animatedEmojis = new Set\(\[[\s\S]*?\]\);/, animatedStr);

        fs.writeFileSync(emojiFilePath, content, 'utf8');

        logs.push(`\n✅ **emoji.js updated!**`);
        if (idUpdates > 0)      logs.push(`> 🔄 ${idUpdates} ID(s) corrected`);
        if (animatedUpdates > 0) logs.push(`> 🎞️ ${animatedUpdates} animated flag(s) corrected`);
        if (newlyAdded > 0)     logs.push(`> ✨ ${newlyAdded} new emoji(s) added`);
        logs.push(`> ⚠️ Restart the bot to fully apply changes.`);
      } else {
        logs.push(`\n✅ Everything is already up to date. No changes made.`);
      }

      const finalMsg = logs.join('\n');
      const chunks = finalMsg.match(/[\s\S]{1,1999}/g) || [];
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await interaction.editReply({ content: chunks[i] });
        else await interaction.followUp({ content: chunks[i], ephemeral: true });
      }

    } catch (error) {
      console.error('[syncemoji]', error);
      const msg = `❌ Error: ${error.message}`;
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
      else await interaction.reply({ content: msg, ephemeral: true });
    }
  }
};
