const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clanrevoke")
        .setDescription("Remove a clan entry from the registry")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("clan")
                .setDescription("Select the clan to remove")
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, context) {
        const { data: dataManager, config } = context;
        const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];
        if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) return interaction.respond([]);

        var clanRoles = dataManager.getClanRoles();
        var focused = interaction.options.getFocused().toLowerCase();

        var choices = [];
        for (var tag in clanRoles) {
            var entry = clanRoles[tag];
            var label = tag;
            if (entry.nickName) label = entry.nickName + " — " + tag;
            if (entry.clanType) label += " (" + entry.clanType + ")";

            if (label.toLowerCase().includes(focused) || tag.toLowerCase().includes(focused)) {
                choices.push({ name: label, value: tag });
            }
        }

        await interaction.respond(choices.slice(0, 25)).catch(function() {});
    },

    async execute(interaction, context) {
        try {
            const { data: dataManager, config } = context;
            const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

            if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
                return interaction.reply({ content: "❌ You do not have permission (Staff/Admin) to use this command.", ephemeral: true });
            }

            var clanTag = interaction.options.getString("clan").toUpperCase();
            if (!clanTag.startsWith("#")) clanTag = "#" + clanTag;

            var clanroles = dataManager.getClanRoles();

            if (!clanroles[clanTag]) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("❌ Not Found")
                            .setDescription("Clan **" + clanTag + "** is not registered.")
                            .setColor(0xe74c3c)
                            .setTimestamp()
                    ],
                    ephemeral: true
                });
            }

            var entry = clanroles[clanTag];
            var infoLines = "**Tag:** " + clanTag + "\n";
            if (entry.nickName) infoLines += "**Nickname:** " + entry.nickName + "\n";
            if (entry.clanType) infoLines += "**Type:** " + entry.clanType + "\n";
            if (entry.roleId) infoLines += "**Role:** <@&" + entry.roleId + ">\n";

            var embed = new EmbedBuilder()
                .setTitle("⚠️ Confirm Revocation")
                .setDescription("Are you sure you want to remove this clan from the registry?\n\n" + infoLines)
                .setColor(0xe67e22)
                .setTimestamp();

            var row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("confirm_revoke")
                    .setLabel("Confirm Removal")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("cancel_revoke")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
            );

            const response = await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });

            const filter = i => i.user.id === interaction.user.id;
            try {
                const confirmation = await response.awaitMessageComponent({ filter, time: 30000 });

                if (confirmation.customId === "confirm_revoke") {
                    clanroles = dataManager.getClanRoles();
                    if (clanroles[clanTag]) {
                        delete clanroles[clanTag];
                        dataManager.saveClanRoles(clanroles);

                        await confirmation.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("🗑️ Clan Revoked")
                                    .setDescription("Successfully removed clan **" + clanTag + "** from the registry.")
                                    .setColor(0xe74c3c)
                                    .setTimestamp()
                            ],
                            components: []
                        });
                    } else {
                        await confirmation.update({ content: "❌ Clan already removed.", embeds: [], components: [] });
                    }
                } else if (confirmation.customId === "cancel_revoke") {
                    await confirmation.update({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("✅ Cancelled")
                                .setDescription("Clan revocation cancelled. No changes were made.")
                                .setColor(0x2ecc71)
                                .setTimestamp()
                        ],
                        components: []
                    });
                }
            } catch (e) {
                await interaction.editReply({ content: "⌛ Confirmation timed out. No changes made.", embeds: [], components: [] });
            }

        } catch (error) {
            console.error("❌ Error in clanrevoke command:", error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: "❌ An error occurred.", ephemeral: true });
                } else {
                    await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
                }
            } catch (e) {}
        }
    }
};
