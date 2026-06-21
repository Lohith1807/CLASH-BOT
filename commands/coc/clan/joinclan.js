const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, "../../../data/cwlfuture.json");

function loadData() {
    try {
        if (!fs.existsSync(dataPath)) {
            const dataDir = path.dirname(dataPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            return {};
        }
        const raw = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return {};
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing cwlfuture.json:", e);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setcwl-futurefwa')
        .setDescription('Set a clan as CWL or Future FWA')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option => 
            option.setName('clantag')
                .setDescription('The clan tag (e.g., #XXXXXX)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Select CWL or Future FWA')
                .setRequired(true)
                .addChoices(
                    { name: 'CWL', value: 'cwl' },
                    { name: 'Future FWA', value: 'futurefwa' }
                ))
        .addStringOption(option =>
            option.setName('style')
                .setDescription('Required if CWL: Serious or Lazy')
                .setRequired(false)
                .addChoices(
                    { name: 'Serious', value: 'serious' },
                    { name: 'Lazy', value: 'lazy' }
                )),

    async execute(interaction, context) {
        const rawTag = interaction.options.getString('clantag');
        const type = interaction.options.getString('type');
        const style = interaction.options.getString('style');

        if (type === 'cwl' && !style) {
            return interaction.reply({ content: "❌ You must select a **style** (Serious/Lazy) when setting a clan as CWL.", ephemeral: true });
        }
        
        const coc = context?.coc;
        let clanTag = rawTag.startsWith("#") ? rawTag.toUpperCase() : "#" + rawTag.toUpperCase();
        
        if (coc && coc.formatTag) {
            clanTag = coc.formatTag(rawTag);
        }

        await interaction.deferReply({ ephemeral: true });

        let clanName = "Unknown Clan";
        if (coc) {
            try {
                const clan = await coc.getClan(clanTag);
                if (clan) clanName = clan.name;
            } catch (err) {
                return interaction.editReply(`❌ Could not find clan with tag \`${clanTag}\`.`);
            }
        }

        const data = loadData();

        if (type === 'cwl') {
            data[clanTag] = {
                name: clanName,
                type: 'cwl',
                style: style
            };
            
            saveData(data);
            
            const embed = new EmbedBuilder()
                .setTitle("✅ Clan CWL Status Updated")
                .setDescription(`Successfully set **${clanName}** (\`${clanTag}\`) as a **${style.charAt(0).toUpperCase() + style.slice(1)} CWL** clan. Data saved to \`cwlfuture.json\`.`)
                .setColor(0x2ECC71);

            return interaction.editReply({ embeds: [embed] });

        } else if (type === 'futurefwa') {
            data[clanTag] = {
                name: clanName,
                type: 'futurefwa'
            };
            
            saveData(data);

            const embed = new EmbedBuilder()
                .setTitle("✅ Clan Future FWA Status Updated")
                .setDescription(`Successfully set **${clanName}** (\`${clanTag}\`) as a **Future FWA** clan. Data saved to \`cwlfuture.json\`.`)
                .setColor(0x3498DB);

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
