const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refresh')
        .setDescription('Refresh all clans data in MongoDB from the Clash of Clans API'),

    async execute(interaction, context) {
        const { coc } = context;
        await interaction.deferReply();

        try {
            await connectToDatabase();
            const clans = await Clan.find({});

            if (clans.length === 0) {
                return interaction.editReply({ content: '❌ No clans found in MongoDB to refresh.' }).catch(() => null);
            }

            await interaction.editReply({ content: `⏳ Refreshing data for ${clans.length} clans. This may take a while...` }).catch(() => null);

            let successCount = 0;
            let failCount = 0;

            for (const clanRecord of clans) {
                try {
                    const clanTag = clanRecord.tag;
                    const clanData = await coc.getClan(clanTag);

                    if (clanData) {
                        const members = clanData.memberList;
                        const detailedMembers = [];
                        const BATCH_SIZE = 10;

                        for (let i = 0; i < members.length; i += BATCH_SIZE) {
                            const batch = members.slice(i, i + BATCH_SIZE);
                            const batchResults = await Promise.all(
                                batch.map(async (member) => {
                                    try {
                                        const fullPlayer = await coc.getPlayer(member.tag);
                                        return { ...member, ...fullPlayer };
                                    } catch (err) {
                                        return member;
                                    }
                                })
                            );
                            detailedMembers.push(...batchResults);
                        }

                        clanData.memberList = detailedMembers;
                        
                        await Clan.findOneAndUpdate(
                            { tag: clanTag },
                            { 
                                ...clanData, 
                                updatedAt: new Date() 
                            },
                            { upsert: true }
                        );
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    console.error(`Failed to refresh clan ${clanRecord.tag}:`, err.message);
                    failCount++;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 MongoDB Refresh Complete')
                .setColor(0x3498DB)
                .addFields(
                    { name: 'Total Clans', value: clans.length.toString(), inline: true },
                    { name: 'Success', value: successCount.toString(), inline: true },
                    { name: 'Failed', value: failCount.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [embed] }).catch(async (err) => {
                console.error("Could not edit interaction reply (likely expired):", err.message);
                await interaction.channel.send({ 
                    content: `✅ **Refresh Complete** for <@${interaction.user.id}>`, 
                    embeds: [embed] 
                }).catch(() => null);
            });

        } catch (error) {
            console.error("Error in /refresh command:", error);
            try {
                await interaction.editReply({ content: `❌ An error occurred: \`${error.message}\`` });
            } catch (e) {
                await interaction.channel.send({ content: `❌ **Error in /refresh** for <@${interaction.user.id}>: \`${error.message}\`` }).catch(() => null);
            }
        }
    }
};
