const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    UserSelectMenuBuilder,
    ComponentType,
    PermissionFlagsBits 
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("updateclanentry")
        .setDescription("Update leadership (Leader/Co-Leaders) for a registered clan.")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Select the clan to update")
                .setAutocomplete(true)
                .setRequired(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager } = context;
        const clanRoles = dataManager.getClanRoles();
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        const choices = Object.entries(clanRoles).map(([tag, data]) => ({
            name: `${data.nickName || "Unknown"} (${tag})`,
            value: tag
        }));

        const filtered = choices.filter(choice => 
            choice.name.toLowerCase().includes(focusedValue) || 
            choice.value.toLowerCase().includes(focusedValue)
        ).slice(0, 25);

        await interaction.respond(filtered);
    },

    async execute(interaction, context) {
        const { data: dataManager } = context;
        const clanTag = interaction.options.getString("clan");
        const clanRoles = dataManager.getClanRoles();
        const clanData = clanRoles[clanTag];

        if (!clanData) {
            return interaction.reply({ content: "❌ This clan is not registered.", ephemeral: true });
        }

        const formatList = (list) => (list && list.length > 0) ? list.join("\n") : "*None*";

        const buildMainEmbed = () => {
            const data = dataManager.getClanRoles()[clanTag];
            return new EmbedBuilder()
                .setTitle(`Management: ${data.nickName || clanTag}`)
                .setColor(0x3498db)
                .addFields(
                    { name: "👑 Leader", value: formatList(data.leaders), inline: true },
                    { name: "🔱 Co-Leaders", value: formatList(data.coLeaders), inline: true }
                )
                .setFooter({ text: `Clan Tag: ${clanTag}` })
                .setTimestamp();
        };

        const mainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("update_leadership")
                .setLabel("Update")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("add_coleaders")
                .setLabel("Add New Co's")
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await interaction.reply({
            embeds: [buildMainEmbed()],
            components: [mainRow],
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on("collect", async (i) => {
            const currentData = dataManager.getClanRoles()[clanTag];

            if (i.customId === "update_leadership") {
                const options = [
                    { label: "Leader", value: "leader", description: "Replace the main leader" }
                ];

                for (let j = 0; j < 4; j++) {
                    const currentUser = (currentData.coLeaders && currentData.coLeaders[j]) ? currentData.coLeaders[j] : "Empty";
                    options.push({
                        label: `Co-Leader ${j + 1}`,
                        value: `co_${j}`,
                        description: `Current: ${currentUser.replace(/[<@!>]/g, "")}`
                    });
                }

                const selectRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select_position")
                        .setPlaceholder("Select a position to update/remove")
                        .addOptions(options)
                );

                await i.update({
                    content: "Select the position you want to modify:",
                    components: [selectRow]
                });

            } else if (i.customId === "add_coleaders") {
                const coLeaders = currentData.coLeaders || [];
                if (coLeaders.length >= 4) {
                    return i.reply({ content: "❌ This clan already has the maximum (4) Co-Leaders.", ephemeral: true });
                }

                const userSelectRow = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId("select_new_cos")
                        .setPlaceholder("Select users to add as Co-Leaders")
                        .setMinValues(1)
                        .setMaxValues(4 - coLeaders.length)
                );

                await i.update({
                    content: `You can add up to ${4 - coLeaders.length} more Co-Leaders:`,
                    components: [userSelectRow]
                });
            }
        });

        const selectCollector = response.createMessageComponentCollector({
            time: 300000
        });

        selectCollector.on("collect", async (i) => {
            let currentRoles = dataManager.getClanRoles();
            let currentClan = currentRoles[clanTag];

            const logChange = async (action, details) => {
                const syncChannelId = context.config?.SYNC_LOG_ID || process.env.SYNC_LOG_ID;
                if (!syncChannelId) return;
                try {
                    const logChannel = await i.client.channels.fetch(syncChannelId).catch(() => null);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle("Clan Leadership Update")
                            .setColor(0x3498db)
                            .addFields(
                                { name: "Clan", value: `${currentClan.nickName || clanTag} (${clanTag})`, inline: false },
                                { name: "Action", value: action, inline: false },
                                { name: "Details", value: details, inline: false }
                            )
                            .setFooter({ text: `Updated by ${i.user.username}`, iconURL: i.user.displayAvatarURL() })
                            .setTimestamp();
                        await logChannel.send({ embeds: [embed] }).catch(() => null);
                    }
                } catch (err) {}
            };

            if (i.customId === "select_position") {
                const position = i.values[0];
                
                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pos_replace_${position}`)
                        .setLabel("Replace/Set")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`pos_clear_${position}`)
                        .setLabel("Clear/Remove")
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId("back_to_main")
                        .setLabel("Back")
                        .setStyle(ButtonStyle.Secondary)
                );

                let posName = position === "leader" ? "Leader" : `Co-Leader ${parseInt(position.split("_")[1]) + 1}`;
                await i.update({
                    content: `What would you like to do with the **${posName}** position?`,
                    components: [actionRow]
                });

            } else if (i.customId.startsWith("pos_replace_")) {
                const position = i.customId.replace("pos_replace_", "");
                
                const userSelectRow = new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId(`set_user_${position}`)
                        .setPlaceholder(`Select new user for ${position}`)
                        .setMaxValues(1)
                );

                await i.update({
                    content: `Select the new user for the **${position}** position:`,
                    components: [userSelectRow]
                });

            } else if (i.customId.startsWith("pos_clear_")) {
                const position = i.customId.replace("pos_clear_", "");
                let removedUser = "None";
                let posName = position === "leader" ? "Leader" : `Co-Leader ${parseInt(position.split("_")[1]) + 1}`;
                
                if (position === "leader") {
                    removedUser = currentClan.leaders && currentClan.leaders.length > 0 ? currentClan.leaders[0] : "None";
                    currentClan.leaders = [];
                } else {
                    const idx = parseInt(position.split("_")[1]);
                    if (currentClan.coLeaders && currentClan.coLeaders[idx]) {
                        removedUser = currentClan.coLeaders[idx];
                        currentClan.coLeaders.splice(idx, 1);
                    }
                }

                dataManager.saveClanRoles(currentRoles);
                await logChange("Position Cleared", `Removed **${removedUser}** from the **${posName}** position.`);
                await i.update({
                    content: "✅ Position cleared and changes saved.",
                    embeds: [buildMainEmbed()],
                    components: [mainRow]
                });

            } else if (i.customId.startsWith("set_user_")) {
                const position = i.customId.replace("set_user_", "");
                const newUserMention = `<@${i.values[0]}>`;
                let oldUser = "None";
                let posName = position === "leader" ? "Leader" : `Co-Leader ${parseInt(position.split("_")[1]) + 1}`;

                if (position === "leader") {
                    oldUser = currentClan.leaders && currentClan.leaders.length > 0 ? currentClan.leaders[0] : "None";
                    currentClan.leaders = [newUserMention];
                } else {
                    const idx = parseInt(position.split("_")[1]);
                    if (!currentClan.coLeaders) currentClan.coLeaders = [];
                    oldUser = currentClan.coLeaders[idx] || "None";
                    currentClan.coLeaders[idx] = newUserMention;
                }

                dataManager.saveClanRoles(currentRoles);
                await logChange("User Replaced/Set", `Changed **${posName}** from ${oldUser} to ${newUserMention}.`);
                await i.update({
                    content: "✅ Leadership updated and changes saved.",
                    embeds: [buildMainEmbed()],
                    components: [mainRow]
                });

            } else if (i.customId === "select_new_cos") {
                const newMentions = i.values.map(id => `<@${id}>`);
                if (!currentClan.coLeaders) currentClan.coLeaders = [];
                
                let addedMentions = [];
                newMentions.forEach(mention => {
                    if (!currentClan.coLeaders.includes(mention) && currentClan.coLeaders.length < 4) {
                        currentClan.coLeaders.push(mention);
                        addedMentions.push(mention);
                    }
                });

                dataManager.saveClanRoles(currentRoles);
                if (addedMentions.length > 0) {
                    await logChange("Added Co-Leaders", `Added ${addedMentions.join(", ")} as new Co-Leader(s).`);
                }
                await i.update({
                    content: `✅ Added ${newMentions.length} Co-Leader(s) and changes saved.`,
                    embeds: [buildMainEmbed()],
                    components: [mainRow]
                });

            } else if (i.customId === "back_to_main") {
                await i.update({
                    content: null,
                    embeds: [buildMainEmbed()],
                    components: [mainRow]
                });
            }
        });
    }
};
