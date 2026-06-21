const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lsweb')
        .setDescription('List all clans stored in the MongoDB database'),

    async execute(interaction, context) {
        await interaction.deferReply();

        try {
            await connectToDatabase();
            
            const clans = await Clan.find({}, 'tag name clanLevel members').sort({ name: 1 });

            if (clans.length === 0) {
                return interaction.editReply({ content: '❌ No clans found in the MongoDB database.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('📋 MongoDB Clan List')
                .setColor(0xF1C40F)
                .setDescription(clans.map(c => `• **${c.name}** (\`${c.tag}\`) - Lvl ${c.clanLevel} (${c.members} members)`).join('\n'))
                .setFooter({ text: `Total Clans: ${clans.length}` })
                .setTimestamp();

            if (embed.data.description.length > 4096) {
                embed.setDescription(embed.data.description.substring(0, 4090) + '...');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error in /lsweb command:", error);
            await interaction.editReply({ content: `❌ An error occurred: \`${error.message}\`` });
        }
    }
};
