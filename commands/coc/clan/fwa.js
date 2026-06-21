
module.exports = {
    name: "fwa",
    description: "Shows information about Farm War Alliance",
    async execute(message, args, context) {
        if (args.length > 50) return;

        const { EmbedBuilder, emoji: emojiUtils } = context;
        const arrow = emojiUtils.getEmoji("arrow");
        try {
            if (message.deletable) {
                await message.delete().catch(() => { });
            }

            const randomColor = Math.floor(Math.random() * 16777215);

            const embed = new EmbedBuilder()
                .setTitle(`${arrow} About FWA (Farm War Alliance)`)
                .setColor(randomColor)
                .setDescription(
                    " • **Farm War Alliance (FWA)** is a group of **600+ clans** that sync the start of their wars at the same time to try and match each other in war. When two war farming clans match, each side maintains easy to beat war bases. Each player uses their first attack on their mirror for either 2 or 3 stars.\n\n" +
                    "✨ FWA’s primary goal is to get **easy stars, easy wars, and easy loot 🥳**. Because of the easy base design you can 3 star any opponent’s base with no trouble!\n\n" +
                    " • Each and every war we will send a **clan mail** to inform which clan takes the win:\n" +
                    " • If we **win**, you attack your mirror (opposite number) for **3⭐**\n" +
                    " • If we **lose**, you attack your mirror for **2⭐**\n" +
                    " • For your **second attack**, you may attack the number 1 opponent for **1⭐**\n\n" +
                    "📊 On average:\n" +
                    " • Win war → ~1.5M Gold & Elixir\n" +
                    " • Lose war → ~700k Gold & Elixir\n" +
                    "*(Depends on Town Hall level)*\n\n" +
                    "✅ No Heroes needed\n" +
                    "✅ No Stress\n" +
                    "✅ ONLY Fun!\n\n" +
                    " • Which clan wins is determined by **losses or a lottery system**. These systems are completely fair.\n\n" +
                    "🎉 Have fun!\n\n" +
                    " • **TO KNOW MORE ABOUT FWA** → [🌐 Farm War Alliance Website](http://www.farmwaralliance.org/)"
                );

            await message.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error("Error in fwa command:", err);
        }
    },
};
