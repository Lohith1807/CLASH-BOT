const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getCwlClans() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, "../../../data/cwlclans.json"), "utf8");
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('family-clans')
        .setDescription('Shows the list of FWA, War, or CWL clans.')
        .addStringOption(option => 
            option.setName('category')
                .setDescription('Select the clan category to display')
                .setRequired(true)
                .addChoices(
                    { name: 'FWA Clans', value: 'fwa' },
                    { name: 'WAR Clans', value: 'war' },
                    { name: 'CWL Clans', value: 'cwl' }
                )
        ),

    async execute(interaction, context) {
        try {
            const { data: dataManager, coc, emoji } = context;
            const { getEmoji, getEmojiObject } = emoji;

            const category = interaction.options.getString('category');
            await interaction.deferReply();

            const clanRoles = dataManager.getClanRoles();

            if (category === 'fwa') {
                let fwaTags = [];
                for (let cTag in clanRoles) {
                    if (clanRoles[cTag].clanType !== "war") fwaTags.push(cTag);
                }

                let text = getEmoji("bluefwa") + " **FWA Clans** are for easy farming and max loot!\n\n**FWA Clans - " + fwaTags.length + "**\n";
                let options = [];
                for (let idx = 0; idx < fwaTags.length; idx++) {
                    try {
                        let tag = fwaTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("whitefwa");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("whitefwa");

                        let clan = await coc.getClan(tag);
                        text += (idx + 1) + ". " + badgeEmojiStr + " **" + clan.name + "** `" + clan.tag + "`\n";
                        options.push({ label: clan.name, description: "FWA | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                    } catch (err) {
                        text += (idx + 1) + ". ❌ " + fwaTags[idx] + " - Error\n";
                    }
                }

                if (options.length === 0) return interaction.editReply("No FWA clans found.");
                
                if (options.length > 25) options = options.slice(0, 25);
                
                let embedFwa = new EmbedBuilder().setTitle("FWA Clans").setDescription(text).setColor(0xE74C3C);
                let selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("clans10_sel_fwa").setPlaceholder("Select an FWA Clan").addOptions(options)
                );
                await interaction.editReply({ embeds: [embedFwa], components: [selectRow] });
            }
            
            else if (category === 'war') {
                let warTags = [];
                for (let cTag in clanRoles) {
                    if (clanRoles[cTag].clanType === "war") warTags.push(cTag);
                }

                let text = getEmoji("cocfight") + " **War Clans** are competitive and focus on winning streaks!\n\n**War Clans - " + warTags.length + "**\n";
                let options = [];
                for (let idx = 0; idx < warTags.length; idx++) {
                    try {
                        let tag = warTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("cocfight");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cocfight");

                        let clan = await coc.getClan(tag);
                        text += (idx + 1) + ". " + badgeEmojiStr + " **" + clan.name + "** `" + clan.tag + "`\n";
                        options.push({ label: clan.name, description: "War | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                    } catch (err) {
                        text += (idx + 1) + ". ❌ " + warTags[idx] + " - Error\n";
                    }
                }

                if (options.length === 0) return interaction.editReply("No War clans found.");
                
                if (options.length > 25) options = options.slice(0, 25);
                
                let embedWar = new EmbedBuilder().setTitle("War Clans").setDescription(text).setColor(0xE74C3C);
                let selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("clans10_sel_war").setPlaceholder("Select a War Clan").addOptions(options)
                );
                await interaction.editReply({ embeds: [embedWar], components: [selectRow] });
            }

            else if (category === 'cwl') {
                let cwlData = getCwlClans();
                let seriousTags = [];
                let lazyTags = [];
                for (let tag in cwlData) {
                    if (cwlData[tag].style === "serious" || cwlData[tag].type === "serious" || cwlData[tag].clanType === "serious") seriousTags.push(tag);
                    else lazyTags.push(tag);
                }

                let text = "**SERIOUS CWL CLANS - " + seriousTags.length + "**\n";
                let options = [];
                for (let idx = 0; idx < seriousTags.length; idx++) {
                    try {
                        let tag = seriousTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("cwl");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cwl");

                        let clan = await coc.getClan(tag);
                        let league = clan.warLeague ? clan.warLeague.name : "Unranked";
                        text += (idx + 1) + ". " + badgeEmojiStr + " **" + clan.name + "** - " + league + "\n";
                        options.push({ label: clan.name, description: "Serious CWL | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                    } catch (err) { }
                }

                text += "\n**LAZY CWL CLANS - " + lazyTags.length + "**\n";
                for (let idx = 0; idx < lazyTags.length; idx++) {
                    try {
                        let tag = lazyTags[idx];
                        let clanInfo = clanRoles[tag] || {};
                        let clanNick = clanInfo.nickName ? clanInfo.nickName.toLowerCase() : "";
                        let badgeEmojiStr = clanNick && getEmoji(clanNick) ? getEmoji(clanNick) : getEmoji("cwl");
                        let badgeEmojiObj = clanNick && getEmojiObject(clanNick) ? getEmojiObject(clanNick) : getEmojiObject("cwl");

                        let clan = await coc.getClan(tag);
                        text += (idx + 1) + ". " + badgeEmojiStr + " **" + clan.name + "**\n";
                        options.push({ label: clan.name, description: "Lazy CWL | " + clan.tag, value: clan.tag.replace("#", ""), emoji: badgeEmojiObj });
                    } catch (err) { }
                }

                if (options.length === 0) return interaction.editReply("No CWL clans found.");
                if (options.length > 25) options = options.slice(0, 25);

                let embedCwl = new EmbedBuilder().setTitle("CWL Clans").setDescription(text).setColor(0x2ECC71);
                let selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId("clans10_sel_cwl").setPlaceholder("Select a CWL Clan").addOptions(options)
                );
                await interaction.editReply({ embeds: [embedCwl], components: [selectRow] });
            }
        } catch (error) {
            console.error("Error in /family-clans command:", error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ An error occurred while fetching clan details.").catch(() => {});
            } else {
                await interaction.reply({ content: "❌ An error occurred while fetching clan details.", ephemeral: true }).catch(() => {});
            }
        }
    }
};
