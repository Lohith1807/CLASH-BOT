const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { connectToDatabase, Clan } = require('../../../utils/mongodb.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lsweb')
        .setDescription('List all clans stored in the MongoDB database')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

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
