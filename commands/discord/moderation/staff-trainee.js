const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    UserSelectMenuBuilder
} = require('discord.js');
const { getEmoji } = require('../../../utils/emoji.js');

const POSITIONS = [
    'Admin',
    'Co Admin',
    'Server Moderator',
    'Executive Staff',
    'CWL Staff',
    'Server HR',
    'Welcomer And Assistance Executive'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff-trainee')
        .setDescription('Manage trainee staff members')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Choose an action')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove/Update', value: 'update_remove' },
                    { name: 'List', value: 'list' }
                )
        ),

    async execute(interaction, context) {
        const { data: dataManager, config } = context;
        const action = interaction.options.getString('action');

        // Permission setup
        const adminRoles = config.ADMIN_ROLE_IDS || [];
        const staffRoles = config.STAFF_ROLE_IDS || [];
        const allStaffRoles = config.ALL_STAFF_ROLE_IDS || [];

        // Manage perms: Admins, Server Moderator (index 0)
        const manageRoles = [
            ...adminRoles,
            ...(staffRoles.length > 0 ? [staffRoles[0]] : [])
        ].filter(Boolean);

        // List perms: Everyone above + all other staff roles + ALL_STAFF_ROLE
        const listRoles = [
            ...adminRoles,
            ...staffRoles,
            ...allStaffRoles
        ].filter(Boolean);

        const canManage = interaction.member.roles.cache.some(r => manageRoles.includes(r.id));
        const canList = interaction.member.roles.cache.some(r => listRoles.includes(r.id));

        if (action === 'add' || action === 'update_remove') {
            if (!canManage) {
                return interaction.reply({
                    content: `${getEmoji('tickred')} You do not have permission to manage trainee staff. (Requires Admin or Server Moderator role)`,
                    ephemeral: true
                });
            }
            if (action === 'add') await handleAdd(interaction, context);
            else await handleUpdateRemove(interaction, context);
        } else if (action === 'list') {
            if (!canList) {
                return interaction.reply({
                    content: `${getEmoji('tickred')} You do not have permission to view the trainee list.`,
                    ephemeral: true
                });
            }
            await handleList(interaction, context);
        }
    }
};

// ─── ADD FLOW ───────────────────────────────────────────────────────────────

async function handleAdd(interaction, context) {
    const { data: dataManager, config } = context;

    // Step 1: Select a Trainer
    const trainerSelect = new UserSelectMenuBuilder()
        .setCustomId(`staff_trainee_add_trainer_${interaction.user.id}`)
        .setPlaceholder('Select the Trainer');

    const row = new ActionRowBuilder().addComponents(trainerSelect);

    await interaction.reply({
        content: `${getEmoji('bluedot')} **Step 1/3:** Select the Trainer to train the new staff member.`,
        components: [row],
        ephemeral: true
    });

    const clientRef = interaction.client;
    const userId = interaction.user.id;

    const handleTrainerSelect = async (i) => {
        if (!i.isUserSelectMenu()) return;
        if (i.customId !== `staff_trainee_add_trainer_${userId}`) return;
        if (i.user.id !== userId) return;

        clientRef.removeListener('interactionCreate', handleTrainerSelect);
        clearTimeout(trainerTimeout);

        try { await i.deferUpdate(); } catch (e) { return; }

        const trainerId = i.values[0];
        const trainerMember = await interaction.guild.members.fetch(trainerId).catch(() => null);

        // Check if Trainer has mod, t-mod, admin roles
        const adminRoles = config.ADMIN_ROLE_IDS || [];
        const staffRoles = config.STAFF_ROLE_IDS || [];
        const trainerRoles = [
            ...adminRoles,
            ...(staffRoles.length > 0 ? [staffRoles[0]] : []),
            ...(staffRoles.length > 1 ? [staffRoles[1]] : [])
        ].filter(Boolean);

        const isTrainer = trainerMember && trainerMember.roles.cache.some(r => trainerRoles.includes(r.id));

        if (!isTrainer) {
            return i.editReply({
                content: `${getEmoji('tickred')} The selected user is not a trainer. (Requires Admin, Server Moderator, or T-Moderator role)`,
                components: []
            });
        }

        // Step 2: Select a Trainee
        const traineeSelect = new UserSelectMenuBuilder()
            .setCustomId(`staff_trainee_add_trainee_${userId}`)
            .setPlaceholder('Select the Trainee');

        const traineeRow = new ActionRowBuilder().addComponents(traineeSelect);

        await i.editReply({
            content: `${getEmoji('bluedot')} **Step 2/3:** Trainer: <@${trainerId}>\n${getEmoji('arrow')} Now select the Trainee.`,
            components: [traineeRow]
        });

        const handleTraineeSelect = async (ti) => {
            if (!ti.isUserSelectMenu()) return;
            if (ti.customId !== `staff_trainee_add_trainee_${userId}`) return;
            if (ti.user.id !== userId) return;

            clientRef.removeListener('interactionCreate', handleTraineeSelect);
            clearTimeout(traineeTimeout);

            try { await ti.deferUpdate(); } catch (e) { return; }

            const traineeId = ti.values[0];
            const traineeUser = await clientRef.users.fetch(traineeId).catch(() => null);

            if (!traineeUser) {
                return ti.editReply({ content: `${getEmoji('tickred')} Could not find that trainee.`, components: [] });
            }

            // Step 3: Select roles/positions
            const positionOptions = POSITIONS.map(pos => ({
                label: pos,
                value: pos
            }));

            const posSelect = new StringSelectMenuBuilder()
                .setCustomId(`staff_trainee_add_roles_${userId}`)
                .setPlaceholder('Select trainee roles/positions (multi-select)')
                .setMinValues(1)
                .setMaxValues(POSITIONS.length)
                .addOptions(positionOptions);

            const posRow = new ActionRowBuilder().addComponents(posSelect);

            await ti.editReply({
                content: `${getEmoji('bluedot')} **Step 3/3:** Trainer: <@${trainerId}> ${getEmoji('chain')} Trainee: <@${traineeId}>\n${getEmoji('arrow')} Select the roles/positions for the trainee.`,
                components: [posRow]
            });

            const handleRolesSelect = async (ri) => {
                if (!ri.isStringSelectMenu()) return;
                if (ri.customId !== `staff_trainee_add_roles_${userId}`) return;
                if (ri.user.id !== userId) return;

                clientRef.removeListener('interactionCreate', handleRolesSelect);
                clearTimeout(rolesTimeout);

                try { await ri.deferUpdate(); } catch (e) { return; }

                const selectedRoles = ri.values;

                // Save trainee to stafftrainees.json
                const traineeData = dataManager.getStaffTrainees();
                if (!traineeData[trainerId]) {
                    traineeData[trainerId] = [];
                }

                // Check if trainee is already under this trainer
                const alreadyAssigned = traineeData[trainerId].some(t => t.traineeId === traineeId);
                if (alreadyAssigned) {
                    return ri.editReply({
                        content: `${getEmoji('tickred')} <@${traineeId}> is already assigned as a trainee under <@${trainerId}>.`,
                        components: []
                    });
                }

                traineeData[trainerId].push({
                    traineeId: traineeId,
                    roles: selectedRoles,
                    addedBy: userId,
                    addedAt: new Date().toISOString()
                });

                dataManager.saveStaffTrainees(traineeData);

                // Assign trial staff role to the trainee
                const traineeMemberObj = await interaction.guild.members.fetch(traineeId).catch(() => null);
                let roleAdded = false;
                const traineeRoleId = config.TRAINEE_ROLE_ID || '1514536928412827758';
                if (traineeMemberObj) {
                    try {
                        await traineeMemberObj.roles.add(traineeRoleId);
                        roleAdded = true;
                    } catch (roleErr) {
                        console.error("Failed to assign trainee role:", roleErr);
                    }
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle(`${getEmoji('gtick')} Trainee Staff Added`)
                    .setColor('#2ECC71')
                    .setDescription(
                        `${getEmoji('bluedot')} **Trainee:** <@${traineeId}>\n` +
                        `${getEmoji('pinkdot')} **Trainer:** <@${trainerId}>\n` +
                        `${getEmoji('orangedot')} **Roles/Positions:** ${selectedRoles.join(', ')}\n` +
                        `${getEmoji('orangedot')} **Role Assigned:** ${roleAdded ? `<@&${traineeRoleId}>` : `${getEmoji('tickred')} Failed to assign role`}\n` +
                        `${getEmoji('cyandot')} **Assigned by:** <@${userId}>`
                    )
                    .setFooter({ text: '✅ Trainee Management System' })
                    .setTimestamp();

                await ri.editReply({ content: null, embeds: [successEmbed], components: [] });

                if (config.LOG_CHANNEL_ID) {
                    const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                }
            };

            clientRef.on('interactionCreate', handleRolesSelect);
            const rolesTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleRolesSelect);
            }, 300000);
        };

        clientRef.on('interactionCreate', handleTraineeSelect);
        const traineeTimeout = setTimeout(() => {
            clientRef.removeListener('interactionCreate', handleTraineeSelect);
        }, 300000);
    };

    clientRef.on('interactionCreate', handleTrainerSelect);
    const trainerTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleTrainerSelect);
    }, 300000);
}

// ─── REMOVE / UPDATE FLOW ───────────────────────────────────────────────────

async function handleUpdateRemove(interaction, context) {
    const { data: dataManager, config } = context;
    const traineeData = dataManager.getStaffTrainees();

    const trainersWithTrainees = Object.keys(traineeData).filter(trainerId => traineeData[trainerId] && traineeData[trainerId].length > 0);

    if (trainersWithTrainees.length === 0) {
        return interaction.reply({ content: `${getEmoji('tickred')} No trainee staff members have been added yet.`, ephemeral: true });
    }

    const clientRef = interaction.client;
    const userId = interaction.user.id;

    // Fetch trainer usernames for a nice label
    const trainerOptions = [];
    for (const trainerId of trainersWithTrainees) {
        const userObj = await clientRef.users.fetch(trainerId).catch(() => null);
        const name = userObj ? userObj.username : trainerId;
        trainerOptions.push({
            label: name,
            value: trainerId,
            description: `${traineeData[trainerId].length} trainee(s)`
        });
    }

    const trainerSelect = new StringSelectMenuBuilder()
        .setCustomId(`staff_trainee_ur_trainer_${userId}`)
        .setPlaceholder('Select a Trainer')
        .addOptions(trainerOptions.slice(0, 25));

    const row = new ActionRowBuilder().addComponents(trainerSelect);

    await interaction.reply({
        content: `${getEmoji('bluedot')} Select the **Trainer** to manage trainees.`,
        components: [row],
        ephemeral: true
    });

    const handleTrainerSelect = async (i) => {
        if (!i.isStringSelectMenu()) return;
        if (i.customId !== `staff_trainee_ur_trainer_${userId}`) return;
        if (i.user.id !== userId) return;

        clientRef.removeListener('interactionCreate', handleTrainerSelect);
        clearTimeout(trainerTimeout);

        try { await i.deferUpdate(); } catch (e) { return; }

        const selectedTrainerId = i.values[0];
        const trainerTrainees = traineeData[selectedTrainerId] || [];

        if (trainerTrainees.length === 0) {
            return i.editReply({ content: `${getEmoji('tickred')} No trainees under this trainer.`, components: [] });
        }

        // Let user select the trainee from list
        const traineeOptions = [];
        for (let idx = 0; idx < trainerTrainees.length; idx++) {
            const t = trainerTrainees[idx];
            const userObj = await clientRef.users.fetch(t.traineeId).catch(() => null);
            const name = userObj ? userObj.username : t.traineeId;
            traineeOptions.push({
                label: `${idx + 1}. ${name}`,
                value: `${idx}`,
                description: `Trainee ID: ${t.traineeId}`
            });
        }

        const traineeSelect = new StringSelectMenuBuilder()
            .setCustomId(`staff_trainee_ur_trainee_${userId}`)
            .setPlaceholder('Select a trainee member')
            .addOptions(traineeOptions.slice(0, 25));

        const traineeRow = new ActionRowBuilder().addComponents(traineeSelect);

        await i.editReply({
            content: `${getEmoji('bluedot')} Trainer: <@${selectedTrainerId}>\n${getEmoji('arrow')} Select the **Trainee** to update/remove.`,
            components: [traineeRow]
        });

        const handleTraineeSelect = async (ti) => {
            if (!ti.isStringSelectMenu()) return;
            if (ti.customId !== `staff_trainee_ur_trainee_${userId}`) return;
            if (ti.user.id !== userId) return;

            clientRef.removeListener('interactionCreate', handleTraineeSelect);
            clearTimeout(traineeTimeout);

            try { await ti.deferUpdate(); } catch (e) { return; }

            const selectedTraineeIdx = parseInt(ti.values[0]);
            const selectedTrainee = trainerTrainees[selectedTraineeIdx];

            // Show details embed and Update / Remove buttons
            await showTraineeManageButtons(ti, selectedTrainerId, selectedTraineeIdx, selectedTrainee, clientRef, userId, context);
        };

        clientRef.on('interactionCreate', handleTraineeSelect);
        const traineeTimeout = setTimeout(() => {
            clientRef.removeListener('interactionCreate', handleTraineeSelect);
        }, 300000);
    };

    clientRef.on('interactionCreate', handleTrainerSelect);
    const trainerTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleTrainerSelect);
    }, 300000);
}

async function showTraineeManageButtons(interaction, trainerId, traineeIdx, traineeInfo, clientRef, userId, context) {
    const { data: dataManager, config } = context;

    const rolesStr = Array.isArray(traineeInfo.roles) ? traineeInfo.roles.join(', ') : 'None';

    const embed = new EmbedBuilder()
        .setTitle(`${getEmoji('sheild')} Trainee Management`)
        .setColor('#3498DB')
        .setDescription(
            `${getEmoji('bluedot')} **Trainee:** <@${traineeInfo.traineeId}>\n` +
            `${getEmoji('pinkdot')} **Trainer:** <@${trainerId}>\n` +
            `${getEmoji('orangedot')} **Roles/Positions:** ${rolesStr}\n` +
            `${getEmoji('cyandot')} **Assigned on:** <t:${Math.floor(new Date(traineeInfo.addedAt).getTime() / 1000)}:R>`
        )
        .setFooter({ text: '📋 Choose Update to replace or Remove to process Trial results' })
        .setTimestamp();

    const updateBtn = new ButtonBuilder()
        .setCustomId(`staff_trainee_btn_update_${userId}`)
        .setLabel('Update')
        .setStyle(ButtonStyle.Primary);

    const removeBtn = new ButtonBuilder()
        .setCustomId(`staff_trainee_btn_remove_${userId}`)
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(updateBtn, removeBtn);

    await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [row]
    });

    const handleButtonInteraction = async (bi) => {
        if (!bi.isButton()) return;
        if (bi.user.id !== userId) return;

        if (bi.customId === `staff_trainee_btn_update_${userId}`) {
            clientRef.removeListener('interactionCreate', handleButtonInteraction);
            clearTimeout(buttonTimeout);
            try { await bi.deferUpdate(); } catch (e) { return; }

            // Show UserSelectMenu to pick replacement trainee
            const replacementSelect = new UserSelectMenuBuilder()
                .setCustomId(`staff_trainee_update_replace_${userId}`)
                .setPlaceholder('Select the replacement trainee');

            const replaceRow = new ActionRowBuilder().addComponents(replacementSelect);

            await bi.editReply({
                content: `${getEmoji('bluedot')} **Replacing trainee:** <@${traineeInfo.traineeId}>\n${getEmoji('arrow')} Select the new member to replace them.`,
                embeds: [],
                components: [replaceRow]
            });

            const handleReplacement = async (ri) => {
                if (!ri.isUserSelectMenu()) return;
                if (ri.customId !== `staff_trainee_update_replace_${userId}`) return;
                if (ri.user.id !== userId) return;

                clientRef.removeListener('interactionCreate', handleReplacement);
                clearTimeout(replaceTimeout);

                try { await ri.deferUpdate(); } catch (e) { return; }

                const newTraineeId = ri.values[0];

                // Refresh data to make sure no concurrency issues
                const freshData = dataManager.getStaffTrainees();
                const freshTrainerTrainees = freshData[trainerId] || [];

                if (traineeIdx >= freshTrainerTrainees.length) {
                    return ri.editReply({ content: `${getEmoji('tickred')} Trainee data changed. Please try again.`, components: [] });
                }

                const oldTraineeId = freshTrainerTrainees[traineeIdx].traineeId;

                // Check if new trainee is already under this trainer
                const alreadyExists = freshTrainerTrainees.some((t, idx) => idx !== traineeIdx && t.traineeId === newTraineeId);
                if (alreadyExists) {
                    return ri.editReply({
                        content: `${getEmoji('tickred')} That member is already being trained by <@${trainerId}>.`,
                        components: []
                    });
                }

                // Remove role from old trainee, assign to new trainee
                const traineeRoleId = config.TRAINEE_ROLE_ID || '1514536928412827758';
                const oldTraineeMember = await interaction.guild.members.fetch(oldTraineeId).catch(() => null);
                if (oldTraineeMember) {
                    await oldTraineeMember.roles.remove(traineeRoleId).catch(() => null);
                }

                const newTraineeMember = await interaction.guild.members.fetch(newTraineeId).catch(() => null);
                let roleAdded = false;
                if (newTraineeMember) {
                    try {
                        await newTraineeMember.roles.add(traineeRoleId);
                        roleAdded = true;
                    } catch (err) {
                        console.error(err);
                    }
                }

                // Update database
                freshTrainerTrainees[traineeIdx].traineeId = newTraineeId;
                freshTrainerTrainees[traineeIdx].addedBy = userId;
                freshTrainerTrainees[traineeIdx].addedAt = new Date().toISOString();
                freshData[trainerId] = freshTrainerTrainees;
                dataManager.saveStaffTrainees(freshData);

                const successEmbed = new EmbedBuilder()
                    .setTitle(`${getEmoji('gtick')} Trainee Replaced`)
                    .setColor('#F39C12')
                    .setDescription(
                        `${getEmoji('pinkdot')} **Trainer:** <@${trainerId}>\n` +
                        `${getEmoji('bluedot')} **Old Trainee:** <@${oldTraineeId}>\n` +
                        `${getEmoji('orangedot')} **New Trainee:** <@${newTraineeId}>\n` +
                        `${getEmoji('cyandot')} **Role Status:** ${roleAdded ? 'Transferred' : `${getEmoji('tickred')} Failed to assign role to new member`}\n` +
                        `${getEmoji('cyandot')} **Updated by:** <@${userId}>`
                    )
                    .setFooter({ text: '✏️ Trainee Management System' })
                    .setTimestamp();

                await ri.editReply({ content: null, embeds: [successEmbed], components: [] });

                if (config.LOG_CHANNEL_ID) {
                    const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        await logChannel.send({ embeds: [successEmbed] }).catch(() => null);
                    }
                }
            };

            clientRef.on('interactionCreate', handleReplacement);
            const replaceTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleReplacement);
            }, 300000);

        } else if (bi.customId === `staff_trainee_btn_remove_${userId}`) {
            clientRef.removeListener('interactionCreate', handleButtonInteraction);
            clearTimeout(buttonTimeout);
            try { await bi.deferUpdate(); } catch (e) { return; }

            // Ask Passed or Failed with 2 buttons
            const passEmojiObj = context.emoji.getEmojiObject('gtick') || '✅';
            const failEmojiObj = context.emoji.getEmojiObject('sleep_coc') || '💤';

            const passedBtn = new ButtonBuilder()
                .setCustomId(`staff_trainee_remove_passed_${userId}`)
                .setLabel('Passed')
                .setEmoji(passEmojiObj)
                .setStyle(ButtonStyle.Success);

            const failedBtn = new ButtonBuilder()
                .setCustomId(`staff_trainee_remove_failed_${userId}`)
                .setLabel('Failed')
                .setEmoji(failEmojiObj)
                .setStyle(ButtonStyle.Danger);

            const resultRow = new ActionRowBuilder().addComponents(passedBtn, failedBtn);

            await bi.editReply({
                content: `${getEmoji('question')} **Trial Evaluation:** Did <@${traineeInfo.traineeId}> pass or fail their trial?`,
                embeds: [],
                components: [resultRow]
            });

            const handleResultInteraction = async (ri) => {
                if (!ri.isButton()) return;
                if (ri.user.id !== userId) return;

                clientRef.removeListener('interactionCreate', handleResultInteraction);
                clearTimeout(resultTimeout);
                try { await ri.deferUpdate(); } catch (e) { return; }

                const isPassed = ri.customId === `staff_trainee_remove_passed_${userId}`;

                // Refresh trainee data to ensure it's still current
                const freshData = dataManager.getStaffTrainees();
                const freshTrainerTrainees = freshData[trainerId] || [];

                // Remove trainee from list
                const tIndex = freshTrainerTrainees.findIndex(t => t.traineeId === traineeInfo.traineeId);
                if (tIndex !== -1) {
                    freshTrainerTrainees.splice(tIndex, 1);
                }
                if (freshTrainerTrainees.length === 0) {
                    delete freshData[trainerId];
                } else {
                    freshData[trainerId] = freshTrainerTrainees;
                }
                dataManager.saveStaffTrainees(freshData);

                const traineeRoleId = config.TRAINEE_ROLE_ID || '1514536928412827758';
                const staffChannelId = config.STAFF_CHANNEL_ID || '1417528968294174740';

                let roleRemoved = false;

                if (isPassed) {
                    // Passed Trial
                    const traineeMember = await interaction.guild.members.fetch(traineeInfo.traineeId).catch(() => null);
                    if (traineeMember) {
                        try {
                            await traineeMember.roles.remove(traineeRoleId);
                            roleRemoved = true;
                        } catch (err) {
                            console.error("Failed to remove trial role on pass:", err);
                        }
                    }

                    // Announcement to staff channel
                    const staffChannel = await clientRef.channels.fetch(staffChannelId).catch(() => null);
                    if (staffChannel) {
                        await staffChannel.send({
                            content: `🎉 **Congratulations <@${traineeInfo.traineeId}>!** You have completed your trial successfully and you are a success as a staff! ${getEmoji('gtick')}`
                        }).catch(() => null);
                    }

                    const finalEmbed = new EmbedBuilder()
                        .setTitle(`${getEmoji('gtick')} Trial Success`)
                        .setColor('#2ECC71')
                        .setDescription(
                            `Successfully processed **Trial Success** for <@${traineeInfo.traineeId}>.\n` +
                            `• Trainer: <@${trainerId}>\n` +
                            `• Trial Staff Role: Removed (${roleRemoved ? 'Success' : `${getEmoji('tickred')} Failed to remove`})\n` +
                            `• Announcement: Sent to <#${staffChannelId}>\n` +
                            `• Database: Removed from Trainees list`
                        )
                        .setTimestamp();

                    await ri.editReply({ content: null, embeds: [finalEmbed], components: [] });

                    if (config.LOG_CHANNEL_ID) {
                        const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                        if (logChannel) {
                            await logChannel.send({ embeds: [finalEmbed] }).catch(() => null);
                        }
                    }

                } else {
                    // Failed Trial
                    const staffChannel = await clientRef.channels.fetch(staffChannelId).catch(() => null);
                    if (staffChannel) {
                        await staffChannel.send({
                            content: `❌ **Trial Update:** Sorry <@${traineeInfo.traineeId}>, you are unfit and you still need training. ${getEmoji('sleep_coc')}`
                        }).catch(() => null);
                    }

                    const finalEmbed = new EmbedBuilder()
                        .setTitle(`${getEmoji('sleep_coc')} Trial Failed`)
                        .setColor('#E74C3C')
                        .setDescription(
                            `Processed **Trial Failed** for <@${traineeInfo.traineeId}>.\n` +
                            `• Trainer: <@${trainerId}>\n` +
                            `• Announcement: Sent to <#${staffChannelId}>\n` +
                            `• Database: Removed from Trainees list`
                        )
                        .setTimestamp();

                    await ri.editReply({ content: null, embeds: [finalEmbed], components: [] });

                    if (config.LOG_CHANNEL_ID) {
                        const logChannel = await clientRef.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
                        if (logChannel) {
                            await logChannel.send({ embeds: [finalEmbed] }).catch(() => null);
                        }
                    }
                }
            };

            clientRef.on('interactionCreate', handleResultInteraction);
            const resultTimeout = setTimeout(() => {
                clientRef.removeListener('interactionCreate', handleResultInteraction);
            }, 300000);
        }
    };

    clientRef.on('interactionCreate', handleButtonInteraction);
    const buttonTimeout = setTimeout(() => {
        clientRef.removeListener('interactionCreate', handleButtonInteraction);
    }, 300000);
}

// ─── LIST FLOW ──────────────────────────────────────────────────────────────

async function handleList(interaction, context) {
    const { data: dataManager, config } = context;
    const traineeData = dataManager.getStaffTrainees();

    try {
        await interaction.deferReply({ ephemeral: false });
    } catch (e) {
        return;
    }

    const trainers = Object.keys(traineeData).filter(trainerId => traineeData[trainerId] && traineeData[trainerId].length > 0);

    if (trainers.length === 0) {
        return interaction.editReply({ content: `${getEmoji('tickred')} No active trainees in training.` });
    }

    const embeds = [];
    const clientRef = interaction.client;

    for (const trainerId of trainers) {
        const trainees = traineeData[trainerId] || [];
        
        let traineesDesc = '';
        for (const t of trainees) {
            const rolesStr = Array.isArray(t.roles) ? t.roles.join(', ') : 'None';
            traineesDesc += `${getEmoji('rarroww')} <@${t.traineeId}> — **Roles:** ${rolesStr} (Added <t:${Math.floor(new Date(t.addedAt).getTime() / 1000)}:R> by <@${t.addedBy}>)\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`${getEmoji('sheild')} Trainer: ${trainerId}`)
            .setColor('#3498DB')
            .setDescription(
                `${getEmoji('bluedot')} **Trainee Count:** ${trainees.length}\n` +
                traineesDesc
            )
            .setTimestamp();
        
        const trainerUser = await clientRef.users.fetch(trainerId).catch(() => null);
        if (trainerUser) {
            embed.setTitle(`${getEmoji('sheild')} Trainer: ${trainerUser.username}`);
            embed.setThumbnail(trainerUser.displayAvatarURL({ dynamic: true }));
        }

        embeds.push(embed);
    }

    // Add Trainer Summary
    const uniqueTrainees = new Set();
    for (const trainees of Object.values(traineeData)) {
        for (const t of trainees) {
            uniqueTrainees.add(t.traineeId);
        }
    }

    // Find trainers who don't have trainees.
    const adminRoles = config.ADMIN_ROLE_IDS || [];
    const staffRoles = config.STAFF_ROLE_IDS || [];
    const trainerRoleIds = [
        ...adminRoles,
        ...(staffRoles.length > 0 ? [staffRoles[0]] : []),
        ...(staffRoles.length > 1 ? [staffRoles[1]] : [])
    ].filter(Boolean);

    const guild = interaction.guild;
    let members = null;

    try {
        const activeTrainerRoleIds = trainerRoleIds.filter(id => guild.roles.cache.has(id));
        if (activeTrainerRoleIds.length > 0) {
            members = await guild.members.fetch({ roles: activeTrainerRoleIds });
        }
    } catch (err) {
        console.error("Error fetching trainer members by roles:", err);
    }
    
    let noTraineeTrainersDesc = '';
    let noTraineeCount = 0;

    if (members && members.size > 0) {
        const trainerMembers = members.filter(m => m.roles.cache.some(r => trainerRoleIds.includes(r.id)));
        for (const [mid, member] of trainerMembers) {
            const trainees = traineeData[mid] || [];
            if (trainees.length === 0) {
                noTraineeTrainersDesc += `• <@${mid}> (${member.user.username})\n`;
                noTraineeCount++;
            }
        }
    }

    const summaryEmbed = new EmbedBuilder()
        .setTitle(`${getEmoji('bluestar')} Trainees Summary`)
        .setColor('#9B59B6')
        .setDescription(
            `${getEmoji('mem')} **Total Unique Trainees:** ${uniqueTrainees.size}\n` +
            `${getEmoji('bluedot')} **Active Trainers:** ${trainers.length}`
        )
        .setFooter({ text: '📊 Trainee Overview' })
        .setTimestamp();

    embeds.push(summaryEmbed);

    if (noTraineeCount > 0) {
        const noTraineeEmbed = new EmbedBuilder()
            .setTitle(`${getEmoji('orangedot')} Trainers without Trainees`)
            .setColor('#E67E22')
            .setDescription(noTraineeTrainersDesc.slice(0, 4000) || 'None')
            .setFooter({ text: '🚫 Trainers with no active trainees assigned' })
            .setTimestamp();
        embeds.push(noTraineeEmbed);
    }

    const chunks = [];
    for (let i = 0; i < embeds.length; i += 10) {
        chunks.push(embeds.slice(i, i + 10));
    }

    await interaction.editReply({ embeds: chunks[0] });

    for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ embeds: chunks[i] });
    }
}
