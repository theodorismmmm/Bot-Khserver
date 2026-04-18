require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ApplicationCommandOptionType
} = require('discord.js');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server running'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Settings
const ADMIN_CHANNEL_ID = '1494680168760082453';
const GRANT_MANAGER_ROLE_ID = '1492249936513859636';
const PRO_ROLE_ID = '1493573232383623308';
const CLAIM_SHORTCUT_LINK = process.env.CLAIM_SHORTCUT_LINK || 'https://www.icloud.com/shortcuts/324c1e4c47824fbbbc36c48b0f7143f0';
const DISCORD_SNOWFLAKE_REGEX = /^\d{18,19}$/;
// Project default admin grant manager ID; override via GRANT_MANAGER_USER_IDS in deployment config.
const DEFAULT_GRANT_MANAGER_USER_ID = '1020796397764747287';
const GRANT_MANAGER_USER_IDS = new Set(
    (process.env.GRANT_MANAGER_USER_IDS || DEFAULT_GRANT_MANAGER_USER_ID)
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .filter(id => DISCORD_SNOWFLAKE_REGEX.test(id))
);
if (!process.env.GRANT_MANAGER_USER_IDS) {
    console.warn(`GRANT_MANAGER_USER_IDS is not set; using default grant manager user ID: ${DEFAULT_GRANT_MANAGER_USER_ID}`);
}
const PAYPAL_LINK = 'https://www.paypal.me/transfer959';
const TICKET_CHANNEL_PREFIX = 'ticket-';
const GRANTED_USERS_FILE = path.join(__dirname, 'granted-users.json');
let grantedUsers = new Set();

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await loadGrantedUsers();
    await registerSlashCommands();
});

async function loadGrantedUsers() {
    try {
        const content = await fs.readFile(GRANTED_USERS_FILE, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            grantedUsers = new Set(parsed.map(String).filter(id => DISCORD_SNOWFLAKE_REGEX.test(id)));
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to load granted users:', err);
        }
    }
}

async function saveGrantedUsers() {
    try {
        await fs.writeFile(GRANTED_USERS_FILE, JSON.stringify([...grantedUsers], null, 2));
        return true;
    } catch (err) {
        console.error('Failed to save granted users:', err);
        return false;
    }
}

function hasGrantedAccess(member) {
    return grantedUsers.has(member.id) || (PRO_ROLE_ID && member.roles.cache.has(PRO_ROLE_ID));
}

function canManageGrants(member) {
    return (GRANT_MANAGER_ROLE_ID && member.roles.cache.has(GRANT_MANAGER_ROLE_ID))
        || GRANT_MANAGER_USER_IDS.has(member.id);
}

async function resolveGuildMember(interaction) {
    const member = interaction.member;
    if (member && member.roles && member.roles.cache) {
        return member;
    }
    return interaction.guild.members.fetch(interaction.user.id);
}

async function updateProRoleForUser(guild, targetUserId, action) {
    if (!PRO_ROLE_ID) return '';

    let botMember = guild.members.me;
    if (!botMember) {
        console.warn(`guild.members.me missing in ${guild.name}, fetching bot member...`);
        botMember = await guild.members.fetchMe().catch(() => null);
    }
    if (!botMember || !botMember.permissions.has('ManageRoles')) {
        return '\n⚠️ Access was saved, but the bot lacks Manage Roles permission.';
    }

    const proRole = guild.roles.cache.get(PRO_ROLE_ID) || await guild.roles.fetch(PRO_ROLE_ID).catch(() => null);
    if (!proRole) {
        return '\n⚠️ Access was saved, but the configured Pro role was not found.';
    }

    // Discord requires the bot's highest role to be above the target role to manage it.
    if (botMember.roles.highest.comparePositionTo(proRole) <= 0) {
        return '\n⚠️ Access was saved, but the Pro role is higher than or equal to the bot role.';
    }

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
    if (!targetMember) {
        return '\n⚠️ Access was saved, but user is not currently in this server.';
    }

    if (action === 'add') {
        const roleAdded = await targetMember.roles.add(PRO_ROLE_ID).then(() => true).catch((err) => {
            console.error('Failed to add pro role during /grant:', err);
            return false;
        });
        if (!roleAdded) {
            return '\n⚠️ Access was saved, but role assignment failed.';
        }
    }

    if (action === 'remove') {
        const roleRemoved = await targetMember.roles.remove(PRO_ROLE_ID).then(() => true).catch((err) => {
            console.error('Failed to remove pro role during /removegrant:', err);
            return false;
        });
        if (!roleRemoved) {
            return '\n⚠️ Saved access was removed, but role removal failed.';
        }
    }

    return '';
}

async function registerSlashCommands() {
    try {
        const commandDefinitions = [
            {
                name: 'pay',
                description: 'Restart the payment bot flow in this ticket'
            },
            {
                name: 'grant',
                description: 'Grant KaHack Pro claim access to a user',
                options: [
                    {
                        name: 'user',
                        description: 'User to grant access to',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    }
                ]
            },
            {
                name: 'removegrant',
                description: 'Remove KaHack Pro claim access from a user',
                options: [
                    {
                        name: 'user',
                        description: 'User to remove access from',
                        type: ApplicationCommandOptionType.User,
                        required: true
                    }
                ]
            },
            {
                name: 'claim',
                description: 'Claim your granted KaHack Pro shortcut link'
            }
        ];

        for (const guild of client.guilds.cache.values()) {
            const existingCommands = await guild.commands.fetch();
            for (const definition of commandDefinitions) {
                const existing = existingCommands.find(cmd => cmd.name === definition.name);
                try {
                    if (existing) {
                        await existing.edit(definition);
                    } else {
                        await guild.commands.create(definition);
                    }
                } catch (commandErr) {
                    console.error(`Failed to upsert /${definition.name} in ${guild.name}:`, commandErr);
                }
            }
            console.log(`Upserted slash commands in ${guild.name}`);
        }
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
}

// Auto-trigger when Ticket Tool creates a new channel
client.on('channelCreate', async (channel) => {
    if (!channel.name.startsWith(TICKET_CHANNEL_PREFIX)) return;

    try {
        // Wait 1.5 seconds for Ticket Tool to add the user to the channel
        setTimeout(async () => {
            const members = channel.members.filter(m => !m.user.bot);
            const user = members.first();

            if (user) {
                // 1. Lock the channel so the user cannot type yet
                await channel.permissionOverwrites.edit(user.id, { SendMessages: false });
                // 2. Send the Main Menu
                await sendMainMenu(channel, user);
            }
        }, 1500);
    } catch (err) {
        console.error("Error setting up ticket:", err);
    }
});

// Helper function to send the Main Menu
async function sendMainMenu(channel, user) {
    const embed = new EmbedBuilder()
        .setTitle('Welcome to KaHack Support')
        .setDescription(`Hello <@${user.id}>! Please select an option below.\n\n**KaHack Trial**\n- Limited Features\n- Basic UI\n\n**KaHack Pro (4€)**\n- All Features Unlocked\n- iPad/iPhone Optimized UI\n- Smart Answer Types`)
        .setColor('#7850ff');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`menu_trial_${user.id}`).setLabel('Trial Version').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`menu_pro_${user.id}`).setLabel('Buy Pro').setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
}

// Handle all button clicks and forms
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'pay') {
            if (!interaction.channel || !interaction.channel.name.startsWith(TICKET_CHANNEL_PREFIX)) {
                return interaction.reply({
                    content: 'Use this command inside a ticket channel.',
                    ephemeral: true
                });
            }

            try {
                await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: false });
                await sendMainMenu(interaction.channel, interaction.user);
                await interaction.reply({
                    content: '✅ Bot flow restarted in this ticket.',
                    ephemeral: true
                });
            } catch (err) {
                console.error('Error handling /pay:', err);
                const errorResponse = { content: 'Failed to restart the bot flow.', ephemeral: true };
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(errorResponse).catch((followUpErr) => {
                        console.error('Failed to send /pay follow-up error response:', {
                            originalError: err,
                            followUpError: followUpErr
                        });
                    });
                } else {
                    await interaction.reply(errorResponse).catch((replyErr) => {
                        console.error('Failed to send /pay error response:', {
                            originalError: err,
                            replyError: replyErr
                        });
                    });
                }
            }
            return;
        }

        if (interaction.commandName === 'grant') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }
            if (!GRANT_MANAGER_ROLE_ID && GRANT_MANAGER_USER_IDS.size === 0) {
                return interaction.reply({ content: 'Grant manager access is not configured.', ephemeral: true });
            }

            const invoker = await resolveGuildMember(interaction);
            if (!canManageGrants(invoker)) {
                return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user', true);
            if (targetUser.bot) {
                return interaction.reply({ content: 'You cannot grant access to bots.', ephemeral: true });
            }

            const hadGrantBefore = grantedUsers.has(targetUser.id);
            grantedUsers.add(targetUser.id);
            const saved = await saveGrantedUsers();
            if (!saved) {
                if (!hadGrantBefore) {
                    grantedUsers.delete(targetUser.id);
                }
                return interaction.reply({
                    content: 'Failed to persist grant data. Try again.',
                    ephemeral: true
                });
            }

            const roleNotice = await updateProRoleForUser(interaction.guild, targetUser.id, 'add');

            return interaction.reply({
                content: `✅ Granted KaHack Pro access to <@${targetUser.id}>.${roleNotice}`,
                ephemeral: true
            });
        }

        if (interaction.commandName === 'removegrant') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }
            if (!GRANT_MANAGER_ROLE_ID && GRANT_MANAGER_USER_IDS.size === 0) {
                return interaction.reply({ content: 'Grant manager access is not configured.', ephemeral: true });
            }

            const invoker = await resolveGuildMember(interaction);
            if (!canManageGrants(invoker)) {
                return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user', true);
            const wasGranted = grantedUsers.delete(targetUser.id);
            const saved = await saveGrantedUsers();
            if (!saved) {
                if (wasGranted) {
                    grantedUsers.add(targetUser.id);
                }
                return interaction.reply({
                    content: 'Failed to persist grant data. Try again.',
                    ephemeral: true
                });
            }

            const roleNotice = await updateProRoleForUser(interaction.guild, targetUser.id, 'remove');

            return interaction.reply({
                content: wasGranted
                    ? `✅ Removed KaHack Pro access from <@${targetUser.id}>.${roleNotice}`
                    : `ℹ️ <@${targetUser.id}> did not have saved access.${roleNotice}`,
                ephemeral: true
            });
        }

        if (interaction.commandName === 'claim') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }

            const member = await resolveGuildMember(interaction);
            if (!hasGrantedAccess(member)) {
                return interaction.reply({
                    content: 'You do not have granted access to claim KaHack Pro.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `✅ KaHack Pro shortcut link: ${CLAIM_SHORTCUT_LINK}`,
                ephemeral: true
            });
        }
    }

    if (interaction.isButton()) {
        const [action, type, userId] = interaction.customId.split('_');

        // Only allow the ticket owner to click the buttons
        if (userId && interaction.user.id !== userId) {
            return interaction.reply({ content: 'These buttons are not for you.', ephemeral: true });
        }

        // --- TRIAL FLOW ---
        if (action === 'menu' && type === 'trial') {
            const embed = new EmbedBuilder()
                .setTitle('📜 Terms of Use (Trial)')
                .setDescription('By using the Free Trial, you agree to the following:\n1. You will not abuse or share the trial link.\n2. The trial has limited features.\n3. We can revoke access at any time.')
                .setColor('#ffff00');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trial_accept_${userId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`trial_decline_${userId}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`trial_back_${userId}`).setLabel('Back').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ embeds: [embed], components: [row] });
        }

        if (action === 'trial' && type === 'accept') {
            await interaction.update({ content: '**Thank you!** Here is your Trial Link: `https://your-trial-link.com`', embeds: [], components: [] });
            setTimeout(async () => {
                await interaction.message.delete().catch(() => {});
                await sendMainMenu(interaction.channel, interaction.user);
            }, 3000);
        }

        if (action === 'trial' && type === 'decline') {
            await interaction.reply('You declined the terms. Closing ticket in 5 seconds...');
            setTimeout(() => interaction.channel.delete(), 5000);
        }

        if (action === 'trial' && type === 'back') {
            await interaction.deferUpdate();
            await interaction.message.delete();
            await sendMainMenu(interaction.channel, interaction.user);
        }

        // --- PRO FLOW ---
        if (action === 'menu' && type === 'pro') {
            const embed = new EmbedBuilder()
                .setTitle('📜 Payment Terms of Service')
                .setDescription('Before purchasing KaHack Pro, you must agree:\n1. All sales are final. No refunds.\n2. We are not responsible for any actions taken against your Kahoot account.\n3. Pro access is permanent.')
                .setColor('#ff3366');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pro_accept_${userId}`).setLabel('Accept Terms').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pro_decline_${userId}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
            );

            await interaction.update({ embeds: [embed], components: [row] });
        }

        if (action === 'pro' && type === 'decline') {
            await interaction.deferUpdate();
            await interaction.message.delete();
            await sendMainMenu(interaction.channel, interaction.user);
        }

        if (action === 'pro' && type === 'accept') {
            const embed = new EmbedBuilder()
                .setTitle('🛒 Purchase KaHack Pro')
                .setDescription(`**Price:** 4.00 EUR\n\nPlease select your payment method below. If you pay with PayPal, click the link, send the money, and then click **Already Paid**.`)
                .setColor('#00ff00');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('PayPal').setURL(PAYPAL_LINK).setStyle(ButtonStyle.Link),
                new ButtonBuilder().setCustomId(`pay_amazon_${userId}`).setLabel('Amazon Gift Card').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`pay_done_${userId}`).setLabel('Already Paid').setStyle(ButtonStyle.Success)
            );

            await interaction.update({ embeds: [embed], components: [row] });
        }

        // Amazon Form Popup
        if (action === 'pay' && type === 'amazon') {
            const modal = new ModalBuilder()
                .setCustomId(`amazon_modal_${userId}`)
                .setTitle('Submit Amazon Code');

            const codeInput = new TextInputBuilder()
                .setCustomId('amazonCode')
                .setLabel("Enter your Amazon Gift Card Code:")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
            await interaction.showModal(modal);
        }

        // Already Paid Button
        if (action === 'pay' && type === 'done') {
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true });
            await interaction.update({ content: `✅ **Payment Noted!** <@${interaction.user.id}> The chat has been unlocked.\n\nYou will receive the shortcut within 3 Hours with permanent access. You can leave any questions or payment proof screenshots below.`, embeds: [], components: [] });
        }
    }

    // Handle Amazon Form Submission
    if (interaction.isModalSubmit()) {
        const [action, type, userId] = interaction.customId.split('_');

        if (action === 'amazon' && type === 'modal') {
            const code = interaction.fields.getTextInputValue('amazonCode');

            // Send the Amazon Code to the hidden Admin Channel
            const adminChannel = client.channels.cache.get(ADMIN_CHANNEL_ID);
            if (adminChannel) {
                adminChannel.send(`🚨 **New Amazon Code Received!**\n**User:** <@${interaction.user.id}>\n**Code:** \`${code}\`\n**Ticket:** <#${interaction.channel.id}>`);
            }

            // Unlock chat for user
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true });

            await interaction.reply({ content: `✅ **Code Submitted!** <@${interaction.user.id}> The chat has been unlocked.\n\nYou will receive the shortcut within 3 Hours with permanent access. You can leave any questions below.` });
            await interaction.message.delete();
        }
    }
});

// Start the bot
client.login(process.env.TOKEN);
