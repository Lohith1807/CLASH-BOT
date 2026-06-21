const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-autorole')
        .setDescription('Enable or disable automatic clan role assignment for a specific clan')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('The clan to update')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option.setName('status')
                .setDescription('Enable (True) or Disable (False) auto-role assignment')
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const choices = [];
        for (const [tag, roleInfo] of Object.entries(clanRoles)) {
            const name = roleInfo.nickName || tag;
            const currentStatus = roleInfo.autoRole ? "✅" : "❌";
            
            if (name.toLowerCase().includes(focusedValue) || tag.toLowerCase().includes(focusedValue)) {
                choices.push({ name: `${currentStatus} ${name} (${tag})`, value: tag });
            }
        }
        
        await interaction.respond(choices.slice(0, 25));
    },

    async execute(interaction, context) {
        const { options, member } = interaction;
        const { data: dataManager, config } = context;

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const isStaff = STAFF_ROLE_IDS.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only Staff or Admins can use this command.',
                ephemeral: true
            });
        }

        const tag = options.getString('clan');
        const status = options.getBoolean('status');
        
        const clanRoles = dataManager.getClanRoles();
        if (!clanRoles[tag]) {
            return interaction.reply({ content: "❌ Clan not found in configuration.", ephemeral: true });
        }

        clanRoles[tag].autoRole = status;
        dataManager.saveClanRoles(clanRoles);

        const embed = new EmbedBuilder()
            .setTitle('Clan Auto-Role Updated')
            .setColor(status ? 0x2ECC71 : 0xE74C3C)
            .setDescription(
                `• **Clan:** ${clanRoles[tag].nickName || tag} (${tag})\n` +
                `• **Auto-Role:** ${status ? '✅ **Enabled**' : '❌ **Disabled**'}\n\n` +
                `${status ? 'The bot will now automatically assign the clan role when a linked player joins the clan.' : 'Automatic role assignment is now disabled for this clan.'}`
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
