const clanRotation = require('./clan-rotation.js');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    ...clanRotation,
    name: "clan-rotations",
    description: "Display current recruitment rotation status for all FWA clans",
    data: new SlashCommandBuilder()
        .setName("clan-rotations")
        .setDescription("Display current recruitment rotation status for all FWA clans")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
};
