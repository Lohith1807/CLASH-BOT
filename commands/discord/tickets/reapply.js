

module.exports = {
    async execute(message, args, { EmbedBuilder, config, client }) {
        const { PermissionFlagsBits } = require("discord.js");
        const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
        const REAPPLY_ROLE_ID = "1442426406444335217"; // fallback if not in config
        const TARGET_CHANNEL_ID = "1442426262906736660"; // fallback if not in config

        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.channel.send("❌ You do not have permission to use this command.");
        }

        const targetChannel = message.guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!targetChannel) {
            return message.channel.send("❌ Target channel not found. Check CHANNEL ID.");
        }

        const globalRole = message.guild.roles.cache.get(GLOBAL_ROLE_ID);
        const reapplyRole = message.guild.roles.cache.get(REAPPLY_ROLE_ID);

        if (!globalRole || !reapplyRole) {
            return message.channel.send("❌ One or more role IDs are invalid.");
        }

        let membersToProcess = [];

        if (args[0] && args[0].toLowerCase() === "all") {
            membersToProcess = globalRole.members.map(m => m);
        }
        else if (message.mentions.roles.size > 0) {
            const role = message.mentions.roles.first();
            membersToProcess = role.members.map(m => m);
        }
        else if (message.mentions.members.size > 0) {
            const member = message.mentions.members.first();
            membersToProcess = [member];
        }
        else {
            return message.channel.send("❌ Please mention a **member**, **role**, or use `;re all`");
        }

        let processed = 0;

        for (const member of membersToProcess) {

            if (member.user.bot) continue;

            if (member.roles.cache.has(REAPPLY_ROLE_ID)) continue;

            if (!member.roles.cache.has(GLOBAL_ROLE_ID)) continue;

            try {
                await member.roles.remove(GLOBAL_ROLE_ID);
                await member.roles.add(REAPPLY_ROLE_ID);

                const embed = new EmbedBuilder()
                    .setColor("Red")
                    .setTitle("⚠️ Re-Application Required")
                    .setDescription(
                        `You didn’t **open a ticket** after joining the alliance within **12 hours**.\n\n` +
                        `This makes us believe you may be **inactive**.\n\n` +
                        `If you are still interested in joining us,\n` +
                        `✅ **apply again by opening a ticket.**`
                    )
                    .setFooter({ text: client.user.username })
                    .setTimestamp();

                await targetChannel.send({
                    content: `<@${member.id}>`,
                    embeds: [embed]
                });

                processed++;

                await new Promise(res => setTimeout(res, 400));

            } catch (err) {
                console.error(`Failed to update ${member.user.tag}`, err);
            }
        }

        return message.channel.send(
            `✅ Process completed.\n\n👥 **Members updated:** ${processed}`
        );
    }
};
