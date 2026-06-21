const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeclanweb')
        .setDescription('Remove a clan from MongoDB database')
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('The tag of the clan to remove')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        let clanTag = interaction.options.getString('clantag').toUpperCase().replace('O', '0');
        if (!clanTag.startsWith('#')) clanTag = `#${clanTag}`;

        await interaction.deferReply();

        try {
            await connectToDatabase();
            
            const result = await Clan.findOneAndDelete({ tag: clanTag });

            if (!result) {
                return interaction.editReply({ content: `❌ No clan found in MongoDB with tag \`${clanTag}\`.` });
            }

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Clan Removed')
                .setDescription(`Successfully removed **${result.name || 'Unknown'}** (\`${clanTag}\`) from the MongoDB database.`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error in /removeclanweb command:", error);
            await interaction.editReply({ content: `❌ An error occurred: \`${error.message}\`` });
        }
    }
};
