const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("clanentry")
        .setDescription("Add or update a clan entry with role, channels, leaders, and type")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName("clantag")
                .setDescription("Clan tag (e.g. #CYQVL002)")
                .setRequired(true)
        )

        .addStringOption(option =>
            option.setName("nickname")
                .setDescription("Short nickname for the clan (e.g. BB, TL)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("clantype")
                .setDescription("Clan type")
                .setRequired(true)
                .addChoices(
                    { name: "FWA", value: "fwa" },
                    { name: "War", value: "war" }
                )
        )
        .addBooleanOption(option =>
            option.setName("autopost")
                .setDescription("Enable automatic recruitment posting?")
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("leader")
                .setDescription("Leader of this clan")
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("coleader1")
                .setDescription("Co-Leader 1")
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("coleader2")
                .setDescription("Co-Leader 2")
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName("coleader3")
                .setDescription("Co-Leader 3")
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName("coleader4")
                .setDescription("Co-Leader 4")
                .setRequired(false)
        ),

    async execute(interaction, context) {
        try {
            const { data: dataManager, config } = context;
            const ALLOWED_ROLES = [...(config.ADMIN_ROLE_IDS || []), ...(config.STAFF_ROLE_IDS || [])];

            if (!interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
                return interaction.reply({ content: "❌ You do not have permission (Staff/Admin) to use this command.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            const botMember = await interaction.guild.members.fetchMe();
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.editReply({ content: "❌ I do not have sufficient permissions (**Manage Roles** and **Manage Channels**) to complete this setup." });
            }

            var clanTag = interaction.options.getString("clantag").toUpperCase();
            if (!clanTag.startsWith("#")) clanTag = "#" + clanTag;


            var nickName = interaction.options.getString("nickname");
            var clanType = interaction.options.getString("clantype");
            var leader = interaction.options.getUser("leader");
            var co1 = interaction.options.getUser("coleader1");
            var co2 = interaction.options.getUser("coleader2") || null;
            var co3 = interaction.options.getUser("coleader3") || null;
            var co4 = interaction.options.getUser("coleader4") || null;
            var autoPost = interaction.options.getBoolean("autopost");

            var clanroles = dataManager.getClanRoles();
            var existing = clanroles[clanTag] || {};

            let officialClanName = nickName; // Fallback to nickname
            try {
                const cocData = await context.coc.getClan(clanTag);
                if (cocData && cocData.name) {
                    officialClanName = cocData.name;
                }
            } catch (err) {
                console.warn(`⚠️ Could not fetch clan data for ${clanTag}:`, err.message);
            }

            var finalType = clanType || existing.clanType || "fwa";

            var leaders = existing.leaders || [];
            if (leader) {
                leaders = ["<@" + leader.id + ">"];
            }

            var coLeaders = existing.coLeaders || [];
            var newCoLeaders = [];
            if (co1) newCoLeaders.push("<@" + co1.id + ">");
            if (co2) newCoLeaders.push("<@" + co2.id + ">");
            if (co3) newCoLeaders.push("<@" + co3.id + ">");
            if (co4) newCoLeaders.push("<@" + co4.id + ">");
            if (newCoLeaders.length > 0) {
                coLeaders = newCoLeaders;
            }

            const statusEmbed = new EmbedBuilder()
                .setTitle("Clan Setup in Progress...")
                .setColor("Blue")
                .setDescription("⏳ **Creating Roles...**")
                .setTimestamp();

            await interaction.editReply({ embeds: [statusEmbed] });

            let finalRoleId, finalChannelId, finalMailChannelId, finalLeadChannelId, finalFeedChannelId;
            let setupWarnings = [];

            let leaderRole = await interaction.guild.roles.create({
                name: `〢・🩸${officialClanName} Leader`,
                color: 0xfd0303,
                reason: `Automated setup for ${clanTag}`
            });

            let memberRole = await interaction.guild.roles.create({
                name: `〢・🩸${officialClanName} Member`,
                color: 0xe99898,
                reason: `Automated setup for ${clanTag}`
            });
            finalRoleId = memberRole.id;

            const assignRoles = async (user) => {
                if (!user) return;
                try {
                    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);
                    if (guildMember) {
                        await guildMember.roles.add(leaderRole).catch(err => {
                            console.warn(`Could not add leader role to ${user.id}:`, err.message);
                            setupWarnings.push(`⚠️ Could not add Leader role to <@${user.id}>`);
                        });
                        await guildMember.roles.add(memberRole).catch(err => {
                            console.warn(`Could not add member role to ${user.id}:`, err.message);
                            setupWarnings.push(`⚠️ Could not add Member role to <@${user.id}>`);
                        });
                    } else {
                        setupWarnings.push(`⚠️ Could not find user <@${user.id}> in the server.`);
                    }
                } catch (err) {
                    console.warn(`Error fetching member ${user.id}:`, err.message);
                    setupWarnings.push(`⚠️ Error processing <@${user.id}>: ${err.message}`);
                }
            };

            await assignRoles(leader);
            if (co1) await assignRoles(co1);
            if (co2) await assignRoles(co2);
            if (co3) await assignRoles(co3);
            if (co4) await assignRoles(co4);

            let roleMsg = "✅ **Roles created successfully.**";
            if (setupWarnings.length > 0) {
                roleMsg += "\n\n**Warnings:**\n" + setupWarnings.join("\n");
            }
            statusEmbed.setDescription(roleMsg + "\n\n⏳ **Creating Category and Channels...**");
            await interaction.editReply({ embeds: [statusEmbed] });

            const overwrites = [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                }
            ];

            const category = await interaction.guild.channels.create({
                name: `╭───𒌋${officialClanName.toUpperCase()} 𒀖`,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwrites
            });

            const leadChan = await interaction.guild.channels.create({
                name: "〢🔱┃𝗟𝗲𝗮𝗱𝗲𝗿-𝗦𝗵𝗶𝗽-𝗖𝗵𝗮𝘁",
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    ...overwrites,
                    {
                        id: leaderRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.MentionEveryone
                        ]
                    }
                ]
            });
            finalLeadChannelId = leadChan.id;

            const mailChan = await interaction.guild.channels.create({
                name: "〢📪┃𝗖𝗹𝗮𝗻-𝗠𝗮𝗶𝗹𝘀",
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    ...overwrites,
                    {
                        id: leaderRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.MentionEveryone
                        ]
                    },
                    {
                        id: memberRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ],
                        deny: [
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageMessages
                        ]
                    }
                ]
            });
            finalMailChannelId = mailChan.id;

            const membersChan = await interaction.guild.channels.create({
                name: "〢🏡┃𝗖𝗹𝗮𝗻-𝗠𝗲𝗺𝗯𝗲𝗿𝘀",
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    ...overwrites,
                    {
                        id: leaderRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.MentionEveryone,
                            PermissionsBitField.Flags.AddReactions
                        ]
                    },
                    {
                        id: memberRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.MentionEveryone,
                            PermissionsBitField.Flags.AddReactions
                        ],
                        deny: [PermissionsBitField.Flags.ManageMessages]
                    }
                ]
            });
            finalChannelId = membersChan.id;

            const feedChan = await interaction.guild.channels.create({
                name: "〢📰┃𝖈𝖑𝖆𝖓-𝖋𝖊𝖊𝖉",
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    ...overwrites,
                    {
                        id: leaderRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.MentionEveryone
                        ]
                    },
                    {
                        id: memberRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ],
                        deny: [
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageMessages
                        ]
                    }
                ]
            });
            finalFeedChannelId = feedChan.id;

            let chanMsg = "✅ **Channels created successfully.**";
            if (setupWarnings.length > 0) {
                chanMsg += "\n\n**Warnings:**\n" + setupWarnings.join("\n");
            }
            statusEmbed.setDescription(chanMsg + "\n\n⏳ **Finalizing setup and saving data...**");
            await interaction.editReply({ embeds: [statusEmbed] });

            clanroles[clanTag] = {
                roleId: finalRoleId,
                leaderRoleId: leaderRole.id,
                channelId: finalChannelId,
                mailChannelId: finalMailChannelId,
                leadChannelId: finalLeadChannelId,
                feedChannelId: finalFeedChannelId,
                clanType: finalType,
                autoPostRecruitment: autoPost
            };

            if (nickName) clanroles[clanTag].nickName = nickName;
            if (leaders.length > 0) clanroles[clanTag].leaders = leaders;
            if (coLeaders.length > 0) clanroles[clanTag].coLeaders = coLeaders;

            dataManager.saveClanRoles(clanroles);

            var desc =
                "✅ Clan **" + clanTag + "** has been registered:\n\n" +
                "• **Member Role:** <@&" + finalRoleId + ">\n" +
                "• **Leader Role:** <@&" + leaderRole.id + ">\n" +
                "• **Channel:** <#" + finalChannelId + ">\n" +
                "• **Mail Channel:** <#" + finalMailChannelId + ">\n" +
                "• **Leadership Chat:** <#" + finalLeadChannelId + ">\n" +
                "• **Clan Feed:** <#" + finalFeedChannelId + ">\n" +
                "• **Clan Type:** " + finalType + "\n" +
                "• **Auto-Post Recruitment:** " + (autoPost ? "✅ Enabled" : "❌ Disabled") + "\n";

            if (nickName) desc += "• **Nickname:** " + nickName + "\n";
            if (leaders.length > 0) desc += "• **Leader:** " + leaders.join(", ") + "\n";
            if (coLeaders.length > 0) desc += "• **Co-Leaders:** " + coLeaders.join(", ") + "\n";

            if (setupWarnings.length > 0) {
                desc += "\n⚠️ **Warnings during setup:**\n" + setupWarnings.join("\n") + "\n";
            }

            var embed = new EmbedBuilder()
                .setTitle("Clan Entry Saved")
                .setColor(0x2ecc71)
                .setDescription(desc)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ Error in clanentry command:", error);
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
