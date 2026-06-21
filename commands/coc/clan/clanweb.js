const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addclantoweb')
        .setDescription('Fetch clan data and store it in MongoDB')
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('The tag of the clan to fetch')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { coc } = context;
        const rawTag = interaction.options.getString('clantag');
        const clanTag = coc.formatTag(rawTag);

        await interaction.deferReply();

        try {
            await connectToDatabase();

            const clanData = await coc.getClan(clanTag);

            if (!clanData) {
                return interaction.editReply({ content: `❌ Could not find clan with tag \`${clanTag}\`.` });
            }

            await interaction.editReply({ content: `⏳ Gathering detailed info for **${clanData.name}** (${clanData.members} members)...` });

            const memberList = clanData.memberList || [];
            const detailedMembers = [];
            const batchSize = 10;

            for (let i = 0; i < memberList.length; i += batchSize) {
                const batch = memberList.slice(i, i + batchSize);
                const batchResults = await Promise.all(
                    batch.map(async (member) => {
                        try {
                            const fullPlayer = await coc.getPlayer(member.tag);
                            return { ...member, ...fullPlayer };
                        } catch (err) {
                            console.error(`[AddClanToWeb] Failed to fetch details for member ${member.tag}:`, err.message);
                            return member; // Fallback to basic info
                        }
                    })
                );
                detailedMembers.push(...batchResults);
            }

            clanData.memberList = detailedMembers;

            const finalData = {
                ...clanData,
                updatedAt: new Date() // Use standard Date object for Mongoose
            };

            await Clan.findOneAndUpdate(
                { tag: clanData.tag },
                finalData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const embed = new EmbedBuilder()
                .setTitle(`✅ Full Clan Data Synced`)
                .setDescription(`Successfully gathered all details for **${clanData.name}** and its **${clanData.members} members**. Data is now stored in MongoDB.`)
                .setThumbnail(clanData.badgeUrls.medium)
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Level', value: clanData.clanLevel.toString(), inline: true },
                    { name: 'Members', value: clanData.members.toString(), inline: true },
                    { name: 'Updated', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: `Tag: ${clanData.tag}` })
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [embed] });

        } catch (error) {
            console.error("Error in /addclantoweb command:", error);
            const errorMessage = error.response?.data?.message || error.message;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ An error occurred: \`${errorMessage}\`` });
            } else {
                await interaction.reply({ content: `❌ An error occurred: \`${errorMessage}\``, ephemeral: true });
            }
        }
    }
};
