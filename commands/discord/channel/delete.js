const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function parseDMY(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(p => parseInt(p, 10));
    if (!day || !month || !year) return null;
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
}

async function deleteMessagesInBatches(channel, filterFn, limit = null, stopFn = null) {
    let deletedCount = 0;
    let lastId = null;

    while (true) {
        if (limit !== null && deletedCount >= limit) break;

        const fetched = await channel.messages.fetch({ limit: 100, before: lastId });
        if (fetched.size === 0) break;

        let messagesToProcess = Array.from(fetched.values());
        let hitStop = false;

        if (stopFn) {
            const stopIndex = messagesToProcess.findIndex(stopFn);
            if (stopIndex !== -1) {
                messagesToProcess = messagesToProcess.slice(0, stopIndex);
                hitStop = true;
            }
        }

        const filtered = filterFn ? messagesToProcess.filter(filterFn) : messagesToProcess;
        const remaining = limit !== null ? limit - deletedCount : null;
        const messagesToDelete = remaining !== null ? filtered.slice(0, remaining) : filtered;

        if (messagesToDelete.length > 0) {
            const now = Date.now();
            const newerMessages = messagesToDelete.filter(m => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
            const olderMessages = messagesToDelete.filter(m => now - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

            if (newerMessages.length > 0) {
                await channel.bulkDelete(newerMessages, true).catch(() => { });
                deletedCount += newerMessages.length;
            }

            for (const msg of olderMessages) {
                await msg.delete().catch(() => { });
                deletedCount++;
            }
        }

        if (hitStop) break;

        lastId = fetched.last()?.id;
    }

    return deletedCount;
}

module.exports = {
    name: "delete",
    description: "Delete messages by count, date, or user",
    
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete messages by count, date, or user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete or scan (1-1000)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
        )
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Delete messages FROM this date onwards (DD/MM/YYYY)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('on_date')
                .setDescription('Delete messages ON this specified date (DD/MM/YYYY)')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Delete messages only from this user')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('all')
                .setDescription('Delete all messages in the channel')
                .setRequired(false)
        ),

    async run(message, args, { config, client }) {
        try {
            const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
            const ADMIN_ROLE_IDS = config.ADMIN_ROLE_IDS || [];
            const ALLOWED_ROLES = [...STAFF_ROLE_IDS, ...ADMIN_ROLE_IDS];
            
            const isAuthorized = ALLOWED_ROLES.some(roleId => message.member.roles.cache.has(roleId)) || message.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAuthorized) {
                return message.channel.send('❌ You do not have permission to use this command.');
            }

            if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return message.channel.send('❌ You need the **Manage Messages** permission to use this command.');
            }

            if (!args.length) {
                return message.channel.send('❌ Usage:\n`;delete <count>`\n`;delete from DD/MM/YYYY`\n`;delete on DD/MM/YYYY`\n`;delete user <@user/userId> [count]`\n`;delete all`');
            }

            await message.delete().catch(() => { });

            const firstArg = args[0].toLowerCase();

            if (firstArg === 'all') {
                const totalDeleted = await deleteMessagesInBatches(message.channel);
                return message.channel.send(`✅ Deleted **${totalDeleted}** messages from this channel.`);
            }

            if (firstArg === 'from' && args[1]) {
                const dateStr = args[1];
                let fromDate = parseDMY(dateStr);
                if (!fromDate) {
                    return message.channel.send('❌ Invalid date format. Use `DD/MM/YYYY`.');
                }

                const totalDeleted = await deleteMessagesInBatches(message.channel, m => m.createdAt >= fromDate, null, m => m.createdAt < fromDate);
                return message.channel.send(`✅ Deleted **${totalDeleted}** messages from **${dateStr}** onwards.`);
            }

            if (firstArg === 'on' && args[1]) {
                const dateStr = args[1];
                let targetDate = parseDMY(dateStr);
                if (!targetDate) {
                    return message.channel.send('❌ Invalid date format. Use `DD/MM/YYYY`.');
                }

                const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
                const totalDeleted = await deleteMessagesInBatches(message.channel, m => m.createdAt >= targetDate && m.createdAt < nextDay, null, m => m.createdAt < targetDate);
                return message.channel.send(`✅ Deleted **${totalDeleted}** messages created on **${dateStr}**.`);
            }

            if (firstArg === 'user' && args[1]) {
                const userResolvable = args[1];
                const targetId = userResolvable.replace(/[<@!>]/g, '');
                
                const targetUser = message.mentions.users.first() || await client.users.fetch(targetId).catch(() => null);
                if (!targetUser) {
                    return message.channel.send('❌ User not found. Please mention the user or provide a valid user ID.');
                }

                let amount = 100;
                if (args[2] && !isNaN(args[2])) {
                    amount = parseInt(args[2]);
                    if (amount < 1 || amount > 1000) {
                        return message.channel.send('❌ Limit must be between 1 and 1000.');
                    }
                }

                const totalDeleted = await deleteMessagesInBatches(message.channel, m => m.author.id === targetUser.id, amount);
                return message.channel.send(`✅ Deleted **${totalDeleted}** messages from ${targetUser} (scanned up to ${amount}).`);
            }

            // Fallback: If it's a number, delete by count
            if (!isNaN(args[0])) {
                let count = parseInt(args[0]);
                if (count < 1 || count > 1000) {
                    return message.channel.send('❌ Please provide a number between **1** and **1000**.');
                }

                const totalDeleted = await deleteMessagesInBatches(message.channel, null, count);
                return message.channel.send(`✅ Deleted **${totalDeleted}** messages.`);
            }

            return message.channel.send('❌ Usage:\n`;delete <count>`\n`;delete from DD/MM/YYYY`\n`;delete on DD/MM/YYYY`\n`;delete user <@user/userId> [count]`\n`;delete all`');
        } catch (error) {
            console.error('❌ Error in delete command:', error);
            return message.channel.send('⚠️ An error occurred while trying to delete messages. Some messages might not have been deleted.').catch(() => { });
        }
    },

    async execute(interaction, context) {
        const { options, member, channel } = interaction;
        const { config } = context;

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const ADMIN_ROLE_IDS = config.ADMIN_ROLE_IDS || [];
        const ALLOWED_ROLES = [...STAFF_ROLE_IDS, ...ADMIN_ROLE_IDS];

        const isAuthorized = ALLOWED_ROLES.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAuthorized) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ You need the **Manage Messages** permission to use this command.', ephemeral: true });
        }

        const amount = options.getInteger('amount');
        const dateStr = options.getString('date');
        const onDateStr = options.getString('on_date');
        const targetUser = options.getUser('user');
        const deleteAll = options.getBoolean('all');

        if (!amount && !dateStr && !onDateStr && !targetUser && !deleteAll) {
            return interaction.reply({
                content: '❌ Please provide at least one option (amount, date, on_date, user, or all).',
                ephemeral: true
            });
        }

        // If targetUser is selected, open a Modal Form to ask how many messages to delete
        if (targetUser) {
            const modal = new ModalBuilder()
                .setCustomId(`delete_user_modal:${targetUser.id}`)
                .setTitle(`Delete User Messages`);

            const amountInput = new TextInputBuilder()
                .setCustomId('delete_amount_input')
                .setLabel(`Scan/delete count (1-1000):`)
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter message limit to scan (e.g. 100)')
                .setValue(amount ? amount.toString() : '100')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
            modal.addComponents(firstActionRow);

            return interaction.showModal(modal);
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (deleteAll) {
                const totalDeleted = await deleteMessagesInBatches(channel);
                return interaction.editReply({ content: `✅ Deleted **${totalDeleted}** messages from this channel.` });
            }

            if (dateStr) {
                const fromDate = parseDMY(dateStr);
                if (!fromDate) {
                    return interaction.editReply({ content: '❌ Invalid date format for `date`. Use `DD/MM/YYYY`.' });
                }
                const totalDeleted = await deleteMessagesInBatches(channel, m => m.createdAt >= fromDate, null, m => m.createdAt < fromDate);
                return interaction.editReply({ content: `✅ Deleted **${totalDeleted}** messages from **${dateStr}** onwards.` });
            }

            if (onDateStr) {
                const targetDate = parseDMY(onDateStr);
                if (!targetDate) {
                    return interaction.editReply({ content: '❌ Invalid date format for `on_date`. Use `DD/MM/YYYY`.' });
                }
                const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
                const totalDeleted = await deleteMessagesInBatches(channel, m => m.createdAt >= targetDate && m.createdAt < nextDay, null, m => m.createdAt < targetDate);
                return interaction.editReply({ content: `✅ Deleted **${totalDeleted}** messages created on **${onDateStr}**.` });
            }

            if (amount) {
                const totalDeleted = await deleteMessagesInBatches(channel, null, amount);
                return interaction.editReply({ content: `✅ Deleted **${totalDeleted}** messages.` });
            }

        } catch (error) {
            console.error('❌ Error in slash delete command:', error);
            return interaction.editReply({ content: '⚠️ An error occurred while trying to delete messages. Some messages might not have been deleted.' }).catch(() => { });
        }
    },

    async handleModalSubmit(interaction, context, userId) {
        const { member, channel, client } = interaction;
        const { config } = context;

        const STAFF_ROLE_IDS = config.STAFF_ROLE_IDS || [];
        const ADMIN_ROLE_IDS = config.ADMIN_ROLE_IDS || [];
        const ALLOWED_ROLES = [...STAFF_ROLE_IDS, ...ADMIN_ROLE_IDS];

        const isAuthorized = ALLOWED_ROLES.some(id => member.roles.cache.has(id)) || member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAuthorized) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ You need the **Manage Messages** permission to use this command.', ephemeral: true });
        }

        const amountStr = interaction.fields.getTextInputValue('delete_amount_input');
        const amount = parseInt(amountStr.trim(), 10);

        if (isNaN(amount) || amount < 1 || amount > 1000) {
            return interaction.reply({ content: '❌ Please enter a valid number of messages between 1 and 1000.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const targetUser = await client.users.fetch(userId).catch(() => null);
            if (!targetUser) {
                return interaction.editReply({ content: '❌ Target user not found.' });
            }

            const totalDeleted = await deleteMessagesInBatches(channel, m => m.author.id === targetUser.id, amount);
            return interaction.editReply({ content: `✅ Deleted **${totalDeleted}** messages from ${targetUser} (scanned up to ${amount}).` });
        } catch (error) {
            console.error('❌ Error deleting user messages via modal:', error);
            return interaction.editReply({ content: '⚠️ An error occurred while trying to delete messages.' }).catch(() => { });
        }
    }
};
