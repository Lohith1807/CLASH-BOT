



function buildEmbed(EmbedBuilder, title, description, color = 0x2ecc71) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

module.exports = {
    name: "linkcheck",
    description: "Show linked members, unlinked members, and linked users not in server",

    async execute(message, args, context) {
        const { EmbedBuilder, data: dataManager, config, emoji: emojiUtils, client } = context;
        const ALLOWED_ROLES = config.ADMIN_ROLE_IDS;
        const ALLOWED_CATEGORIES = config.ADMIN_CATEGORY_ID ? [config.ADMIN_CATEGORY_ID] : [];
        if (message.deletable) message.delete().catch(() => { });

        const { PermissionFlagsBits } = require('discord.js');
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        const hasAllowedRole = message.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        if (!isAdmin && !hasAllowedRole) {
            const embed = buildEmbed(
                EmbedBuilder,
                "🚫 Access Denied",
                "You do not have permission to use this command.",
                0xe74c3c
            );
            return message.channel.send({ embeds: [embed] });
        }

        const inAllowedCategory = message.channel.parentId && ALLOWED_CATEGORIES.includes(message.channel.parentId);
        if (!isAdmin && !inAllowedCategory) {
            const embed = buildEmbed(
                EmbedBuilder,
                "🚫 Wrong Category",
                "You can only use this command in the designated admin categories.",
                0xe74c3c
            );
            return message.channel.send({ embeds: [embed] });
        }

        const loadingEmbed = buildEmbed(
            EmbedBuilder,
            "⏳ Link Check Progress",
            "⏳ Fetching all server members...",
            0x3498db
        );
        const loadingMsg = await message.channel.send({ embeds: [loadingEmbed] });

        const updateProgress = async (text) => {
            const embed = buildEmbed(EmbedBuilder, "⏳ Link Check Progress", text, 0x3498db);
            await loadingMsg.edit({ embeds: [embed] }).catch(() => {});
        };

        const userData = dataManager.getUserData();
        const linkedUserIds = new Set(Object.keys(userData));
        
        const tickbox = emojiUtils.getEmoji("tickbox") || "✅";
        const wrongbox = emojiUtils.getEmoji("wrongbox") || "❌";

        try {
            const { Collection } = require('discord.js');
            const allMembers = new Collection();
            let lastId = '0';
            while (true) {
                await updateProgress(`⏳ Fetching server members... (Loaded: ${allMembers.size})`);
                const members = await message.guild.members.fetch({ limit: 1000, after: lastId });
                if (members.size === 0) break;
                for (const [id, member] of members) {
                    allMembers.set(id, member);
                }
                if (members.size < 1000) break;
                const keys = Array.from(members.keys());
                lastId = keys[keys.length - 1];
            }

            await updateProgress(`✅ Fetched server members.\n⏳ Searching linked/unlinked members...`);

            const linkedMembers = [];
            const notLinkedMembers = [];

            allMembers.forEach(member => {
                if (member.user.bot) return;

                const displayName = member.displayName;
                const userTag = member.user.tag;
                const username = member.user.username;
                const mention = `<@${member.id}>`;
                const nameWithTag = `${displayName} (${mention})`;

                if (linkedUserIds.has(member.id)) {
                    linkedMembers.push(nameWithTag);
                } else {
                    notLinkedMembers.push({ userTag, name: displayName, username });
                }
            });

            await updateProgress(`✅ Fetched server members.\n✅ Scanned linked/unlinked members.\n⏳ Checking for linked members not in server...`);

            const serverMemberIds = new Set(allMembers.map(m => m.id));
            const fetchPromises = [];
            
            for (const id of linkedUserIds) {
                if (!serverMemberIds.has(id)) {
                    const linkedAccounts = userData[id];
                    if (Array.isArray(linkedAccounts) && linkedAccounts.length > 0) {
                        const names = linkedAccounts.map(acc => acc.name).join(", ");
                        fetchPromises.push(
                            client.users.fetch(id)
                                .then(user => `${names} - ${user.username}`)
                                .catch(() => `${names} - Unknown (${id})`)
                        );
                    }
                }
            }
            const linkedButNotInServerList = await Promise.all(fetchPromises);

            await updateProgress(`✅ Fetched server members.\n✅ Scanned linked/unlinked members.\n✅ Checked linked members not in server.\n🎉 Search completed! Sending data...`);

            async function sendEmbedChunks(title, array, color, prefix = "- ", header = "") {
                const chunks = [];
                const itemCounts = [];
                let currentChunk = header;
                let currentCount = 0;

                for (const item of array) {
                    const line = `${prefix}${item}\n`;
                    if (currentChunk.length + line.length > 3000) {
                        chunks.push(currentChunk);
                        itemCounts.push(currentCount);
                        currentChunk = header + line;
                        currentCount = 1;
                    } else {
                        currentChunk += line;
                        currentCount++;
                    }
                }
                if (currentChunk && currentChunk !== header) {
                    chunks.push(currentChunk);
                    itemCounts.push(currentCount);
                }

                const totalItems = array.length;

                for (let i = 0; i < chunks.length; i++) {
                    const pageTitle = chunks.length > 1 ? `${title} (Part ${i + 1}/${chunks.length})` : title;
                    const footerText = `Total: ${totalItems} members`;

                    const embed = new EmbedBuilder()
                        .setTitle(pageTitle)
                        .setDescription(chunks[i])
                        .setColor(color)
                        .setFooter({ text: footerText })
                        .setTimestamp();
                    await message.channel.send({ embeds: [embed] });
                }
            }

            if (notLinkedMembers.length === 0) {
                await message.channel.send("🎉 All server members are linked!");
            } else {
                const discordEmoji = client.emojis.cache.find(e => e.name.toLowerCase() === 'discord') || "💬";
                const headerText = `${wrongbox} **Non Linked members in alliance**\n\n${discordEmoji} Name - **Discord User**\n`;

                const formattedNotLinkedLines = notLinkedMembers.map(m => {
                    const cleanName = m.name.replace(/`/g, "'");
                    const userDisplay = m.userTag === m.username ? `@${m.userTag}` : `@${m.userTag} (${m.username})`;
                    return `${wrongbox} ${cleanName} - ${userDisplay}`;
                });

                await sendEmbedChunks("Non Linked members in alliance", formattedNotLinkedLines, 0xe74c3c, "", headerText);
            }

            if (linkedButNotInServerList.length === 0) {
                await message.channel.send("⚠️ No linked members are missing from the server.");
            } else {
                await sendEmbedChunks("⚠️ Linked but not in alliance", linkedButNotInServerList, 0xf1c40f, "- ");
            }

            const summaryEmbed = new EmbedBuilder()
                .setTitle("📊 Link Status Summary")
                .setColor(0x2ecc71)
                .addFields(
                    { name: `${tickbox} Total Linked Members`, value: `${linkedMembers.length}`, inline: true },
                    { name: `${wrongbox} Total Unlinked Members`, value: `${notLinkedMembers.length}`, inline: true },
                    { name: "⚠️ Linked but not in Server", value: `${linkedButNotInServerList.length}`, inline: true }
                )
                .setFooter({
                    text: `Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setTimestamp();

            await message.channel.send({ embeds: [summaryEmbed] });
        } catch (error) {
            console.error("Error fetching members:", error);
            await loadingMsg.delete().catch(() => { });
            const errorEmbed = buildEmbed(
                EmbedBuilder,
                "❌ Error",
                "Failed to fetch all members. Please ensure I have the `GUILD_MEMBERS` intent and proper permissions.",
                0xe74c3c
            );
            await message.channel.send({ embeds: [errorEmbed] });
        }
    }
};
