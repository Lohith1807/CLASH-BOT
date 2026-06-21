const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autopost')
        .setDescription('Toggle automatic recruitment posting for a specific clan')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('The clan to update')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addBooleanOption(option =>
            option.setName('status')
                .setDescription('Enable (True) or Disable (False) auto-posting')
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const choices = [];
        if ("all clans".includes(focusedValue) || "all".includes(focusedValue)) {
            choices.push({ name: "🌍 All Clans", value: "all" });
        }

        for (const [tag, roleInfo] of Object.entries(clanRoles)) {
            const name = roleInfo.nickName || tag;
            const currentStatus = roleInfo.autoPostRecruitment ? "✅" : "❌";
            
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

        if (tag === 'all') {
            for (const key of Object.keys(clanRoles)) {
                clanRoles[key].autoPostRecruitment = status;
            }
            dataManager.saveClanRoles(clanRoles);

            const embed = new EmbedBuilder()
                .setTitle('Recruitment Automation Updated')
                .setColor(status ? 0x2ECC71 : 0xE74C3C)
                .setDescription(
                    `• **Clan:** 🌍 All Clans\n` +
                    `• **Auto-Post:** ${status ? '✅ **Enabled**' : '❌ **Disabled**'} for all clans\n\n` +
                    `${status ? 'The bot will now automatically post ads for all clans when space is available.' : 'You must now use `/postrecruitment` to post ads for any clan.'}`
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (!clanRoles[tag]) {
            return interaction.reply({ content: "❌ Clan not found in configuration.", ephemeral: true });
        }

        clanRoles[tag].autoPostRecruitment = status;
        dataManager.saveClanRoles(clanRoles);

        const embed = new EmbedBuilder()
            .setTitle('Recruitment Automation Updated')
            .setColor(status ? 0x2ECC71 : 0xE74C3C)
            .setDescription(
                `• **Clan:** ${clanRoles[tag].nickName || tag} (${tag})\n` +
                `• **Auto-Post:** ${status ? '✅ **Enabled**' : '❌ **Disabled**'}\n\n` +
                `${status ? 'The bot will now automatically post ads when space is available.' : 'You must now use `/postrecruitment` to post ads for this clan.'}`
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
