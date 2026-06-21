const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketadd')
        .setDescription('Add a user or role to the ticket')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to add')
                .setRequired(false))
        .addRoleOption(option => 
            option.setName('role')
                .setDescription('The role to add')
                .setRequired(false)),

    async execute(interaction, context) {
        const { config } = context;
        const targetUser = interaction.options.getUser('user');
        const targetRole = interaction.options.getRole('role');
        const { channel, member } = interaction;

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
            return interaction.reply({
                content: '❌ You do not have the required permissions to add members or roles to tickets.',
                ephemeral: true
            });
        }

        const target = targetUser || targetRole;
        if (!target) {
            return interaction.reply({
                content: '❌ Please select a **user** or a **role**.',
                ephemeral: true
            });
        }

        const CATEGORY_ID = config.TICKET_CATEGORY_ID || config.ADMIN_CATEGORY_ID;
        if (channel.parentId !== CATEGORY_ID) {
            return interaction.reply({
                content: '❌ This command can only be used inside a ticket channel.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const isRole = !!targetRole && !targetUser;

            await channel.permissionOverwrites.edit(target.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });

            const addEmbed = new EmbedBuilder()
                .setTitle(isRole ? '🛡️ Role Added' : '👤 Member Added')
                .setDescription(`${target} has been added to this ticket by ${member.user}.`)
                .setColor(0x2ecc71)
                .setTimestamp();

            await interaction.editReply({
                embeds: [addEmbed]
            });

        } catch (error) {
            console.error('Error adding to ticket:', error);
            await interaction.editReply({
                content: '❌ Failed to add to the ticket. Please check bot permissions.'
            });
        }
    }
};
