const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const clanRolesPath = path.join(__dirname, '../../../data/clanrole.json');

function getClanRoles() {
    try {
        const raw = fs.readFileSync(clanRolesPath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wwpanel')
        .setDescription('📊 Post the FWA War Weight Panel with clan selector')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, context) {
        const { emoji: emojiUtils, coc } = context;
        const { getEmoji, getEmojiObject } = emojiUtils;

        // Defer to avoid timeout — we'll reply to the interaction privately
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        try {
            const clanRoles = getClanRoles();
            const clanTags = Object.keys(clanRoles).filter(tag => clanRoles[tag].clanType !== 'war');

            if (clanTags.length === 0) {
                return interaction.editReply({ content: `${getEmoji('wrongbox')} No FWA clans configured in \`clanrole.json\`.` });
            }

            // Fetch clan names in parallel from CoC API (best-effort, fallback to nickName/tag)
            const clanEntries = clanTags.slice(0, 25);
            const clanDataResults = await Promise.all(
                clanEntries.map(tag => coc.getClan(tag).catch(() => null))
            );

            const options = [];
            for (let i = 0; i < clanEntries.length; i++) {
                const tag = clanEntries[i];
                const info = clanRoles[tag];
                const clanData = clanDataResults[i];
                const nickLower = info.nickName ? info.nickName.toLowerCase() : '';
                const emojiObj = (nickLower && getEmojiObject(nickLower)) ? getEmojiObject(nickLower) : getEmojiObject('whitefwa');

                const realName = clanData ? clanData.name : (info.nickName || tag);
                const label = `${realName} — ${tag}`;
                const description = `FWA Clan | ${tag}`;

                options.push({
                    label: label.length > 100 ? label.slice(0, 97) + '...' : label,
                    description: description.length > 100 ? description.slice(0, 97) + '...' : description,
                    value: tag.replace('#', ''),
                    emoji: emojiObj || undefined,
                });
            }


            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('wwpanel_clan_select')
                    .setPlaceholder('🏰 Select a Clan to view FWA Weight Report...')
                    .addOptions(options)
            );

            const guild = interaction.guild || interaction.client.guilds.cache.get('1153720899715993681');
            const guildIcon = guild ? guild.iconURL({ size: 128 }) : null;

            // ── Panel Embed ────────────────────────────────────────────────────────
            const panelEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle(`${getEmoji('whitefwa')} FWA War Weights`)
                .setDescription(
                    `${getEmoji('blood')} **Welcome to the Blood Alliance FWA War Weights!**\n\n` +
                    `${getEmoji('arrow')} Use the dropdown below to select any clan and receive a **private weight report** directly in your chat.\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `${getEmoji('clancastle')} **What you'll see:**\n` +
                    `${getEmoji('bluedot')} Full member weight breakdown\n` +
                    `${getEmoji('bluedot')} Town Hall equivalent weights\n` +
                    `${getEmoji('bluedot')} Last FWA submission date\n` +
                    `${getEmoji('bluedot')} Sorted by weight (highest first)\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${getEmoji('alaram')} **Note:** The report is sent as a **private message** — only you can see it!`
                )
                .addFields(
                    {
                        name: `${getEmoji('sheild')} How to use`,
                        value: `${getEmoji('arrow')} Click the dropdown menu below\n${getEmoji('rarrow')} Select your clan\n${getEmoji('rarrow')} The weight report will appear privately`,
                        inline: true
                    },
                    {
                        name: `${getEmoji('fwalead')} Clans Available`,
                        value: `${getEmoji('rarrow')} **${options.length}** clan${options.length !== 1 ? 's' : ''} listed`,
                        inline: true
                    }
                )
                .setFooter({ text: '⚖️ Blood Alliance', iconURL: guildIcon || undefined })
                .setTimestamp();

            // Send the panel embed publicly in the channel as a separate message
            await interaction.channel.send({ embeds: [panelEmbed], components: [selectRow] });

            // Reply to the private interaction confirming success
            await interaction.editReply({ content: `${getEmoji('gtick')} FWA War Weights panel posted successfully!` });
        } catch (err) {
            console.error("Error in wwpanel execute:", err);
            await interaction.editReply({ content: `${getEmoji('wrongbox')} Failed to post FWA panel: ${err.message}` }).catch(() => {});
        }
    }
};
