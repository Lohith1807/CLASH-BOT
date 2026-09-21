require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error("Bot is not in any guild.");
        process.exit(1);
    }

    console.log(`Processing roles in guild: ${guild.name}`);

    const clanrolePath = path.join(__dirname, "data", "clanrole.json");
    if (!fs.existsSync(clanrolePath)) {
        console.error("clanrole.json not found.");
        process.exit(1);
    }

    const clanroles = JSON.parse(fs.readFileSync(clanrolePath, "utf-8"));

    const leaderIconPath = path.join(__dirname, "assets", "leader.png");
    const memberIconPath = path.join(__dirname, "assets", "member.png");

    const canAddRoleIcon = Boolean(guild.features && guild.features.includes("ROLE_ICONS"));

    const editRoleSafely = async (role, options) => {
        const editOptions = { ...options };
        if (!canAddRoleIcon && editOptions.icon) {
            delete editOptions.icon;
        }
        try {
            return await role.edit(editOptions);
        } catch (err) {
            if (editOptions.icon) {
                console.warn(`Failed to set icon on role ${role.id}, retrying without icon: ${err.message}`);
                delete editOptions.icon;
                return await role.edit(editOptions);
            }
            throw err;
        }
    };

    let updatedCount = 0;

    for (const [clanTag, data] of Object.entries(clanroles)) {
        console.log(`Processing clan ${clanTag}...`);

        if (data.leaderRoleId) {
            try {
                const leaderRole = await guild.roles.fetch(data.leaderRoleId).catch(() => null);
                if (leaderRole) {
                    let editOptions = {
                        colors: 0xfd0303,
                        hoist: true
                    };
                    if (canAddRoleIcon && fs.existsSync(leaderIconPath)) {
                        editOptions.icon = leaderIconPath;
                    }
                    await editRoleSafely(leaderRole, editOptions);
                    console.log(` ✅ Updated Leader Role for ${clanTag}`);
                }
            } catch (err) {
                console.error(` ❌ Failed to update leader role for ${clanTag}:`, err.message);
            }
        }

        if (data.roleId) {
            try {
                const memberRole = await guild.roles.fetch(data.roleId).catch(() => null);
                if (memberRole) {
                    let editOptions = {
                        colors: 0xe99898,
                        hoist: true
                    };
                    if (canAddRoleIcon && fs.existsSync(memberIconPath)) {
                        editOptions.icon = memberIconPath;
                    }
                    await editRoleSafely(memberRole, editOptions);
                    console.log(` ✅ Updated Member Role for ${clanTag}`);
                }
            } catch (err) {
                console.error(` ❌ Failed to update member role for ${clanTag}:`, err.message);
            }
        }
        
        updatedCount++;
    }

    console.log(`\nDone processing ${updatedCount} clans.`);
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
