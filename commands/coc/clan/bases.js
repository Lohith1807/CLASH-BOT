const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const basesPath = path.join(__dirname, '../../../data/fwa_bases.json');

module.exports = {
    name: "bases",
    description: "Show FWA base links and update them",
    
    data: new SlashCommandBuilder()
        .setName('updatebase')
        .setDescription('Update an FWA base link for a specific Town Hall level')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('th')
                .setDescription('The Town Hall level (e.g., 18, 19)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('link')
                .setDescription('The new base link')
                .setRequired(true)
        ),

    async execute(source, argsOrContext, maybeContext) {
        if (!source.isChatInputCommand || !source.isChatInputCommand()) {
            const message = source;
            const context = maybeContext || argsOrContext;
            return this.showBases(message, context);
        }

        const interaction = source;
        const context = argsOrContext;
        return this.handleUpdate(interaction, context);
    },

    async showBases(message, context) {
        try {
            const { EmbedBuilder, emoji: emojiUtils } = context;
            
            if (!fs.existsSync(basesPath)) {
                return message.channel.send("⚠️ Base data file not found.");
            }

            const baseData = JSON.parse(fs.readFileSync(basesPath, 'utf8'));
            const randomColor = Math.floor(Math.random() * 16777215);
            
            if (message.deletable) message.delete().catch(() => { });

            const embed = new EmbedBuilder()
                .setTitle(`${emojiUtils.getEmoji("bluefwa")} FWA BASE LINKS`)
                .setDescription("## Click on the links to open in game !!")
                .setColor(randomColor)
                .setTimestamp();

            const thLevels = Object.keys(baseData)
                .filter(key => !isNaN(key) && key !== "lastUpdated")
                .map(Number)
                .sort((a, b) => b - a)
                .map(String);
            
            thLevels.forEach(th => {
                const link = baseData[th];
                if (link) {
                    embed.addFields({
                        name: `TH ${th} FWA BASE ${emojiUtils.getEmoji("whitefwa")}`,
                        value: `${emojiUtils.getEmoji("th" + th)} [Open In Game](${link})`,
                        inline: false
                    });
                }
            });

            embed.setFooter({ text: `Last updated: ${baseData.lastUpdated || "N/A"}` });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('❌ Error in bases command:', error);
            return message.channel.send('⚠️ Error loading FWA bases.').catch(() => { });
        }
    },

    async handleUpdate(interaction, context) {
        const { config, EmbedBuilder } = context;
        const member = interaction.member;

        const allowedRoles = [
            ...(config.ADMIN_ROLE_IDS || []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[0] ? [config.STAFF_ROLE_IDS[0]] : []),
            ...(config.STAFF_ROLE_IDS && config.STAFF_ROLE_IDS[1] ? [config.STAFF_ROLE_IDS[1]] : [])
        ];

        const hasAllowedRole = member.roles.cache.some(roleId => allowedRoles.includes(roleId));
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAdmin && !hasAllowedRole) {
            return interaction.reply({ content: "❌ You do not have permission to update base links.", ephemeral: true });
        }

        const thInput = interaction.options.getString('th');
        const th = thInput.replace(/\D/g, '') || thInput;
        const link = interaction.options.getString('link');

        if (!link.startsWith("https://link.clashofclans.com")) {
            return interaction.reply({ content: "❌ Invalid link format.", ephemeral: true });
        }

        try {
            let baseData = JSON.parse(fs.readFileSync(basesPath, 'utf8'));
            baseData[th] = link;
            
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            baseData.lastUpdated = dateStr;

            fs.writeFileSync(basesPath, JSON.stringify(baseData, null, 2));

            const embed = new EmbedBuilder()
                .setTitle("✅ Base Link Updated")
                .setColor("Green")
                .setDescription(`Successfully updated **TH ${th}** FWA base link.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            await interaction.reply({ content: "❌ Error saving data.", ephemeral: true });
        }
    }
};
