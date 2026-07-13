const { EmbedBuilder } = require("discord.js");
const { getEmoji } = require("./emoji.js");

module.exports = {
    startWelcomeManager(client, tools) {
        const dataManager = tools.data;
        const coc = tools.coc;
        client.on("guildMemberUpdate", async (oldMember, newMember) => {
            // Find added roles
            const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            if (addedRoles.size === 0) return;

            const clanRoles = dataManager.getClanRoles();
            
            for (const [roleId, role] of addedRoles) {
                // Check if this role is a clan member role
                const clanEntry = Object.entries(clanRoles).find(([tag, data]) => data.roleId === roleId);
                
                if (clanEntry) {
                    const [clanTag, clanData] = clanEntry;
                    
                    // Only proceed if welcome messages are enabled
                    if (clanData.welcomeMessage) {
                        try {
                            const channel = await client.channels.fetch(clanData.channelId).catch(() => null);
                            if (!channel) continue;

                            const clanName = clanData.nickName || clanTag;
                            // Attempt to get a clan badge emoji using nickName
                            const badgeEmoji = (clanData.nickName && getEmoji(clanData.nickName.toLowerCase())) || "🛡️";
                            const blueDot = getEmoji("lightbluedot") || "🔹";

                            // Fetch clan info from CoC API for a premium look (badge and real name)
                            let badgeUrl = null;
                            let cocClanName = clanName; // Fallback to nickName if API fails
                            try {
                                const clanInfo = await coc.getClan(clanTag);
                                if (clanInfo) {
                                    cocClanName = clanInfo.name;
                                    if (clanInfo.badgeUrls && clanInfo.badgeUrls.small) {
                                        badgeUrl = clanInfo.badgeUrls.small;
                                    }
                                }
                            } catch (e) {
                                // Ignore coc api errors
                            }

                            const embed = new EmbedBuilder()
                                .setTitle(`Welcome to ${cocClanName}!`)
                                .setColor(0x2ecc71)
                                .setDescription(
                                    `We're thrilled to have you as part of the clan!\n\n` +
                                    `${blueDot} Make sure follow mails from <#${clanData.mailChannelId}>\n\n` +
                                    `${blueDot} Use war attacks properly. If matched against a Black listed clan,\n⠀⠀⠀follow leaders and co-leaders instructions\n\n` +
                                    `${blueDot} Be active in clan games and capital raids\n\n` +
                                    `${blueDot} Be respectful to each other`
                                )
                                .setFooter({ text: "Welcome to Blood Family ❤️" })
                                .setTimestamp();

                            if (badgeUrl) {
                                embed.setThumbnail(badgeUrl);
                            }

                            await channel.send({
                                content: `<@${newMember.id}> Hey Welcome to Part of Blood Alliance`,
                                embeds: [embed]
                            });

                        } catch (error) {
                            console.error(`Error sending welcome message for clan ${clanTag}:`, error);
                        }
                    }
                }
            }
        });
    }
};
