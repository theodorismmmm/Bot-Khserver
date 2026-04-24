require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ApplicationCommandOptionType,
    REST, Routes
} = require('discord.js');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot is running!'));

// ─── XPay order-confirmation endpoint ────────────────────────────────────────
// Receives order events from the XPay web app and posts a confirmation embed
// into the configured Discord channel (XPAY_CHANNEL_ID).
const XPAY_STATUS_EMOJI   = { pending: '🕐', confirmed: '✅', failed: '❌' };
const XPAY_METHOD_LABELS  = { paypal: 'PayPal', amazon_giftcard: 'Amazon Gift Card' };
const XPAY_STATUS_COLORS  = { confirmed: 0x00ff88, failed: 0xff3355, pending: 0xffcc00 };

function xpaySecretValid(provided, expected) {
    if (!provided || !expected) return false;
    try {
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

app.post('/xpay/order', async (req, res) => {
    const XPAY_SHARED_SECRET = process.env.XPAY_SHARED_SECRET;
    const XPAY_CHANNEL_ID    = process.env.XPAY_CHANNEL_ID;

    // Validate shared secret (x-xpay-signature or Authorization: Bearer)
    const sigHeader  = req.headers['x-xpay-signature'];
    const authHeader = req.headers['authorization'];
    const provided   = sigHeader ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!xpaySecretValid(provided, XPAY_SHARED_SECRET)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
        orderId, country, currency, items,
        subtotal, fee, total,
        paymentMethod, status, timestamp, customerNote
    } = req.body;

    if (!orderId || !currency || total == null || !status || !paymentMethod) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const statusEmoji  = XPAY_STATUS_EMOJI[status]  ?? '❓';
    const methodLabel  = XPAY_METHOD_LABELS[paymentMethod] ?? paymentMethod;
    const statusColor  = XPAY_STATUS_COLORS[status] ?? 0xffcc00;
    const statusLabel  = status.charAt(0).toUpperCase() + status.slice(1);

    const itemLines = Array.isArray(items) && items.length
        ? items.map(i => `\`${i.qty}x\` **${i.name}** — ${currency} ${Number(i.lineTotal).toFixed(2)}`).join('\n')
        : '_No items_';

    const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} Order ${orderId}`)
        .setColor(statusColor)
        .addFields(
            { name: '📦 Items',    value: itemLines },
            {
                name:   '💰 Summary',
                value:  `Subtotal: **${currency} ${Number(subtotal ?? 0).toFixed(2)}**\nFee: **${currency} ${Number(fee ?? 0).toFixed(2)}**\nTotal: **${currency} ${Number(total).toFixed(2)}**`,
                inline: true
            },
            { name: '🌍 Country',  value: country      || 'N/A',      inline: true },
            { name: '💳 Payment',  value: methodLabel,                 inline: true },
            { name: '📊 Status',   value: statusLabel,                 inline: true }
        )
        .setTimestamp(timestamp ? new Date(timestamp) : new Date())
        .setFooter({ text: `Order ID: ${orderId}` });

    if (customerNote) {
        embed.addFields({ name: '📝 Note', value: customerNote });
    }

    if (!XPAY_CHANNEL_ID) {
        return res.status(503).json({ error: 'XPAY_CHANNEL_ID is not configured' });
    }

    try {
        if (!client.isReady()) {
            return res.status(503).json({ error: 'Bot is not ready yet' });
        }
        const channel = client.channels.cache.get(XPAY_CHANNEL_ID);
        if (!channel) {
            return res.status(503).json({ error: 'Target channel not available' });
        }
        await channel.send({ embeds: [embed] });
        res.json({ ok: true, orderId });
    } catch (err) {
        console.error('XPay: failed to post order embed:', err.message);
        res.status(500).json({ error: 'Failed to post message' });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

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
const ANSWERS_CHANNEL_ID = '1495360534650818661';
const GRANT_MANAGER_ROLE_ID = '1492249936513859636';
const PRO_ROLE_ID = '1493573232383623308';
const CLAIM_SHORTCUT_LINK = process.env.CLAIM_SHORTCUT_LINK || 'https://www.icloud.com/shortcuts/324c1e4c47824fbbbc36c48b0f7143f0';
const DISCORD_SNOWFLAKE_REGEX = /^\d{18,19}$/;
const KAHOOT_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KAHOOT_PIN_REGEX = /^\d{6,7}$/;
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

// In-memory admin set for /grant, /lockchat, /unlock.
// Seeded with OWNER_ID from .env; survives only until bot restart.
const authorizedAdmins = new Set(
    [process.env.OWNER_ID].filter(id => id && DISCORD_SNOWFLAKE_REGEX.test(id))
);
if (!process.env.OWNER_ID) {
    console.warn('OWNER_ID is not set; no one will have initial admin access for /grant, /lockchat, /unlock.');
}

// Per-user state for the answers channel.
// { timeoutEnd: Date|null, nextNoPermMs: number }
const answersChannelState = new Map();
// Timeout at or above this threshold triggers a kick instead of another timeout.
const ANSWERS_KICK_THRESHOLD_MS = 3600000; // 60 minutes
function defaultAnswersState() {
    return { timeoutEnd: null, nextNoPermMs: 10000 };
}

// --- Answers channel helpers ---

function formatDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} second${s !== 1 ? 's' : ''}`;
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m} minute${m !== 1 ? 's' : ''}`;
    const h = Math.round(ms / 3600000);
    return `${h} hour${h !== 1 ? 's' : ''}`;
}

async function fetchKahootQuiz(uuid) {
    try {
        const res = await fetch(`https://play.kahoot.it/rest/kahoots/${uuid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchKahootSession(pin) {
    try {
        const res = await fetch(`https://kahoot.it/reserve/session/${pin}/?${Date.now()}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function buildQuizAnswersEmbed(quizData) {
    const questions = Array.isArray(quizData.questions) ? quizData.questions : [];
    const total = questions.length;
    const shown = Math.min(total, 25);
    const fields = [];
    for (let i = 0; i < shown; i++) {
        const q = questions[i];
        const choices = Array.isArray(q.choices) ? q.choices : [];
        const correct = choices.filter(c => c.correct).map(c => String(c.answer || 'Unknown'));
        // Prefer a question type field from the API; fall back to choice count heuristic.
        const apiType = q.type || q.questionFormat || '';
        const isTrueFalse = /true.?false/i.test(String(apiType)) || (choices.length === 2 && choices.every(c => /^(true|false|yes|no)$/i.test(String(c.answer || ''))));
        const qType = isTrueFalse ? 'True/False' : 'Multiple Choice';
        const questionText = String(q.question || 'Unknown').substring(0, 100);
        fields.push({
            name: `Q${i + 1}: ${questionText}`,
            value: `**Type:** ${qType}\n**Answer:** ${correct.join(', ') || 'N/A'}`,
            inline: false
        });
    }
    if (fields.length === 0) {
        fields.push({ name: 'No questions found', value: 'This quiz has no accessible questions.', inline: false });
    }
    return new EmbedBuilder()
        .setTitle(`📋 ${String(quizData.title || 'Kahoot Quiz').substring(0, 250)}`)
        .setDescription(`${total} question(s)${total > 25 ? ' (showing first 25)' : ''}`)
        .addFields(fields)
        .setColor('#46D975')
        .setFooter({ text: '⏱️ You have been timed out for 10 seconds (anti-abuse)' });
}

function buildSessionInfoEmbed(pin, data) {
    const qArr = Array.isArray(data.quizQuestionAnswers) ? data.quizQuestionAnswers : [];
    const typeLines = qArr.length > 0
        ? qArr.slice(0, 25).map((n, i) => `Q${i + 1}: ${n <= 2 ? 'True/False' : `Multiple Choice (${n} options)`}`).join('\n')
        : 'No question data available.';
    return new EmbedBuilder()
        .setTitle(`🎮 Game PIN: ${pin}`)
        .setDescription(`**Type:** ${data.kahootType || data.quizType || 'quiz'}\n**Questions:** ${qArr.length}`)
        .addFields({ name: 'Question Types', value: typeLines.substring(0, 1024) })
        .setColor('#46D975')
        .setFooter({ text: '⏱️ You have been timed out for 10 seconds (anti-abuse)' });
}

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
                name: 'grant',
                description: 'Grant admin permissions to a user',
                options: [
                    {
                        name: 'user',
                        description: 'The user to grant admin permissions to',
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
            },
            {
                name: 'lockchat',
                description: 'Lock the current ticket channel',
                options: [
                    {
                        name: 'reason',
                        description: 'The reason for locking the chat',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
            {
                name: 'unlock',
                description: 'Unlock the current ticket channel'
            }
        ];

        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commandDefinitions }
        );
        console.log('Successfully registered global slash commands.');
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
                // Send welcome/reminder message
                await channel.send('Thanks for contacting support, we will be with you soon! 😊\n\n💳 **Reminder:** We accept **PayPal**, **crypto**, **gift cards**, **Robux**, **V-Bucks**, and more!');
                // Send the Main Menu
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
        if (interaction.commandName === 'grant') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }

            if (!authorizedAdmins.has(interaction.user.id)) {
                return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('user', true);
            if (targetUser.bot) {
                return interaction.reply({ content: 'You cannot grant admin permissions to bots.', ephemeral: true });
            }

            authorizedAdmins.add(targetUser.id);

            return interaction.reply({
                content: `✅ Granted admin permissions to <@${targetUser.id}>.`,
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

        if (interaction.commandName === 'lockchat') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }
            if (!interaction.channel || !interaction.channel.name.startsWith(TICKET_CHANNEL_PREFIX)) {
                return interaction.reply({ content: 'Use this command inside a ticket channel.', ephemeral: true });
            }
            if (!authorizedAdmins.has(interaction.user.id)) {
                return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
            }

            const reason = interaction.options.getString('reason', true);
            const ticketMembers = interaction.channel.members.filter(m => !m.user.bot && !authorizedAdmins.has(m.user.id));

            try {
                for (const [, member] of ticketMembers) {
                    await interaction.channel.permissionOverwrites.edit(member.user.id, { SendMessages: false });
                }
                const embed = new EmbedBuilder()
                    .setDescription(`🔒 **Ticket Locked by Admin**\nReason: ${reason}`)
                    .setColor('#ff0000');
                return interaction.reply({ embeds: [embed] });
            } catch (err) {
                console.error('Error handling /lockchat:', err);
                return interaction.reply({ content: 'Failed to lock the chat.', ephemeral: true });
            }
        }

        if (interaction.commandName === 'unlock') {
            if (!interaction.inGuild()) {
                return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
            }
            if (!interaction.channel || !interaction.channel.name.startsWith(TICKET_CHANNEL_PREFIX)) {
                return interaction.reply({ content: 'Use this command inside a ticket channel.', ephemeral: true });
            }
            if (!authorizedAdmins.has(interaction.user.id)) {
                return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
            }

            const ticketMembers = interaction.channel.members.filter(m => !m.user.bot && !authorizedAdmins.has(m.user.id));

            try {
                for (const [, member] of ticketMembers) {
                    await interaction.channel.permissionOverwrites.edit(member.user.id, { SendMessages: true });
                }
                return interaction.reply({ content: '🔓 **Ticket Unlocked.** You can now send messages.' });
            } catch (err) {
                console.error('Error handling /unlock:', err);
                return interaction.reply({ content: 'Failed to unlock the chat.', ephemeral: true });
            }
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

// --- Answers channel: game ID lookup ---
client.on('messageCreate', async (message) => {
    if (message.channel.id !== ANSWERS_CHANNEL_ID) return;
    if (message.author.bot) return;

    const userId = message.author.id;
    const guild = message.guild;
    if (!guild) return;

    const member = message.member || await guild.members.fetch(userId).catch(() => null);
    if (!member) {
        await message.delete().catch(() => {});
        return;
    }

    const state = answersChannelState.get(userId) || defaultAnswersState();

    // Bypass detection: delete messages sent during tracked timeout window
    if (state.timeoutEnd && new Date() < state.timeoutEnd) {
        await message.delete().catch(() => {});
        return;
    }

    // Grant-perms check
    if (!hasGrantedAccess(member)) {
        await message.delete().catch(() => {});
        const timeoutMs = state.nextNoPermMs;

        // Kick when threshold reaches or exceeds 60 minutes
        if (timeoutMs >= ANSWERS_KICK_THRESHOLD_MS) {
            const kickMsg = await message.channel.send(
                `❌ <@${userId}> You have been kicked for repeated unauthorized access attempts.`
            );
            await member.kick('Repeated unauthorized access to answers channel').catch(err =>
                console.error('Kick failed:', err)
            );
            setTimeout(() => kickMsg.delete().catch(() => {}), 10000);
            answersChannelState.delete(userId);
            return;
        }

        const timeoutEnd = new Date(Date.now() + timeoutMs);
        answersChannelState.set(userId, {
            timeoutEnd,
            nextNoPermMs: Math.min(timeoutMs * 2, ANSWERS_KICK_THRESHOLD_MS)
        });
        await member.timeout(timeoutMs, 'No permission for answers channel').catch(err =>
            console.error('Timeout failed:', err)
        );
        const noPermsMsg = await message.channel.send(
            `❌ <@${userId}> You don't have permission to use this feature. You have been timed out for **${formatDuration(timeoutMs)}**.`
        );
        setTimeout(() => noPermsMsg.delete().catch(() => {}), Math.min(timeoutMs, 30000));
        return;
    }

    // User has grant perms — validate and look up game ID
    const input = message.content.trim();
    await message.delete().catch(() => {});

    const isUUID = KAHOOT_UUID_REGEX.test(input);
    const isPIN = KAHOOT_PIN_REGEX.test(input);

    if (!isUUID && !isPIN) {
        const errMsg = await message.channel.send(
            `❌ <@${userId}> Invalid game ID. Enter a 6-7 digit Kahoot PIN or a quiz UUID.`
        );
        const timeoutEnd = new Date(Date.now() + 10000);
        answersChannelState.set(userId, { ...state, timeoutEnd });
        await member.timeout(10000, 'Invalid game ID format').catch(() => {});
        setTimeout(() => errMsg.delete().catch(() => {}), 10000);
        return;
    }

    let embed = null;
    if (isUUID) {
        const quizData = await fetchKahootQuiz(input);
        if (quizData) embed = buildQuizAnswersEmbed(quizData);
    } else {
        const sessionData = await fetchKahootSession(input);
        if (sessionData) embed = buildSessionInfoEmbed(input, sessionData);
    }

    if (!embed) {
        const errMsg = await message.channel.send(
            `❌ <@${userId}> Game not found or expired. Check the ID and try again.`
        );
        const timeoutEnd = new Date(Date.now() + 10000);
        answersChannelState.set(userId, { ...state, timeoutEnd });
        await member.timeout(10000, 'Game ID not found').catch(() => {});
        setTimeout(() => errMsg.delete().catch(() => {}), 10000);
        return;
    }

    // Valid game — post answers and apply anti-abuse timeout
    await message.channel.send({ embeds: [embed] });
    const timeoutEnd = new Date(Date.now() + 10000);
    answersChannelState.set(userId, { ...state, timeoutEnd });
    await member.timeout(10000, 'Anti-abuse timeout after answer lookup').catch(() => {});
});

// Start the bot
client.login(process.env.TOKEN);
