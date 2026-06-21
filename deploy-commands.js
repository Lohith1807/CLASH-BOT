const { REST, Routes } = require('discord.js');
const config = require('./config/config.js');
const fs = require('fs');
const path = require('path');

const TOKEN = config.DISCORD_TOKEN;
const CLIENT_ID = config.CLIENT_ID;
const GUILD_ID = config.GUILD_ID || '1153720899715993681';
const TEST_SERVER_ID = config.EMOJI_SERVER_ID || process.env.EMOJI_SERVER_ID;

const mainCommands = [];
const testCommands = [];

function getCommandFiles(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            files = files.concat(getCommandFiles(fullPath));
        } else if (item.name.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

const commandFiles = getCommandFiles(path.resolve(__dirname, './commands'));

const EXCLUDED_COMMANDS = ['clan'];

for (const file of commandFiles) {
    try {
        const command = require(file);
        if (command.data && command.data.toJSON) {
            if (EXCLUDED_COMMANDS.includes(command.data.name)) {
                console.log(`⏩ Skipping slash command (Excluded): ${command.data.name}`);
                continue;
            }
            
            if (command.data.name === 'fetchemoji' || command.data.name === 'syncemoji' || command.data.name === 'checkallwarstest') {
                testCommands.push(command.data.toJSON());
                console.log(`📦 Found test server slash command: ${command.data.name}`);
            } else {
                mainCommands.push(command.data.toJSON());
                console.log(`📦 Found main slash command: ${command.data.name}`);
            }
        }
    } catch (err) {
        console.error(`❌ Failed to load command at ${file}:`, err.message);
    }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log(`📡 Registering ${mainCommands.length} slash commands to MAIN server (${GUILD_ID})...`);
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: mainCommands }
        );
        console.log('✅ Main slash commands registered successfully.');

        if (TEST_SERVER_ID) {
            console.log(`📡 Registering ${testCommands.length} slash commands to TEST server (${TEST_SERVER_ID})...`);
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, TEST_SERVER_ID),
                { body: testCommands }
            );
            console.log('✅ Test server slash commands registered successfully.');
        } else {
            console.log('⚠️ No EMOJI_SERVER_ID defined in environment. Skipping test server command registration.');
        }
    } catch (err) {
        console.error('❌ Failed to register commands:', err);
    }
})();
