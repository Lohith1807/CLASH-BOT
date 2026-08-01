const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getEmoji } = require("../../../utils/emoji.js");
const { createCanvas, loadImage } = require('@napi-rs/canvas');

let cachedBackground = null;

function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}
module.exports = {
  name: "wel",
  description: "Send welcome messages",
  async execute(message, args, context) {
    const config = require("../../../config/config.js");
    const allowedRoles = [
      ...(config.ADMIN_ROLE_IDS || []),
      ...(config.ALL_STAFF_ROLE_IDS || []),
      ...(config.STAFF_ROLE_IDS || [])
    ].filter(Boolean);

    const hasPermission = message.member.roles.cache.some(role => allowedRoles.includes(role.id));
    if (!hasPermission) {
      return message.channel.send("🚫 **Access Denied:** You do not have permission to use this command.");
    }
    let count = 1;
    let targetMember = null;
    
    // Parse arguments
    for (const arg of args) {
      if (!isNaN(arg)) {
        count = parseInt(arg, 10);
      }
    }
    
    // Check if there is a mention
    if (message.mentions.users.size > 0) {
      const user = message.mentions.users.first();
      targetMember = message.guild.members.cache.get(user.id);
    }
    
    if (count > 20) count = 20;
    if (count < 1) count = 1;

    let content = '';
    let displayNameText = '';
    let displayUser = message.author;
    
    if (targetMember) {
        displayUser = targetMember.user;
        content = `Hey ${targetMember}! 🎉`;
        displayNameText = `**${targetMember.user.username}** `;
    }

    let welcomeImage;
    try {
      if (!cachedBackground) {
        cachedBackground = await loadImage('./assets/images/welcome image.png');
      }

      const width = 1500;
      const height = 500;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(cachedBackground, 0, cachedBackground.height / 2 - height / 2, cachedBackground.width, height, 0, 0, width, height);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, width, height);

      const avatarUrl = displayUser.displayAvatarURL({ extension: 'png', size: 1024 });
      const avatar = await loadImage(avatarUrl);

      const avatarSize = 300;
      const centerX = width / 2;
      const centerY = height / 2;
      
      const avatarX = centerX - avatarSize / 2;
      const avatarY = centerY - avatarSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      const buffer = await canvas.encode('jpeg');
      welcomeImage = new AttachmentBuilder(buffer, { name: 'welcome_image.jpg' });
    } catch (e) {
      console.error('Error generating canvas welcome image:', e);
      welcomeImage = new AttachmentBuilder('./assets/images/welcome image.png', { name: 'welcome_image.jpg' });
    }

    const embed = new EmbedBuilder()
      .setColor(randomColor())
      .setAuthor({ name: `✨ Welcome to 『✧ ${message.guild.name} ✧』`, iconURL: message.guild.iconURL({ dynamic: true, size: 1024 }) })
      .setDescription(
        `Welcome ${displayNameText}to **『✧ Blood Alliance ✧』** ${getEmoji("heart")}\n\n` +
        `We Are A family of FWA & WAR clans focused on Farm Wars, Serious Wars, CWL, growth, and organized gameplay.\n\n` +
        `**═══ ${getEmoji("alaram")} Getting Started ═══**\n\n` +
        `${getEmoji("bluedot")} **Link Your Account** in <#1398351500895588352>\n` +
        `Use \`;link #PlayerTag\`\n` +
        `Example: \`;link #ABC123XYZ\`\n\n` +
        `${getEmoji("orangedot")} **Clan Verification**\n` +
        `Joining or already in a clan? Verify your ID in <#1154111265258614795>.\n\n` +
        `**═══ ${getEmoji("chain")} Official Website ═══**\n\n` +
        `${getEmoji("bluedot")} **Blood Alliance Website**\n` +
        `${getEmoji("arrow")} [Click Here To redirect to webpage](https://blood-alliance.vercel.app)\n\n` +
        `**═══ ${getEmoji("cocfight")} Currently Recruiting ═══**\n` +
        `${require("../../../utils/dataManager.js").getRecruitingTHs().map(th => getEmoji(th.toLowerCase())).join(" ")}`
      )
      .setImage('attachment://welcome_image.jpg')
      .setFooter({ text: "❤️ Enjoy your stay and welcome to the family!", iconURL: displayUser.displayAvatarURL({ dynamic: true, size: 1024 }) })
      .setTimestamp();

    for (let i = 0; i < count; i++) {
       const payload = { embeds: [embed], files: [welcomeImage] };
       if (content) payload.content = content;
       
       if (targetMember) {
           const row = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
               .setCustomId(`view_welcome_details_${targetMember.id}`)
               .setLabel("View details")
               .setStyle(ButtonStyle.Secondary)
               .setEmoji("📄")
           );
           payload.components = [row];
       }
       
       await message.channel.send(payload).catch(() => null);
    }
    
    // Optionally delete the user's command message so it doesn't clutter
    if (message.deletable) {
        await message.delete().catch(() => null);
    }
  }
};
