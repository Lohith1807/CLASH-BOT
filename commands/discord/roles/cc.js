
const tick = "1410137697300775026";
const tickEmoji = `<:tick:${tick}>`;
const cocfightt = "1410132596763131914";
const cocEmoji = `<a:cocfight:${cocfightt}>`;

function getRandomColor() {
    return Math.floor(Math.random() * 16777215);
}

module.exports = {
    name: "cc",
    description: "Check Clash of Clans base and assign clan roles",
    async execute(message, args, context) {
        const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, coc, data, config } = context;
        if (message.deletable) message.delete().catch(() => { });

        const member = message.member;
        const allowedRoles = [
  ...config.ADMIN_ROLE_IDS,
  ...config.STAFF_ROLE_IDS
];


        if (!allowedRoles.some(roleId => member.roles.cache.has(roleId))) {
            return message.channel.send("❌ You do not have permission to use this command.");
        }

        const errorEmbed = new EmbedBuilder()
            .setColor(getRandomColor())
            .setDescription(`<a:bluex:1410137736765243432> ❌ Kid try to utilize commands properly or learn how to use`);

        if (!args[0] && !message.mentions.users.first()) {
            return message.channel.send({ content: `${message.author}`, embeds: [errorEmbed] });
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            let isValidTag = false;
            const tagRegex = /^#?[a-zA-Z0-9]{3,15}$/;
            if (tagRegex.test(args[0])) {
                try {
                    const tagToCheck = args[0].startsWith("#") ? args[0] : `#${args[0]}`;
                    const playerData = await coc.getPlayer(tagToCheck);
                    if (playerData && playerData.tag) {
                        isValidTag = true;
                    }
                } catch (e) {
                    isValidTag = false;
                }
            }

            if (!isValidTag) {
                return message.channel.send({ content: `${message.author}`, embeds: [errorEmbed] });
            }
        }

        let cleanTag, playerName;
        const targetUser = mentionedUser || message.author;
        const userdata = data.getUserData();
        const clanroles = data.getClanRoles();

        if (mentionedUser) {
            const linkedAccounts = userdata[mentionedUser.id];
            if (!linkedAccounts || linkedAccounts.length === 0) {
                return message.channel.send(`❌ ${mentionedUser} has no linked accounts.`);
            }

            if (linkedAccounts.length === 1) {
                cleanTag = linkedAccounts[0].tag.replace("#", "").toUpperCase();
                try {
                    const data = await coc.getPlayer(linkedAccounts[0].tag);
                    playerName = data.name;
                } catch (e) {
                    playerName = linkedAccounts[0].name;
                }
            } else {
                const options = [];
                for (const acc of linkedAccounts) {
                    let accName = acc.name;
                    try {
                        const data = await coc.getPlayer(acc.tag);
                        accName = data.name;
                    } catch (e) {
                    }
                    options.push({
                        label: `${accName} (#${acc.tag.replace("#", "").toUpperCase()})`,
                        value: JSON.stringify({ tag: acc.tag.replace("#", "").toUpperCase(), name: accName })
                    });
                }

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select-tag")
                        .setPlaceholder("Choose a Clash account")
                        .addOptions(options)
                );

                const prompt = await message.channel.send({
                    content: `🔎 ${message.author}, please choose which account you want to check:`,
                    components: [row]
                });

                const collector = prompt.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    max: 1,
                    time: 30000
                });

                collector.on("collect", async interaction => {
                    const chosen = JSON.parse(interaction.values[0]);
                    cleanTag = chosen.tag;
                    playerName = chosen.name;
                    await interaction.deferUpdate();
                    prompt.delete().catch(() => { });
                    runCheck(cleanTag, playerName, targetUser, message, clanroles, context);
                });

                collector.on("end", collected => {
                    if (collected.size === 0) {
                        prompt.edit({ content: "❌ You didn't choose in time.", components: [] }).catch(() => { });
                    }
                });

                return;
            }
        } else {
            cleanTag = args[0].replace("#", "").toUpperCase();
            try {
                const data = await coc.getPlayer(`#${cleanTag}`);
                playerName = data.name;
            } catch (e) {
                for (const userId in userdata) {
                    const acc = userdata[userId].find(a => a.tag.replace("#", "").toUpperCase() === cleanTag);
                    if (acc) {
                        playerName = acc.name;
                        break;
                    }
                }
            }
        }

        runCheck(cleanTag, playerName, targetUser, message, clanroles, context);
    }
};

async function runCheck(cleanTag, playerName, targetUser, message, clanroles, context) {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, coc, config } = context;
    const GLOBAL_ROLE_ID = config.GLOBAL_ROLE_ID;
    const allowedRoles = [
        ...config.ADMIN_ROLE_IDS,
        ...config.STAFF_ROLE_IDS
    ];

    const cosLink = `https://www.clashofstats.com/players/${cleanTag}/summary`;
    const fwaLink = `https://cc.fwafarm.com/cc_n/member.php?tag=${encodeURIComponent(cleanTag)}`;
    const titleText = playerName ? `${playerName}  #${cleanTag}` : `Player #${cleanTag}`;

    const embed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle(titleText)
        .setDescription(`${cocEmoji} Please confirm base is correct and check CC.`)
        .addFields(
            { name: "Clash of Stats", value: `[View Stats](${cosLink})`, inline: true },
            { name: "FWA Farm Link", value: `[View FWA](${fwaLink})`, inline: true },
            { name: "Actions", value: "⏳ Waiting for confirmation...", inline: false }
        )
        .setFooter({ text: `Please click the ✅ emoji if you are sure.`, iconURL: message.author.displayAvatarURL() });

    const verifyBtn = new ButtonBuilder()
        .setCustomId("cc_verify")
        .setEmoji(tick)
        .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(verifyBtn);

    const sentMessage = await message.channel.send({ embeds: [embed], components: [row] });

    const invokerUserId = message.author.id;
    const filter = (interaction) => interaction.customId === "cc_verify" && !interaction.user.bot;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 60000 });

    collector.on("collect", async (interaction) => {
        const verifier = interaction.user;

        if (verifier.id !== invokerUserId) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setDescription(`I think you can't wait, be calm or I will complaint too dexter 😢`)
                ],
                ephemeral: true
            }).catch(() => {});
            return; // Don't consume the collector
        }

        try {
            const verifierMember = await message.guild.members.fetch(verifier.id);

            if (!allowedRoles.some(r => verifierMember.roles.cache.has(r))) {
                const deniedEmbed = EmbedBuilder.from(embed)
                    .spliceFields(2, 1, { name: "Actions", value: `❌ ${verifier.tag} does not have permission.`, inline: false })
                    .setColor(0xFF0000)
                    .setTimestamp();
                await interaction.update({ embeds: [deniedEmbed], components: [] });
                collector.stop();
                return;
            }
            
            await interaction.deferUpdate();

            let targetMember;
            try {
                targetMember = await message.guild.members.fetch(targetUser.id);
            } catch (err) {
                if (err.code === 10007) {
                    await message.channel.send("❌ Player is not in the server.");
                    return;
                }
                console.error("Member fetch error:", err);
                await message.channel.send("❌ Unexpected error while fetching the player.");
                return;
            }

            const botMember = await message.guild.members.fetchMe();
            if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
                const errorMsg = "❌ Cannot modify user: they have a higher or equal role than the bot.";
                await message.channel.send(errorMsg);

                const embedError = EmbedBuilder.from(embed)
                    .spliceFields(2, 1, { name: "Actions", value: errorMsg, inline: false })
                    .setColor(0xFF0000)
                    .setTimestamp();

                await sentMessage.edit({ embeds: [embedError], components: [] });
                return;
            }

            let playerData;
            let results = [];
            try {
                playerData = await coc.getPlayer(`#${cleanTag}`);
            } catch (error) {
                results.push(`❌ Could not fetch player data for \`#${cleanTag}\`. Make sure the tag is valid Noob.`);
                const errorEmbed = EmbedBuilder.from(embed)
                    .spliceFields(2, 1, { name: "Actions", value: results.join("\n"), inline: false })
                    .setColor(0xFF0000)
                    .setTimestamp();
                await sentMessage.edit({ embeds: [errorEmbed], components: [] });
                collector.stop();
                return;
            }

            if (!playerData.clan) {
                results.push("⚠ Player is not in any clan.");
            } else {
                const clanTag = playerData.clan.tag;
                const clanInfo = clanroles[clanTag];
                if (clanInfo) {
                    const role = message.guild.roles.cache.get(clanInfo.roleId);
                    if (role) {
                        await targetMember.roles.add(role)
                            .then(() => results.push(`${tickEmoji} Added role **${role.name}**.`))
                            .catch(() => results.push("⚠️ Failed to add clan role."));
                    } else {
                        results.push("⚠️ Clan role not found.");
                    }
                    
                    if ((playerData.role === 'coLeader' || playerData.role === 'leader') && clanInfo.leaderRoleId) {
                        const leaderRole = message.guild.roles.cache.get(clanInfo.leaderRoleId);
                        if (leaderRole) {
                            await targetMember.roles.add(leaderRole)
                                .then(() => results.push(`${tickEmoji} Added role **${leaderRole.name}**.`))
                                .catch(() => results.push("⚠️ Failed to add leader role."));
                        }
                    }
                } else {
                    results.push("⚠️ Clan is not registered.");
                }
            }

            if (targetMember.roles.cache.has(GLOBAL_ROLE_ID)) {
                await targetMember.roles.remove(GLOBAL_ROLE_ID)
                    .then(() => results.push(`${tickEmoji} Removed Global role.`))
                    .catch(() => results.push("⚠️ Could not remove Global role."));
            }

            const REAPPLY_ROLE_ID = config.REAPPLY_ROLE_ID || "1523186839509401701";
            if (targetMember.roles.cache.has(REAPPLY_ROLE_ID)) {
                await targetMember.roles.remove(REAPPLY_ROLE_ID)
                    .then(() => results.push(`${tickEmoji} Removed Re-Apply role.`))
                    .catch(() => results.push("⚠️ Could not remove Re-Apply role."));
            }

            await targetMember.setNickname(`BLOOD | ${playerName || targetMember.user.username}`)
                .then(() => results.push(`${tickEmoji} Nickname updated.`))
                .catch(err => {
                    if (err.code === 50013) {
                        results.push("⚠️ Missing Permissions to change nickname.");
                    } else {
                        results.push(`⚠️ Could not change nickname: ${err.message}`);
                    }
                    console.error("Nickname error:", err);
                });

            results.push(`${tickEmoji} Verified by ${verifier.tag}`);

            const updatedEmbed = EmbedBuilder.from(embed)
                .spliceFields(2, 1, { name: "Actions", value: results.join("\n"), inline: false })
                .setColor(getRandomColor())
                .setTimestamp();

            await sentMessage.edit({ embeds: [updatedEmbed], components: [] });
            collector.stop('verified');
        } catch (err) {
            console.error(err);
        }
    });

    collector.on("end", (collected, reason) => {
        if (reason !== 'verified') {
            const expiredEmbed = EmbedBuilder.from(embed)
                .spliceFields(2, 1, { name: "Actions", value: "⌛ Timed out without confirmation.", inline: false })
                .setColor(getRandomColor())
                .setTimestamp();
            sentMessage.edit({ embeds: [expiredEmbed], components: [] }).catch(() => { });
        }
    });
}