module.exports = {
    name: "getemojis",
    description: "Get all emojis from the Discord Developer Portal (Application Emojis) and add them to this server (without deleting any existing emojis).",

    async execute(message, args, { config }) {
        try {

            const statusMessage = await message.channel.send('📡 Fetching application emojis from Developer Portal...');

            // Fetch application emojis
            const appEmojis = await message.client.application.emojis.fetch();
            if (appEmojis.size === 0) {
                return statusMessage.edit('❌ No application emojis found in the Developer Portal.');
            }

            // Fetch guild emojis to avoid duplicates
            let guild = message.guild;
            if (!guild) {
                const targetGuildId = config.EMOJI_SERVER_ID || process.env.EMOJI_SERVER_ID;
                if (!targetGuildId) {
                    return statusMessage.edit('❌ This command was run outside of a server, but `EMOJI_SERVER_ID` is not configured in your `.env`.');
                }
                guild = message.client.guilds.cache.get(targetGuildId) || await message.client.guilds.fetch(targetGuildId).catch(() => null);
                if (!guild) {
                    return statusMessage.edit(`❌ Could not find or access the configured server with ID \`${targetGuildId}\`.`);
                }
            }

            await guild.emojis.fetch();

            let addedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;
            const logs = [];

            for (const [, appEmoji] of appEmojis) {
                const existing = guild.emojis.cache.find(e => e.name === appEmoji.name);
                if (existing) {
                    skippedCount++;
                    continue;
                }

                try {
                    const createdEmoji = await guild.emojis.create({
                        attachment: appEmoji.url,
                        name: appEmoji.name
                    });
                    addedCount++;
                    logs.push(`✅ Created ${createdEmoji.toString()} (\`${appEmoji.name}\`)`);
                } catch (err) {
                    failedCount++;
                    logs.push(`❌ Failed to create \`${appEmoji.name}\`: ${err.message}`);
                }
            }

            const summary = `**Emoji Sync Summary:**\n✨ Added: **${addedCount}**\n⏩ Skipped (already exists): **${skippedCount}**\n❌ Failed: **${failedCount}**`;
            
            if (logs.length > 0) {
                const logStr = logs.join('\n');
                const finalMsg = `${summary}\n\n${logStr}`;
                const chunks = finalMsg.match(/[\s\S]{1,1999}/g) || [];
                
                await statusMessage.edit(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await message.channel.send(chunks[i]);
                }
            } else {
                await statusMessage.edit(`${summary}\n\n✅ All application emojis are already present in this server.`);
            }

        } catch (error) {
            console.error('❌ Error in getemojis command:', error);
            return message.channel.send(`⚠️ An error occurred: ${error.message}`).catch(() => {});
        }
    }
};
