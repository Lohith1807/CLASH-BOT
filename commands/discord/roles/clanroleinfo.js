


module.exports = {
  name: 'crinfo',
  description: 'List clans linked',

  async execute(message, args, context) {
    try {
      const { EmbedBuilder, emoji: emojiUtils, coc, data: dataManager, config } = context;
      const ALLOWED_ROLES = config.ADMIN_ROLE_IDS;

      if (message.deletable) message.delete().catch(() => { });

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

      const ccEmoji = emojiUtils.getEmoji("clancastle");

      const data = dataManager.getClanRoles();

      if (Object.keys(data).length === 0) {
        return message.channel.send('❌ Could not load. Please try again');
      }

      const clanTags = Object.keys(data);
      if (clanTags.length === 0) {
        return message.channel.send('⚠️ No clans found.');
      }

      const results = [];

      for (const tag of clanTags) {
        try {
          const clan = await coc.getClan(tag);
          results.push({ tag: clan.tag, name: clan.name });
        } catch (err) {
          console.error(`❌ Error fetching clan for tag ${tag}:`, err.message);
          results.push({ tag: tag, name: '**Name not found**' });
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${ccEmoji}Blood Alliance Clans`)
        .setColor(0x2ECC71)
        .setDescription(results.map(res => `\`${res.tag}\` — ${res.name}`).join('\n'))
        .setFooter({ text: `Total Clans: ${results.length}` });

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Error in crinfo command:', error);
      return message.channel.send('⚠️ An error occurred while fetching clan information.').catch(() => { });
    }
  }
};
