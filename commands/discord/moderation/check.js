const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  StringSelectMenuBuilder,
  ComponentType,
  LabelBuilder,
  FileUploadBuilder,
  MessageFlags
} = require("discord.js");

// ─── Temporary state for modal → original message mapping ────────────────────
// Key: `${interaction.user.id}:${playerTag}` → { channelId, messageId }
// Cleaned up on modal submit or after 5 minutes.
const pendingChecks = new Map();
const processedInteractions = new Set(); // Prevents double-submission

function storePending(userId, playerTag, channelId, messageId) {
    const key = `${userId}:${playerTag}`;
    pendingChecks.set(key, { channelId, messageId });
    setTimeout(() => pendingChecks.delete(key), 300_000); // 5 min cleanup
}

function consumePending(userId, playerTag) {
    const key = `${userId}:${playerTag}`;
    const data = pendingChecks.get(key);
    pendingChecks.delete(key);
    return data ?? null;
}

function markProcessed(interactionId) {
    if (processedInteractions.has(interactionId)) return true;
    processedInteractions.add(interactionId);
    setTimeout(() => processedInteractions.delete(interactionId), 300_000);
    return false;
}

function isImage(attachment) {
    if (!attachment) return false;
    const mime = attachment.contentType || '';
    return mime.startsWith('image/');
}

async function safeEphemeralReply(interaction, content) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
    } catch (e) {
        console.error('[check] Failed to send safe ephemeral reply:', e.message);
    }
}

module.exports = {
  name: "check",
  
  // ── Prefix command entry point ──────────────────────────────────────────
  async execute(message, args, context) {
    const { coc, data, emoji, config } = context;

    // Immediately delete the message
    setTimeout(() => {
        message.delete().catch(() => {});
    }, 100);

    // Validate Roles
    const adminRoles = config?.ADMIN_ROLE_IDS || [];
    const staffRoles = config?.STAFF_ROLE_IDS || [];
    const allowedRoles = [...adminRoles, ...staffRoles].map(r => r?.toString().trim()).filter(Boolean);
    
    const hasRole = message.member && (message.member.roles.cache.some(r => allowedRoles.includes(r.id)) || message.member.permissions.has("Administrator"));
    if (!hasRole && allowedRoles.length > 0) {
      const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ You do not have permission to use this command.`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    if (!args[0]) {
      const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ Please provide a player tag or mention a user.`);
      setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      return;
    }

    let input = args[0];
    
    if (input.startsWith('<@') && input.endsWith('>')) {
        let userId = input.replace(/[<@!>]/g, '');
        const allUserData = data.getUserData();
        const userAccounts = allUserData[userId];
        if (!userAccounts || userAccounts.length === 0) {
            const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ This user does not have any linked accounts.`);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }

        if (userAccounts.length === 1) {
            input = userAccounts[0].tag;
        } else {
            const options = userAccounts.slice(0, 25).map(acc => ({
                label: acc.name,
                description: acc.tag,
                value: acc.tag
            }));
            
            const select = new StringSelectMenuBuilder()
                .setCustomId(`select_account_check_${message.author.id}`)
                .setPlaceholder('Select an account to check')
                .addOptions(options);
                
            const selectRow = new ActionRowBuilder().addComponents(select);
            const selectMsg = await message.channel.send({ content: `<@${message.author.id}> Please select the account to check:`, components: [selectRow] });
            
            try {
                const response = await selectMsg.awaitMessageComponent({
                    filter: i => i.user.id === message.author.id && i.customId === `select_account_check_${message.author.id}`,
                    time: 60000,
                    componentType: ComponentType.StringSelect
                }).catch(err => { if (err.code === 'InteractionCollectorError') return null; throw err; });
                
                input = response.values[0];
                await response.update({ content: `✅ Account selected: **${input}**`, components: [] });
                setTimeout(() => selectMsg.delete().catch(()=>null), 3000);
            } catch (err) {
                await selectMsg.edit({ content: "⌛ Selection timed out.", components: [] }).catch(() => {});
                setTimeout(() => selectMsg.delete().catch(()=>null), 3000);
                return;
            }
        }
    }

    let tag = input.toUpperCase().replace(/O/g, '0');
    if (!tag.startsWith('#')) tag = '#' + tag;

    if (!/^#[0-9A-Z]{3,15}$/.test(tag)) {
        const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ Invalid player tag provided.`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        return;
    }

    try {
        const player = await coc.getPlayer(tag);
        
        const tagWithoutHash = tag.replace('#', '');
        const thLevel = player.townHallLevel;
        const thEmoji = emoji ? emoji.getEmoji('th' + thLevel) : `TH${thLevel}`;

        const embed = new EmbedBuilder()
            .setColor(Math.floor(Math.random() * 0xFFFFFF))
            .setTitle(`${player.name} ${player.tag}`)
            .setDescription(`${thEmoji} Please confirm this player is **BANNED** or **NOT BANNED** By checking CC`)
            .addFields(
                { name: "Chocolate Clash", value: `[View FWA Link](https://fwa.chocolateclash.com/cc_n/member.php?tag=${tagWithoutHash})`, inline: true },
                { name: "Clash of Stats", value: `[View Stats](https://www.clashofstats.com/players/${tagWithoutHash})`, inline: true }
            )
            .setFooter({ 
                text: `Done by ${message.member ? message.member.displayName : message.author.username}. Please click the ✅ emoji if you are sure.`,
                iconURL: message.author.displayAvatarURL()
            });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`check_approve:${message.author.id}:${tagWithoutHash}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`check_reject:${message.author.id}:${tagWithoutHash}`)
                .setLabel('Reject')
                .setEmoji('1532793683559186613')
                .setStyle(ButtonStyle.Danger)
        );

        const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

        // ── 5-minute expiry (buttons only — avoids duplicate handling) ──
        setTimeout(async () => {
            try {
                const msg = await sentMessage.fetch().catch(() => null);
                if (msg && msg.components.length > 0) {
                    const expiredEmbed = EmbedBuilder.from(msg.embeds[0])
                        .setDescription('⌛ Timed out without confirmation.');
                    await msg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
                }
            } catch (_) { /* message deleted or inaccessible */ }
        }, 300_000);

    } catch (error) {
        if (error.response && error.response.status === 404) {
            const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ Player not found for tag: \`${tag}\``);
            setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            return;
        }
        console.error('[check] Error in prefix command:', error);
        const warnMsg = await message.channel.send(`<@${message.author.id}> ⚠️ Failed to fetch player info. Error: ${error.message}`);
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
    }
  },

  // ── Button handler (called from global interactionCreate) ───────────────
  async handleButton(interaction) {
      if (markProcessed(interaction.id)) return;

      const parts = interaction.customId.split(':');
      const action = parts[0];    // check_approve | check_reject
      const authorId = parts[1];
      const playerTag = parts[2];

      if (interaction.user.id !== authorId) {
          return safeEphemeralReply(interaction, '❌ Only the user who ran the command can use these buttons.');
      }

      const msg = interaction.message;
      if (Date.now() - msg.createdTimestamp > 300_000) {
          try {
              const expiredEmbed = EmbedBuilder.from(msg.embeds[0])
                  .setDescription('⌛ Timed out without confirmation.');
              await interaction.update({ embeds: [expiredEmbed], components: [] });
          } catch (e) {
              console.error('[check] Error expiring buttons:', e.message);
          }
          return;
      }

      storePending(interaction.user.id, playerTag, msg.channel.id, msg.id);

      try {
          if (action === 'check_approve') {
              const modal = new ModalBuilder()
                  .setCustomId(`chk_a:${interaction.user.id}:${playerTag}`)
                  .setTitle('Approve Base / CC');

              const reasonLabel = new LabelBuilder()
                  .setLabel('Approval Reason')
                  .setTextInputComponent(
                      new TextInputBuilder()
                          .setCustomId('reason')
                          .setStyle(TextInputStyle.Paragraph)
                          .setRequired(true)
                          .setPlaceholder('Why are you approving this base?')
                  );

              const fileLabel = new LabelBuilder()
                  .setLabel('Upload Screenshot (optional)')
                  .setFileUploadComponent(
                      new FileUploadBuilder()
                          .setCustomId('screenshot')
                          .setRequired(false)
                  );

              modal.addComponents(reasonLabel, fileLabel);
              await interaction.showModal(modal);

          } else if (action === 'check_reject') {
              const modal = new ModalBuilder()
                  .setCustomId(`chk_r:${interaction.user.id}:${playerTag}`)
                  .setTitle('Reject Base / CC');

              const reasonLabel = new LabelBuilder()
                  .setLabel('Rejection Reason')
                  .setTextInputComponent(
                      new TextInputBuilder()
                          .setCustomId('reason')
                          .setStyle(TextInputStyle.Paragraph)
                          .setRequired(true)
                          .setPlaceholder('Enter the reason for rejection...')
                  );

              const fileLabel = new LabelBuilder()
                  .setLabel('Upload Screenshot (optional)')
                  .setFileUploadComponent(
                      new FileUploadBuilder()
                          .setCustomId('screenshot')
                          .setRequired(false)
                  );

              modal.addComponents(reasonLabel, fileLabel);
              await interaction.showModal(modal);
          }
      } catch (err) {
          console.error('[check] Error showing modal:', err);
          await safeEphemeralReply(interaction, '❌ Failed to open the form. Please try again.');
      }
  },

  // ── Modal submit handler (called from global interactionCreate) ─────────
  async handleModal(interaction) {
      if (markProcessed(interaction.id)) return;

      const parts = interaction.customId.split(':');
      const modalType = parts[0]; // chk_a | chk_r
      const authorId = parts[1];
      const playerTag = parts[2];

      const pending = consumePending(authorId, playerTag);
      let originalMessage = null;

      if (interaction.isFromMessage() && interaction.message) {
          originalMessage = interaction.message;
      } else if (pending) {
          try {
              const channel = await interaction.client.channels.fetch(pending.channelId).catch(() => null);
              if (channel) {
                  originalMessage = await channel.messages.fetch(pending.messageId).catch(() => null);
              }
          } catch (_) { }
      }

      const originalEmbed = originalMessage?.embeds?.[0] ?? null;

      try {
          if (modalType === 'chk_a') {
              const reason = interaction.fields.getTextInputValue('reason');
              let files, file = null;
              try {
                  files = interaction.fields.getUploadedFiles('screenshot');
                  file = files?.first() || null;
              } catch (e) {}

              if (file && !isImage(file)) {
                  return safeEphemeralReply(interaction, '❌ The uploaded file is not an image. Please upload a PNG, JPG, GIF, or WEBP.');
              }

              const finalEmbed = originalEmbed
                  ? EmbedBuilder.from(originalEmbed)
                  : new EmbedBuilder();

              finalEmbed
                  .setDescription(`✅ **Check Confirmed**\n\nHe is not a banned player and not from bl clan history confirmed by ${interaction.user}.\n**Reason:** ${reason}\n\n**Proof :**`)
                  .setColor(0x2ECC71);

              if (file) finalEmbed.setImage(file.url);

              if (interaction.isFromMessage()) {
                  await interaction.update({
                      content: null,
                      embeds: [finalEmbed],
                      components: []
                  });
              } else {
                  await interaction.reply({
                      embeds: [finalEmbed],
                      flags: MessageFlags.Ephemeral
                  });
                  if (originalMessage) {
                      await originalMessage.edit({
                          content: null,
                          embeds: [finalEmbed],
                          components: []
                      }).catch(() => {});
                  }
              }

          } else if (modalType === 'chk_r') {
              const reason = interaction.fields.getTextInputValue('reason');
              let files, file = null;
              try {
                  files = interaction.fields.getUploadedFiles('screenshot');
                  file = files?.first() || null;
              } catch (e) {}

              if (file && !isImage(file)) {
                  return safeEphemeralReply(interaction, '❌ The uploaded file is not an image. Please upload a PNG, JPG, GIF, or WEBP.');
              }

              const finalEmbed = originalEmbed
                  ? EmbedBuilder.from(originalEmbed)
                  : new EmbedBuilder();

              finalEmbed
                  .setDescription(`Player rejected by ${interaction.user}.\n**Reason:** ${reason}\n\n**Proof :**`)
                  .setColor(0xE74C3C);

              if (file) finalEmbed.setImage(file.url);

              if (interaction.isFromMessage()) {
                  await interaction.update({
                      content: null,
                      embeds: [finalEmbed],
                      components: []
                  });
              } else {
                  await interaction.reply({
                      embeds: [finalEmbed],
                      flags: MessageFlags.Ephemeral
                  });
                  if (originalMessage) {
                      await originalMessage.edit({
                          content: null,
                          embeds: [finalEmbed],
                          components: []
                      }).catch(() => {});
                  }
              }
          }
      } catch (err) {
          console.error('[check] Error handling modal submit:', err);
          await safeEphemeralReply(interaction, '❌ Something went wrong processing the form. Please try again.');
      }
  }
};
