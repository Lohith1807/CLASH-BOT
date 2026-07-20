const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeclanweb')
        .setDescription('Remove a clan from MongoDB database')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('clantag')
                .setDescription('The tag of the clan to remove')
                .setRequired(true)
        ),

    async execute(interaction, context) {
        const { config } = context;
        const member = interaction.member;

        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = member.roles.cache.some(roleId => allowedRoles.includes(roleId));
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: "❌ You do not have permission to use this command.", ephemeral: true });
        }

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
