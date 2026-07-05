
const logChannelId = "1188515065889050746";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

      const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || "1442426406444335217";

      for (const [memberId, member] of message.guild.members.cache) {
        if (member.user.bot) continue;
        if (!member.manageable) continue;
        if (member.roles.cache.has(REAPPLY_ROLE_ID)) continue;

        const currentName = member.nickname || member.user.username;
        if (currentName.toUpperCase().startsWith("BLOOD |")) continue;

        let newNick;

        if (userData[memberId] && userData[memberId].length > 0) {
          const accounts = userData[memberId];

          let account = accounts[0];
          if (accounts.some(acc => acc.th)) {
            account = accounts.reduce((max, acc) =>
              acc.th && acc.th > (max.th || 0) ? acc : max,
              accounts[0]
            );
          }

          newNick = `BLOOD | ${account.name}`;
        } else {
          newNick = `BLOOD | ${member.user.username}`;
        }

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
