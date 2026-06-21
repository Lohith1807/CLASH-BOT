



function getRandomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

function buildEmbed(EmbedBuilder, title, description, color = 0x2ecc71) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

async function logErrorToChannel(client, LOG_CHANNEL_ID, EmbedBuilder, title, error) {
  const { ChannelType } = require("discord.js");
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

  const errorEmbed = buildEmbed(
    EmbedBuilder,
    `⚠️ ${title}`,
    `\`\`\`${error?.message || error}\`\`\``,
    0xe74c3c
  );
  logChannel.send({ embeds: [errorEmbed] }).catch(() => { });
}

module.exports = {
  name: "delc",
  description: "Deletes the current category and all its channels",
  async run(message, args, { EmbedBuilder, client, config }) {
    const ALLOWED_ROLES_DELETE = config.ADMIN_ROLE_IDS;
    const LOG_CHANNEL_ID = config.LOG_CHANNEL_ID;
    const currentChannel = message.channel; // ✅ Store reference before deletion

    if (message.deletable) await message.delete().catch(() => { });

    const hasPermission = message.member.roles.cache.some(role =>
      ALLOWED_ROLES_DELETE.includes(role.id)
    );

    if (!hasPermission) {
      const embed = buildEmbed(
        EmbedBuilder,
        "🚫 Access Denied",
        "You do not have permission to use this command.",
        0xe74c3c
      );
      return currentChannel.send({ embeds: [embed] });
    }

    const category = currentChannel.parent;
    if (!category) {
      const embed = buildEmbed(
        EmbedBuilder,
        "⚠️ Invalid Channel",
        "This channel is not inside a category.",
        0xe67e22
      );
      return currentChannel.send({ embeds: [embed] });
    }

    const confirmEmbed = buildEmbed(
      EmbedBuilder,
      "⚠️ Confirm Deletion",
      `Are you sure you want to delete **${category.name}** and all its channels?\n\nReact with ✅ to confirm or ❌ to cancel.`,
      0xf1c40f
    );

    const confirmMsg = await currentChannel.send({ embeds: [confirmEmbed] });

    await confirmMsg.react("✅");
    await confirmMsg.react("❌");

    const filter = (reaction, user) => {
      if (!["✅", "❌"].includes(reaction.emoji.name)) return false;
      if (user.id !== message.author.id) {
        reaction.users.remove(user.id).catch(() => { });
        return false;
      }
      return true;
    };

    try {
      const collected = await confirmMsg.awaitReactions({ filter, max: 1, time: 15000 });
      const reaction = collected.first();

      if (reaction.emoji.name === "✅") {
        const startEmbed = buildEmbed(
          EmbedBuilder,
          "🗑️ Deletion Started",
          `Deleting category **${category.name}** and all its channels...`,
          0x3498db
        );
        await currentChannel.send({ embeds: [startEmbed] });

        const children = message.guild.channels.cache.filter(c => c.parentId === category.id);
        let deletedCount = 0;

        for (const ch of children.values()) {
          await ch.delete().catch(err => {
            logErrorToChannel(client, LOG_CHANNEL_ID, EmbedBuilder, `Failed to delete channel #${ch.name}`, err);
          });
          deletedCount++;
        }

        await category.delete().catch(err => {
          logErrorToChannel(client, LOG_CHANNEL_ID, EmbedBuilder, `Failed to delete category ${category.name}`, err);
        });

        await logErrorToChannel(
          client,
          LOG_CHANNEL_ID,
          EmbedBuilder,
          "✅ Deletion Complete",
          `**Category:** ${category.name}\n**Deleted by:** ${message.author.tag} (${message.author.id})\n**Channels Deleted:** ${deletedCount}`
        );
      } else {
        const cancelEmbed = buildEmbed(
          EmbedBuilder,
          "❌ Deletion Cancelled",
          "You cancelled the deletion process.",
          0xe74c3c
        );
        return currentChannel.send({ embeds: [cancelEmbed] });
      }
    } catch (err) {
      const timeoutEmbed = buildEmbed(
        EmbedBuilder,
        "⏳ Timeout",
        "No reaction received within 15 seconds. Deletion cancelled.",
        0xe67e22
      );
      await currentChannel.send({ embeds: [timeoutEmbed] });

      logErrorToChannel(client, LOG_CHANNEL_ID, EmbedBuilder, "Reaction Timeout or Error", err);
    }
  }
};
