const { AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { checkPermission } = require("../../../utils/checkPermission.js");
const { getEmoji } = require("../../../utils/emoji.js");

function getJoinUsContent() {
  return (
    `# ${getEmoji("blood")} **HOW TO JOIN BLOOD ALLIANCE** ${getEmoji("blood")}\n\n` +
    `Welcome to **Blood Alliance**! Follow this quick step-by-step guide to join our clans or claim your member roles if you are already in one of our clans.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `### ${getEmoji("bluefwa")} **NEW APPLICANTS — HOW TO JOIN A CLAN**\n\n` +
    `**Step 1: Link Your Clash of Clans Account**\n` +
    `${getEmoji("parrow")} Go to <#1398351500895588352>\n` +
    `${getEmoji("parrow")} Use the command: \`;link #PlayerTag\`\n` +
    `${getEmoji("parrow")} *Example:* \`;link #ABC123XYZ\`\n\n` +
    `**Step 2: Head Over to the Ticket Channel**\n` +
    `${getEmoji("parrow")} Open the ticket channel: <#1154111265258614795>\n` +
    `${getEmoji("parrow")} Click the **Apply to Clan** button.\n\n` +
    `**Step 3: Choose Your Account & Apply**\n` +
    `${getEmoji("parrow")} Select the linked account you wish to bring into Blood Alliance.\n` +
    `${getEmoji("parrow")} A private ticket will open where our recruitment staff will assist you!\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `### ${getEmoji("sheild")} **ALREADY IN ONE OF OUR CLANS? GET YOUR ROLES**\n\n` +
    `If you are already inside one of our alliance clans in Clash of Clans:\n\n` +
    `**Step 1:** Go to <#1154111265258614795>\n` +
    `**Step 2:** Click the **Help Assistance** button to open a Clan Assistance ticket.\n` +
    `**Step 3:** Provide proof that you are currently in the clan (e.g., a screenshot of your in-game profile showing the clan tag & name).\n` +
    `**Step 4:** Our staff will verify your account and assign your official clan member roles!\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${getEmoji("speaker")} **Need Further Help?**\n` +
    `${getEmoji("parrow")} Feel free to open a ticket in <#1154111265258614795> or ask in general chat.\n\n` +
    `⚔️ **Blood Alliance | Stronger Together!**`
  );
}

function getImageAttachment(attachment) {
  if (attachment) {
    return new AttachmentBuilder(attachment.url, { name: attachment.name || "how_to_join_us.png" });
  }

  const defaultPaths = [
    path.resolve(__dirname, "../../../assets/How to Join Us Banner.png"),
  ];

  for (const p of defaultPaths) {
    if (fs.existsSync(p)) {
      return new AttachmentBuilder(p, { name: "how_to_join_us.png" });
    }
  }
  return null;
}

module.exports = {
  name: "joinus",
  description: "Send the How to Join Us guide message",
  async execute(message, args, context) {
    if (!checkPermission("joinus", message)) {
      return message.channel.send("🚫 **Access Denied:** You do not have permission to use this command.");
    }

    if (message.deletable) {
      await message.delete().catch(() => null);
    }

    const attached = message.attachments && message.attachments.size > 0 ? message.attachments.first() : null;
    const file = getImageAttachment(attached);

    const payload = { content: getJoinUsContent() };
    if (file) payload.files = [file];

    try {
      await message.channel.send(payload);
    } catch (err) {
      console.error("Error sending joinus message:", err);
    }
  }
};
