const logChannelId = "1188515065889050746";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to clean current name by extracting the last part of a "BLOOD | Name" format
 * @param {GuildMember} member 
 * @returns {string}
 */
const getCleanName = (member) => {
    let currentNickname = member.nickname || member.user.username;
    if (currentNickname.includes("BLOOD |")) {
        const parts = currentNickname.split("BLOOD |");
        let namePart = parts[parts.length - 1].trim();
        if (namePart.includes("•")) {
            const subParts = namePart.split("•");
            namePart = subParts[0].trim();
        }
        return namePart;
    }
    return currentNickname.trim();
};

module.exports = {
  name: "nickall",
  description: "Update nicknames for all members based on linked accounts",
  async execute(message, args, context) {
    try {
      const { data: dataManager, config, EmbedBuilder } = context;
      const ALLOWED_ROLES = config.ADMIN_ROLE_IDS;

      if (!message.guild) return;

      if (!message.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle('🚫 Access Denied')
              .setDescription('You do not have permission to use this command.')
          ]
        });
      }

      const userData = dataManager.getUserData();
      await message.guild.members.fetch();

      const logChannel = message.guild.channels.cache.get(config.LOG_CHANNEL_ID || logChannelId);
      if (!logChannel) {
        return message.channel.send("❌ Log channel not found.");
      }

      let processed = 0;

      const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || "1523186839509401701";
      const ALL_STAFF_ROLE_IDS = (config.ALL_STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);
      const STAFF_ROLE_IDS = (config.STAFF_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);

      const fallbackAllStaff = ["1466103376642314445", "1511650426343133274"];
      const fallbackStaff = ["1513940638909988874", "1513942017196167389", "1154276716982833154"];

      const allStaffIds = ALL_STAFF_ROLE_IDS.length > 0 ? ALL_STAFF_ROLE_IDS : fallbackAllStaff;
      const staffIds = STAFF_ROLE_IDS.length > 0 ? STAFF_ROLE_IDS : fallbackStaff;

      // Build monitored clans mapping
      const clanRoles = dataManager.getClanRoles();
      const monitoredClans = {};
      for (const [tag, info] of Object.entries(clanRoles)) {
          if (info.roleId) {
              monitoredClans[tag.toUpperCase()] = info;
          }
      }

      const adminRoleIds = (config.ADMIN_ROLE_IDS || []).map(id => id.trim()).filter(Boolean);

      for (const [memberId, member] of message.guild.members.cache) {
        if (member.user.bot) continue;
        if (!member.manageable) continue;
        
        // Skip members with Reapply, Staff or Admin roles
        if (member.roles.cache.has(REAPPLY_ROLE_ID)) continue;
        if (member.roles.cache.some(r => allStaffIds.includes(r.id) || staffIds.includes(r.id) || adminRoleIds.includes(r.id))) continue;
        if (member.permissions.has("Administrator")) continue;

        const currentName = member.nickname || member.user.username;

        const clanNicks = [];
        for (const [tag, info] of Object.entries(monitoredClans)) {
            if (info.roleId && member.roles.cache.has(info.roleId)) {
                if (info.nickName && !clanNicks.includes(info.nickName)) {
                    clanNicks.push(info.nickName);
                }
            }
        }

        let playerName = "";
        if (userData[memberId] && userData[memberId].length > 0) {
          const accounts = userData[memberId];

          let account = accounts[0];
          if (accounts.some(acc => acc.th)) {
            account = accounts.reduce((max, acc) =>
              acc.th && acc.th > (max.th || 0) ? acc : max,
              accounts[0]
            );
          }

          playerName = account.name;
        } else {
          playerName = getCleanName(member);
        }

        const clanNickStr = clanNicks.join(' • ');
        let newNick = clanNickStr
            ? `BLOOD | ${playerName} • ${clanNickStr}`
            : `BLOOD | ${playerName}`;

        if (newNick.length > 32) {
            newNick = newNick.substring(0, 32);
        }

        if (currentName === newNick) continue;

        try {
          await member.setNickname(newNick);
          await logChannel.send(`✅ Changed nickname for **${member.user.tag}** → \`${newNick}\``);
          processed++;
        } catch (err) {
          await logChannel.send(`⚠️ Failed to change nickname for **${member.user.tag}**: \`${err.message}\``);
        }

        await delay(1000);
      }

      return message.channel.send(`✅ Nickname update complete. Processed **${processed}** members.`);
    } catch (error) {
      console.error('❌ Error in nickall command:', error);
      return message.channel.send('⚠️ An error occurred while updating nicknames.').catch(() => { });
    }
  }
};
