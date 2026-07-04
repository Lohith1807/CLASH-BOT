require("dotenv").config({ path: require('path').resolve(__dirname, '../.env') });

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  PREFIX: process.env.PREFIX || ";",

  COC_API_TOKEN: process.env.COC_API_TOKEN,

  mongoURI: process.env.MONGO_URI || '',

  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
  SYNC_CHANNEL_ID: process.env.SYNC_CHANNEL_ID,
  ADMIN_CATEGORY_ID: process.env.ADMIN_CATEGORY_ID,

  ADMIN_ROLE_IDS: (process.env.ADMIN_ROLE_IDS || "").split(",").map(id => id.trim()).filter(Boolean),
  VIP_USER_IDS: (process.env.VIP_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean),
  STAFF_ROLE_IDS: (process.env.STAFF_ROLE || "").split(","),
  GLOBAL_ROLE_ID: process.env.GLOBAL_ROLE_ID,
  MEMBER_ROLE_IDS: (process.env.MEMBER_ROLE_IDS || "").split(","),
  ALL_LEAD_ROLE_ID: process.env.ALL_LEAD_ROLE_ID,

  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID,
  PANEL_CHANNEL_ID: process.env.PANEL_CHANNEL_ID,
  TICKET_LOG_CHANNEL_ID: process.env.TICKET_LOG_CHANNEL_ID,
  STATS_CATEGORY_ID: process.env.STATS_CATEGORY_ID,
  GUILD_ID: process.env.GUILD_ID || '1153720899715993681',
  AUTOROLE_LOG_CHANNEL_ID: process.env.AUTOROLE_LOG_CHANNEL_ID,
  
  EMOJI_SERVER_ID: process.env.EMOJI_SERVER_ID,
};
