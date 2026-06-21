const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: "ping",
    description: "Check bot latency and system status",
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and system status'),

    async execute(input, args, context) {
        const isInteraction = typeof input.isChatInputCommand === 'function' && input.isChatInputCommand();
        const ctx = isInteraction ? args : context;
        const { EmbedBuilder, client } = ctx;

        try {
            if (isInteraction) {
                await input.deferReply();
            }

            const startTime = Date.now();
            const loadingEmbed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setDescription("📡 Calculating latency...");

            let msg;
            if (isInteraction) {
                msg = await input.editReply({ embeds: [loadingEmbed] });
            } else {
                msg = await input.channel.send({ embeds: [loadingEmbed] });
            }

            const endTime = Date.now();
            const roundTrip = endTime - startTime;
            const apiLatency = Math.round(client.ws.ping);

            const resultEmbed = new EmbedBuilder()
                .setColor(0x2ECC71)
                .setTitle("🏓 Pong!")
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: "Bot Latency", value: `\`${roundTrip}ms\``, inline: true },
                    { name: "API Latency", value: `\`${apiLatency}ms\``, inline: true },
                    { name: "Status", value: "✅ Online & Healthy", inline: true }
                )
                .setFooter({ text: "Perfect Interaction System" })
                .setTimestamp();

            if (isInteraction) {
                await input.editReply({ embeds: [resultEmbed] });
            } else {
                await msg.edit({ embeds: [resultEmbed] });
            }

        } catch (error) {
            console.error("❌ Ping Command Error:", error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setDescription("❌ An error occurred while checking bot status.");
            
            if (isInteraction) {
                await input.editReply({ embeds: [errorEmbed] }).catch(() => {});
            } else {
                await input.channel.send({ embeds: [errorEmbed] }).catch(() => {});
            }
        }
    }
};
