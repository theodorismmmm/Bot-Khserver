require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require('discord.js');

// Delay (ms) to wait after a ticket channel is created so Ticket Tool can add the user
const TICKET_CREATION_DELAY_MS = 3000;

// Delay (ms) before deleting a ticket channel after the user declines
const CHANNEL_DELETE_DELAY_MS = 3000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Embed builders
// ─────────────────────────────────────────────────────────────────────────────

function buildMainMenuEmbed() {
  return new EmbedBuilder()
    .setTitle('🎮 KaHack — Trial vs Pro')
    .setColor(0x5865f2)
    .setDescription(
      '**Welcome to KaHack Support!**\n\n' +
      'Choose an option below to get started.\n\n' +
      '**🆓 Free Trial**\n' +
      '• Access to core features for evaluation\n' +
      '• Limited usage period\n' +
      '• No payment required\n\n' +
      '**💎 KaHack Pro — 4 EUR**\n' +
      '• Full access to all features\n' +
      '• Lifetime license key\n' +
      '• Priority support\n' +
      '• All future updates included',
    )
    .setFooter({ text: 'KaHack • Select an option to continue' });
}

function buildTrialTosEmbed() {
  return new EmbedBuilder()
    .setTitle('📜 KaHack Free Trial — Terms of Service')
    .setColor(0xfee75c)
    .setDescription(
      '**Please read the following terms carefully before accepting.**\n\n' +
      '✅ **What you CAN do:**\n' +
      '• Use the Trial version for personal evaluation purposes\n' +
      '• Test core features during the trial period\n' +
      '• Provide feedback to help improve KaHack Pro\n' +
      '• Upgrade to Pro at any time\n\n' +
      '❌ **What you CANNOT do:**\n' +
      '• Share, redistribute, or resell your trial access or key\n' +
      '• Use the Trial version for commercial purposes\n' +
      '• Attempt to bypass, reverse-engineer, or exploit the software\n' +
      '• Create multiple accounts to obtain additional trial access\n\n' +
      '⚠️ **General:**\n' +
      'Violation of these terms will result in an immediate ban and revocation of all access. ' +
      'We reserve the right to modify or terminate the trial at any time.',
    )
    .setFooter({ text: 'KaHack • Accept to receive your trial link' });
}

function buildPaymentTosEmbed() {
  return new EmbedBuilder()
    .setTitle('📜 KaHack Pro — Payment Terms of Service')
    .setColor(0xfee75c)
    .setDescription(
      '**Please read the following before proceeding with payment.**\n\n' +
      '⚠️ **Disclaimer:**\n' +
      '• We are **not responsible** for any bans, penalties, or consequences that may arise ' +
      'from using KaHack in games or platforms that prohibit third-party tools.\n' +
      '• Use KaHack at your own risk.\n\n' +
      '💳 **Payment Policy:**\n' +
      '• All sales are **final**. No refunds will be issued after the license key is delivered.\n' +
      '• Chargebacks or payment disputes will result in a permanent ban.\n' +
      '• Your license key is personal and **must not be shared or resold**.\n\n' +
      '🔑 **Delivery:**\n' +
      '• License keys are delivered **within 3 hours** of confirmed payment.\n' +
      '• If you do not receive your key within that timeframe, please contact support.\n\n' +
      'By clicking **Accept**, you confirm you have read, understood, and agreed to these terms.',
    )
    .setFooter({ text: 'KaHack • Accept to proceed to payment' });
}

function buildPaymentWindowEmbed() {
  return new EmbedBuilder()
    .setTitle('💳 KaHack Pro — Payment')
    .setColor(0x57f287)
    .setDescription(
      '**Price: 4 EUR — KaHack Pro**\n\n' +
      'Choose your preferred payment method below:\n\n' +
      '🔵 **PayPal** — Click the PayPal button to pay via paypal.me\n' +
      '🎁 **Amazon Gift Card** — Click the Amazon Gift Card button and enter your code\n' +
      '✅ **Already Paid** — Click if you have already completed payment\n\n' +
      '_After payment is confirmed, you will receive your shortcut and license key within **3 Hours**._',
    )
    .setFooter({ text: 'KaHack • Complete your payment to receive access' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Button row builders
// ─────────────────────────────────────────────────────────────────────────────

function buildMainMenuRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trial_${userId}`)
      .setLabel('Trial version')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`buypro_${userId}`)
      .setLabel('Buy Pro')
      .setStyle(ButtonStyle.Primary),
  );
}

function buildTrialTosRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trial_accept_${userId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trial_decline_${userId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`trial_back_${userId}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildPaymentTosRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`paytos_accept_${userId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`paytos_decline_${userId}`)
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger),
  );
}

function buildPaymentWindowRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('PayPal')
      .setStyle(ButtonStyle.Link)
      .setURL('https://www.paypal.me/transfer959'),
    new ButtonBuilder()
      .setCustomId(`amazon_${userId}`)
      .setLabel('Amazon Gift Card')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`alreadypaid_${userId}`)
      .setLabel('Already Paid')
      .setStyle(ButtonStyle.Success),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// channelCreate — detect new tickets
// ─────────────────────────────────────────────────────────────────────────────

client.on('channelCreate', async (channel) => {
  if (!channel.name.startsWith('ticket-')) return;

  // Wait for Ticket Tool to add the user to the channel
  await new Promise((resolve) => setTimeout(resolve, TICKET_CREATION_DELAY_MS));

  // Refresh the channel's member list
  await channel.guild.members.fetch();

  // Find the first non-bot member who has read access to the channel
  const member = channel.members.find((m) => !m.user.bot);
  if (!member) {
    console.warn(`[ticket-bot] No non-bot member found in channel ${channel.name} — skipping setup.`);
    return;
  }

  const userId = member.id;

  // Lock the channel so the user cannot send messages
  await channel.permissionOverwrites.edit(member, {
    [PermissionsBitField.Flags.SendMessages]: false,
  });

  // Send the main menu
  await channel.send({
    embeds: [buildMainMenuEmbed()],
    components: [buildMainMenuRow(userId)],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// interactionCreate — handle all button clicks and modal submissions
// ─────────────────────────────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  // ── Button interactions ───────────────────────────────────────────────────
  if (interaction.isButton()) {
    const { customId, channel, user } = interaction;

    // Extract the owner user-id embedded in the customId (last segment after the final _)
    const parts = customId.split('_');
    const ownerId = parts[parts.length - 1];

    // Only the ticket creator may interact
    if (user.id !== ownerId) {
      return interaction.reply({
        content: '❌ Only the ticket creator can use these buttons.',
        ephemeral: true,
      });
    }

    // ── Trial version button ─────────────────────────────────────────────
    if (customId === `trial_${ownerId}`) {
      await interaction.update({
        embeds: [buildTrialTosEmbed()],
        components: [buildTrialTosRow(ownerId)],
      });
      return;
    }

    // ── Trial ToS — Back ─────────────────────────────────────────────────
    if (customId === `trial_back_${ownerId}`) {
      await interaction.update({
        embeds: [buildMainMenuEmbed()],
        components: [buildMainMenuRow(ownerId)],
      });
      return;
    }

    // ── Trial ToS — Decline ──────────────────────────────────────────────
    if (customId === `trial_decline_${ownerId}`) {
      await interaction.update({
        content: '❌ You have declined the terms. This ticket will be deleted.',
        embeds: [],
        components: [],
      });
      setTimeout(() => channel.delete().catch(() => {}), CHANNEL_DELETE_DELAY_MS);
      return;
    }

    // ── Trial ToS — Accept ───────────────────────────────────────────────
    if (customId === `trial_accept_${ownerId}`) {
      // Send the trial link ephemerally
      await interaction.reply({
        content:
          '✅ **Trial accepted!** Here is your trial link:\n' +
          '> _The trial link will be configured by the server admin._\n\n' +
          'You have been redirected back to the main menu.',
        ephemeral: true,
      });

      // Edit the original menu message back to the main menu
      await interaction.message.edit({
        embeds: [buildMainMenuEmbed()],
        components: [buildMainMenuRow(ownerId)],
      });
      return;
    }

    // ── Buy Pro button ───────────────────────────────────────────────────
    if (customId === `buypro_${ownerId}`) {
      await interaction.update({
        embeds: [buildPaymentTosEmbed()],
        components: [buildPaymentTosRow(ownerId)],
      });
      return;
    }

    // ── Payment ToS — Decline (back to main menu) ────────────────────────
    if (customId === `paytos_decline_${ownerId}`) {
      await interaction.update({
        embeds: [buildMainMenuEmbed()],
        components: [buildMainMenuRow(ownerId)],
      });
      return;
    }

    // ── Payment ToS — Accept (show payment window) ───────────────────────
    if (customId === `paytos_accept_${ownerId}`) {
      await interaction.update({
        embeds: [buildPaymentWindowEmbed()],
        components: [buildPaymentWindowRow(ownerId)],
      });
      return;
    }

    // ── Amazon Gift Card button ──────────────────────────────────────────
    if (customId === `amazon_${ownerId}`) {
      const modal = new ModalBuilder()
        .setCustomId(`amazon_modal_${ownerId}`)
        .setTitle('Amazon Gift Card Payment');

      const codeInput = new TextInputBuilder()
        .setCustomId('amazon_code')
        .setLabel('Enter your Amazon Code here')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. XXXX-XXXXXX-XXXX');

      modal.addComponents(new ActionRowBuilder().addComponents(codeInput));

      await interaction.showModal(modal);
      return;
    }

    // ── Already Paid button ──────────────────────────────────────────────
    if (customId === `alreadypaid_${ownerId}`) {
      // Unlock the channel for the user
      await channel.permissionOverwrites.edit(ownerId, {
        [PermissionsBitField.Flags.SendMessages]: true,
      });

      // Delete the payment menu message
      await interaction.message.delete().catch(() => {});

      // Defer so we can send a follow-up without the "interaction failed" error
      await interaction.deferUpdate().catch(() => {});

      // Send confirmation in the ticket channel
      await channel.send(
        '✅ **Payment marked as complete.** You will receive the shortcut and license key within 3 Hours. You can type any questions or payment proofs below.',
      );
      return;
    }
  }

  // ── Modal submissions ─────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const { customId, channel, user } = interaction;

    if (customId.startsWith('amazon_modal_')) {
      const ownerId = customId.replace('amazon_modal_', '');
      const code = interaction.fields.getTextInputValue('amazon_code');

      // Alert the admin channel
      const adminChannelId = process.env.ADMIN_CHANNEL_ID;
      if (adminChannelId) {
        const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
        if (adminChannel) {
          await adminChannel.send(
            `🔔 **New Amazon Gift Card Payment**\n` +
            `👤 User: <@${user.id}> (${user.tag})\n` +
            `🎫 Ticket: ${channel.name}\n` +
            `🎁 Code: \`${code}\``,
          );
        }
      }

      // Unlock the ticket channel for the user
      await channel.permissionOverwrites.edit(ownerId, {
        [PermissionsBitField.Flags.SendMessages]: true,
      });

      // Delete the payment menu message
      await interaction.message.delete().catch(() => {});

      // Acknowledge the modal
      await interaction.deferUpdate().catch(() => {});

      // Send confirmation in the ticket channel
      await channel.send(
        '✅ **Payment marked as complete.** You will receive the shortcut and license key within 3 Hours.',
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`✅ Ready! Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
