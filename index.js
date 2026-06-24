const path = require("path");
const fs = require("fs");

const config = require("./config/config.js");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  Collection,
  PermissionsBitField,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ChannelType, PermissionFlagsBits, AttachmentBuilder } = require("discord.js");
const cheerio = require("cheerio");
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Clash Bot API is running!");
});

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("No URL provided");

  const API_LOGS_ID = process.env.API_LOGS || "1482784031954305024";
  const logChannel = await client.channels.fetch(API_LOGS_ID).catch(() => null);

  const apiLogger = async (msg) => {
    if (logChannel) {
      await logChannel.send(`\`[API PROXY]\` ${msg}`).catch(() => null);
    }
  };

  try {
    const proxyFetch = require("./utils/proxyFetch");
    const data = await proxyFetch(targetUrl, apiLogger);
    res.send(data);
  } catch (error) {
    res.status(error.response?.status || 500).send(error.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
});

const { getEmoji } = require("./utils/emoji.js");
const { handleInteraction } = require("./utils/handler.js");

const COC_API_TOKEN = config.COC_API_TOKEN;
const DISCORD_TOKEN = config.DISCORD_TOKEN;
const PREFIX = config.PREFIX;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});
client.activeTicketTimers = new Map();

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  const { connectToDatabase } = require('./utils/mongodb.js');
  await connectToDatabase();

  if (process.platform !== "win32") {
    const { exec } = require("child_process");
    exec("npm cache clean --force", async (err) => {
      if (!err) {
        const logChannel = await c.channels.fetch("1507297950278221864").catch(() => null);
        if (logChannel) {
          await logChannel.send("🧹 Programmatically cleared npm cache to free up space on HostMyBot.").catch(() => null);
        }
      }
    });
  }

  client.user.setPresence({
    status: "idle",
    activities: [
      {
        name: "Blood Alliance !!",
        type: 3 // 👀 3 = Watching
      }
    ]
  });

  startWarMonitoring(c);
});

async function startWarMonitoring(client) {
  const emojiUtils = require("./utils/emoji.js");
  const mailCommand = require("./commands/discord/moderation/mail.js");

  mailCommand.startAutoMonitoring(client, config, emojiUtils);
}

const tools = {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  coc: require("./utils/cocManager.js"),
  data: require("./utils/dataManager.js"),
  emoji: require("./utils/emoji.js"),
  config: config,
  client: client
};

const recruitment = require("./utils/recruitmentManager.js");
client.once("ready", () => {
  recruitment.startRecruitmentMonitoring(client, config, tools.coc, tools.data, tools.emoji);
});


const ticketHandler = require("./utils/tickets/ticketHandler.js");
client.once("ready", () => {
  if (ticketHandler.checkTimers) {
    ticketHandler.checkTimers(client, config, tools);
  }
});

const statsTracker = require("./utils/statsTracker.js");
statsTracker(client, config);

const autoRoleManager = require("./utils/autoRoleManager.js");
client.once("ready", () => {
  autoRoleManager.startAutoRoleManager(client, config, tools.coc, tools.data);
});


const syncCommand = require("./commands/coc/war/sync.js");

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (client.activeTicketTimers && client.activeTicketTimers.has(message.channel.id)) {
    const ticketOwnerId = message.channel.topic;
    if (message.author.id === ticketOwnerId) {
      const timerData = client.activeTicketTimers.get(message.channel.id);
      if (timerData) {
        clearTimeout(timerData.timeout);
        client.activeTicketTimers.delete(message.channel.id);

        const tData = tools.data.getTicketTimers();
        if (tData[message.channel.id]) {
          delete tData[message.channel.id];
          tools.data.saveTicketTimers(tData);
        }

        await message.channel.send("✅ **Timer cancelled.** The ticket creator has replied.").catch(() => null);
      }
    }
  }
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  try {
    const context = { ...tools, commandName, prefix: PREFIX };

    if (commandName === "link") {
      const command = require("./commands/coc/profile/link.js");
      await command.execute(message, args, context);

    } else if (commandName === "profile" || commandName === "p") {
      const command = require("./commands/coc/profile/profile.js");
      await command.execute(message, args, context);

    } else if (commandName === "unlink") {
      const command = require("./commands/coc/profile/unlink.js");
      await command.execute(message, args, context);

    } else if (commandName === "cc" || commandName === "check") {
      const command = require("./commands/discord/roles/cc.js");
      await command.execute(message, args, context);
    } else if (commandName === "ww") {
      const command = require("./commands/coc/war/ww.js");
      await command.execute(message, args, context);
    } else if (commandName === 'crinfo') {
      const command = require('./commands/discord/roles/clanroleinfo.js');
      await command.execute(message, args, context);
    } else if (commandName === 'player') {
      const command = require('./commands/coc/profile/player.js');
      await command.execute(message, args, context);
    } else if (commandName === 'ls') {
      const command = require('./commands/coc/profile/linkedlist.js');
      await command.execute(message, args, context);
    } else if (commandName === 'discord-links') {
      const command = require('./commands/coc/profile/linkedlistclan.js');
      await command.execute(message, args, context);
    } else if (commandName === "clans" || commandName === "clan") {
      const command = require("./commands/coc/clan/clan.js");
      await command.execute(message, args, context);


    } else if (commandName === "claninfo") {
      const command = require("./commands/coc/clan/claninfo.js");
      await command.execute(message, args, context);

    }  else if (commandName === "delc") {
      const command = require("./commands/discord/channel/delc.js");
      await command.run(message, args, context);

    } else if (commandName === "delete") {
      const command = require("./commands/discord/channel/delete.js");
      await command.run(message, args, context);
    } else if (commandName === "getemojis") {
      const command = require("./commands/discord/moderation/getemojis.js");
      await command.execute(message, args, context);
    } else if (commandName === "cwl") {
      const command = require("./commands/coc/war/cwl.js");
      await command.execute(message, args, context);
    } else if (commandName === "sync") {
      await syncCommand.execute(message, args, context);

    } else if (commandName === "compo") {
      const command = require("./commands/coc/clan/compo.js");
      await command.execute(message, args, context);

    } else if (commandName === "bases") {
      const command = require("./commands/coc/clan/bases.js");
      await command.execute(message, args, context);

    } else if (commandName === "fwa") {
      const command = require("./commands/coc/clan/fwa.js");
      await command.execute(message, args, context);

    } else if (commandName === "war" || commandName === "warweight") {
      const command = require("./commands/coc/war/warweight.js");
      await command.execute(message, args, context);

    } else if (commandName === "nickall") {
      const command = require("./commands/discord/roles/nickall.js");
      await command.execute(message, args, context);

    } else if (commandName === "testnick") {
      const user = message.mentions.users.first();
      if (!user) return message.channel.send("⚠️ Please mention a user.");
      const member = message.guild.members.cache.get(user.id);
      if (!member) return message.channel.send("⚠️ Member not found.");

      try {
        await member.setNickname("BLOOD | TEST");
        message.channel.send(`✅ Changed nickname for **${member.user.tag}**`);
      } catch (err) {
        message.channel.send(`❌ Error: \`${err.message}\``);
      }
    }


  } catch (err) {
    console.error(err);
    message.channel.send("⚠️ There was an error executing that command.");
  }
});
client.on("messageCreate", async (message) => {
  const prefix = "!";
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  try {
    const context = { ...tools, commandName, prefix: prefix };

    if (commandName === "fwa") {
      const command = require("./commands/coc/clan/fwa.js");
      await command.execute(message, args, context);
    } else if (commandName === "bases") {
      const command = require("./commands/coc/clan/bases.js");
      await command.execute(message, args, context);
    } else if (commandName === "cwl") {
      const command = require("./commands/coc/war/cwl.js");
      await command.execute(message, args, context);
    } else if (commandName === "discord-links") {
      const command = require("./commands/coc/profile/linkedlistclan.js");
      await command.execute(message, args, context);
    } else if (commandName === "clan") {
      const command = require("./commands/coc/clan/clan.js");
      await command.execute(message, args, context);
    } else if (commandName === "war" || commandName === "warweight") {
      const command = require("./commands/coc/war/warweight.js");
      await command.execute(message, args, context);
    } else if (commandName === "wclans" || commandName === "wclan") {
      const command = require("./commands/coc/war/wclans.js");
      await command.execute(message, args, context);
    }
  } catch (err) {
    console.error(err);
    message.channel.send("⚠️ There was an error executing that command.");
  }
});


if (syncCommand.setupWarChecker) {
  syncCommand.setupWarChecker(client, config, tools.coc, tools.emoji, tools.EmbedBuilder);
}




const roleMention = '<@&1394230094675050616>';
const arrow = getEmoji("arrow");
const alaram = getEmoji("alaram");
const heart = getEmoji("heart");
function getRandomColor() {
  return Math.floor(Math.random() * 0xFFFFFF);
}




client.commands = new Collection();

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
for (const file of commandFiles) {
  try {
    const command = require(file);
    if (command.data && command.data.name) {
      client.commands.set(command.data.name, command);
    }
  } catch (err) {
    console.error(`Failed to load command at ${file}:`, err.message);
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction, tools);
    } else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        await command.autocomplete(interaction, tools);
      }
    } else {
      await handleInteraction(interaction, tools);
    }
  } catch (error) {
    console.error("❌ Interaction Error:", error);
  }
});







const WELCOME_CHANNEL_ID = "1154293306637946890";
const SUPPORT_ROLE_ID = "1154276716982833154";
const LOG_CHANNEL_ID = "1410188192065257522";

function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

async function sendLog(guild, embed) {
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) await logChannel.send({ embeds: [embed] }).catch(() => null);
}


client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  const welcomeImage = new AttachmentBuilder('./assets/images/welcome image.png', { name: 'welcome_image.png' });

  const embed = new EmbedBuilder()
    .setColor(randomColor())
    .setAuthor({ name: `✨ Welcome to 『✧ ${member.guild.name} ✧』`, iconURL: member.guild.iconURL({ dynamic: true, size: 1024 }) })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
    .setDescription(
      `Hello **${member.user.username}**, welcome to **『✧ Blood Alliance ✧』** ${getEmoji("heart")}\n\n` +
      `We are a proud family of FWA & WAR clans focused on\n` +
      `Farm Wars, Serious Wars, CWL, growth, and organized gameplay.\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `${getEmoji("alaram")} **Getting Started**\n\n` +
      `${getEmoji("bluedot")} **Link Your Account** At <#1398351500895588352>\n` +
      `Use:\n` +
      '`;link #PlayerTag`\n\n' +
      `Example:\n` +
      '`;link #ABC123XYZ`\n\n' +
      `${getEmoji("orangedot")} **Clan Verification**\n` +
      `If you want to join a clan or you're already in one,\n` +
      `head to <#1154111265258614795> and verify your ID.\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `${getEmoji("chain")} **Official Websites**\n\n` +
      `${getEmoji("bluedot")} **Alliance Overview Website** View alliance clans, players, CWL clans, and CWL players information:\n` +
      `${getEmoji("arrow")} [Click Here To redirect to webpage](https://blood-alliance.vercel.app)\n\n` +
      `${getEmoji("orangedot")} **CWL Registration Website** - Active during CWL sign-ups! Log in via Discord to register and view assigned clans, or register directly in Discord—whichever is more convenient:\n` +
      `${getEmoji("arrow")} [Click Here To redirect to webpage](https://bloodalliance-flax.vercel.app)\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `${getEmoji("cocfight")} **Currently Recruiting:**\n` +
      `${require("./utils/dataManager.js").getRecruitingTHs().map(th => getEmoji(th.toLowerCase())).join(" ")}`
    )
    .setImage('attachment://welcome_image.png')
    .setFooter({ text: "❤️ Enjoy your stay and welcome to the family!", iconURL: member.user.displayAvatarURL({ dynamic: true, size: 1024 }) })
    .setTimestamp();

  await channel.send({
    content: `Hey ${member}! 🎉`,
    embeds: [embed],
    files: [welcomeImage]
  }).catch(() => null);
});







const clanRolesData = require('./data/clanrole.json');
const { log } = require("console");
const roleIdMap = {};
for (const [clanTag, data] of Object.entries(clanRolesData)) {
  roleIdMap[data.roleId] = {
    clanTag,
    channelId: data.channelId
  };
}

async function getClanName(clanTag) {
  try {
    const url = `https://api.clashofclans.com/v1/clans/${encodeURIComponent(clanTag)}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${COC_API_TOKEN}`
      }
    });
    return response.data.name || clanTag;
  } catch (error) {
    console.error(`❌ Failed to fetch clan name for ${clanTag}:`, error?.response?.data?.message || error.message);
    return clanTag; // fallback
  }
}







client.on("guildMemberRemove", async (member) => {
  const channelId = "1154294780969373786";
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(Math.floor(Math.random() * 0xFFFFFF))
    .setTitle("👋 Member Left")
    .setDescription(`${member.user.tag} (${member}) has left the server.`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => { });
});


const CHANNEL_ID = "1398361418427793549";
const INTERVAL = 20 * 60 * 60 * 1000; // 20 hours in ms

client.once('ready', async () => {

  await deleteNonBotMessages(); // Run on startup
  setInterval(deleteNonBotMessages, INTERVAL); // Repeat every 22 hrs

  // Run FWA weight check on startup, then every 24 hours
  try {
    const fwaClanData = require("./utils/fwadata.js");
    if (fwaClanData && typeof fwaClanData.checkFWAWeights === "function") {
      console.log("🚀 Starting initial FWA weight tracker check...");
      fwaClanData.checkFWAWeights(client).catch(err => console.error("Error in FWA weight check startup:", err));
      setInterval(() => {
        console.log("⏰ Running scheduled FWA weight tracker check...");
        fwaClanData.checkFWAWeights(client).catch(err => console.error("Error in FWA weight check interval:", err));
      }, 24 * 60 * 60 * 1000);
    }
  } catch (err) {
    console.error("Failed to initialize FWA weight tracking scheduler:", err);
  }
});


async function deleteNonBotMessages() {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    console.error("❌ Channel not found or not a text channel.");
    return;
  }

  try {
    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 });

      const toDelete = fetched.filter(msg => !msg.author.bot);

      const recentMessages = toDelete.filter(
        msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000
      );

      if (recentMessages.size > 0) {
        await channel.bulkDelete(recentMessages, true).catch(err => {
          console.warn("⚠️ bulkDelete encountered an issue (likely some messages were already manually deleted):", err.message);
        });
        console.log(`🗑 Processed bulk deletion of ${recentMessages.size} recent non-bot messages from #${channel.name}`);
      }

      const oldMessages = toDelete.filter(
        msg => Date.now() - msg.createdTimestamp >= 14 * 24 * 60 * 60 * 1000
      );

      for (const msg of oldMessages.values()) {
        await msg.delete().catch(() => { });
      }

    } while (fetched.filter(msg => !msg.author.bot).size > 0);

  } catch (err) {
    console.error("⚠ Error deleting messages:", err);
  }
}

client.login(DISCORD_TOKEN);

require('./api.js')(client);

