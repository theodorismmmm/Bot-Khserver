require('dotenv').config();
const {
    Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
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
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const PAYPAL_LINK = 'https://www.paypal.me/transfer959';

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    registerPaySlashCommand();
});

async function registerPaySlashCommand() {
    try {
        await Promise.all([...client.guilds.cache.values()].map(async (guild) => {
            const commands = await guild.commands.fetch();
            const existing = commands.find(cmd => cmd.name === 'pay');

            if (!existing) {
                await guild.commands.create({
                    name: 'pay',
                    description: 'Restart the payment bot flow in this ticket'
                });
                console.log(`Registered /pay in ${guild.name}`);
            }
        }));
    } catch (err) {
        console.error('Failed to register /pay command:', err);
    }
}

// Auto-trigger when Ticket Tool creates a new channel
client.on('channelCreate', async (channel) => {
    if (!channel.name.startsWith('ticket-')) return;

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
        new ButtonBuilder().setCustomId(`menu_trial_${user.id}`).setLabel('Trial Version').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`menu_pro_${user.id}`).setLabel('Buy Pro').setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [embed], components: [row] });
}

// Handle all button clicks and forms
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'pay') {
        if (!interaction.channel || !interaction.channel.name.startsWith('ticket-')) {
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
                await interaction.followUp(errorResponse).catch(() => {});
            } else {
                await interaction.reply(errorResponse).catch(() => {});
            }
        }
        return;
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
                .setDescription('Before purchasing KaHack Pro, you must agree:\n1. All sales are final. No refunds.\n2. We are not responsible for any actions taken against your Kahoot account.\n3. The license is valid for 120 Days.')
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
            await interaction.update({ content: `✅ **Payment Noted!** <@${interaction.user.id}> The chat has been unlocked.\n\nYou will receive the shortcut and license key within 3 Hours. You can leave any questions or payment proof screenshots below.`, embeds: [], components: [] });
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

            await interaction.reply({ content: `✅ **Code Submitted!** <@${interaction.user.id}> The chat has been unlocked.\n\nYou will receive the shortcut and license key within 3 Hours. You can leave any questions below.` });
            await interaction.message.delete();
        }
    }
});

// Start the bot
client.login(process.env.TOKEN);
