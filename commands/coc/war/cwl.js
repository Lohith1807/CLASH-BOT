module.exports = {
  name: "cwl",
  description: "Shows information about Lazy CWL and Blood Alliance",

  async execute(message, args, { EmbedBuilder, emoji: emojiUtils }) {
    try {
      const arrow          = emojiUtils.getEmoji("arrow");
      const yellowarr      = emojiUtils.getEmoji("yellowarr");
      const pinkdot        = emojiUtils.getEmoji("pinkdot");
      const orangedot      = emojiUtils.getEmoji("orangedot");
      const cyandot        = emojiUtils.getEmoji("cyandot");
      const book           = emojiUtils.getEmoji("book");
      const shiba_celebrate = emojiUtils.getEmoji("shiba_celebrate");
      const thumbup        = emojiUtils.getEmoji("thumbup");
      if (message.deletable) message.delete().catch(() => { });

      const cwlEmbed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${arrow} What is Lazy CWL?`)
        .setDescription(
          "Lazy CWL is a strategy where you run FWA wars and CWL at the same time using a separate clan. You farm loot and earn CWL medals without pressure."
        )
        .setImage("https://cdn.discordapp.com/attachments/1154115415606308956/1407899566992261271/cwll.png")
        .addFields(
          {
            name: `${yellowarr} **Key Points**`,
            value: "\u200B",
          },
          {
            name: "1. Dual Participation",
            value:
              "Run FWA farming wars in the main clan while playing CWL in a separate clan at the same time.",
          },
          {
            name: "2. One Hit, Double Benefit",
            value:
              `${pinkdot} Loot from FWA wars 💰\n` +
              `${orangedot} CWL medals 💎\n` +
              `${cyandot} Minimal effort, maximum return`,
          },
          {
            name: "3. Stress-Free Gameplay",
            value:
              "No pressure for perfect attacks. Ideal for casual players and farming-focused players.",
          },
          {
            name: "4. Separate Clan Setup",
            value:
              "CWL runs in another clan so FWA wars continue without interruption in the main clan.",
          },
          {
            name: "5. Built for Growth",
            value:
              "Earn both resources and CWL medals every month — fast progression for rushers and maxers.",
          },
          {
            name: `${book} CWL Town Hall Placement Guide`,
            value:
              "**1.** Max TH 18 | War Weight: 175K+ | League: Master 1\n" +
              "**2.** Rush TH 18 & TH 17 | War Weight: Any | League: Master 2\n" +
              "**3.** TH 16 & 15 | War Weight: Any | League: Master 3\n" +
              "**4.** TH 14 & Below | War Weight: Any | League: Crystal 1",
          },
          {
            name: `${shiba_celebrate} Summary`,
            value:
              "Lazy CWL = Double rewards, single effort\n" +
              `FWA farming + CWL medals = Fastest growth path ${thumbup}\n\n` +
              "Join **Blood Alliance** and stop grinding the hard way.",
          }
        );

      await message.channel.send({ embeds: [cwlEmbed] });
    } catch (error) {
      console.error("❌ Error in cwl command:", error);
      return message.channel
        .send("⚠️ Error loading CWL information. Please try again.")
        .catch(() => {});
    }
  },
};