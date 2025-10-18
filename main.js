// main.js
const {
  Client,
  GatewayIntentBits,
  Collection,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Partials,
  Events
} = require('discord.js');
const config = require('./config.js');
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { getData, setData } = require('./database.js');
const warnModule = require('./modules/commands/warning.js');

// === AI MODULES ===
const gptModule = require('./modules/commands/gpt.js');
const ariaModule = require('./modules/commands/airia.js');
const metaModule = require('./modules/commands/metaai.js');

// === CLIENT SETUP ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.events = new Map();

// === CHANNELS & ROLES ===
const GAG_CHANNEL_ID = "1426904612861902868";
const PVB_CHANNEL_ID = "1426904690343284847";
const ARIA_CHANNEL_ID = "1428927739431227503";
const ROLE_CHANNELS = [GAG_CHANNEL_ID, PVB_CHANNEL_ID];

const roleMap = {
  secret_role: '1427517229129404477',
  godly_role: '1427517104780869713',
  grand_master: '1427560078411563059',
  great_pumpkin: '1427560648673595402',
  levelup_lollipop: '1427560940068536320'
};

const PANEL_MARKER = '🎭 **Choose a role below:**';
const LOG_CHANNEL_ID = '1426904103534985317';
const WELCOME_CHANNEL = '1427870606660997192';
const GOODBYE_CHANNEL = '1427870731508781066';

// === HELPER FUNCTIONS ===
function buildButtonsForChannel(channelId) {
  const row = new ActionRowBuilder();
  const BUTTON_STYLE = ButtonStyle.Success;

  if (channelId === PVB_CHANNEL_ID) {
    row.addComponents(
      new ButtonBuilder().setCustomId('secret_role').setLabel('Secret Role').setStyle(BUTTON_STYLE),
      new ButtonBuilder().setCustomId('godly_role').setLabel('Godly Role').setStyle(BUTTON_STYLE)
    );
  } else if (channelId === GAG_CHANNEL_ID) {
    row.addComponents(
      new ButtonBuilder().setCustomId('grand_master').setLabel('Grand Master').setStyle(BUTTON_STYLE),
      new ButtonBuilder().setCustomId('great_pumpkin').setLabel('Great Pumpkin').setStyle(BUTTON_STYLE),
      new ButtonBuilder().setCustomId('levelup_lollipop').setLabel('Levelup Lollipop').setStyle(BUTTON_STYLE)
    );
  }
  return row;
}

async function sendPanelToChannel(channel) {
  try {
    const row = buildButtonsForChannel(channel.id);
    await channel.send({ content: PANEL_MARKER, components: [row] });
    console.log(`✅ Sent role panel in #${channel.name || channel.id}`);
  } catch (err) {
    console.error(`❌ Failed to send role panel to ${channel.id}:`, err);
  }
}

async function ensurePanelInChannel(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = msgs?.find(m => m.content?.includes(PANEL_MARKER));
  if (!existing) await sendPanelToChannel(channel);
}

// === EMOJI NICKNAME ===
function extractEmojis(text) {
  if (!text) return [];
  const match = text.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+)/u);
  return match ? [...match[0]] : [];
}

async function applyHighestRoleEmoji(member) {
  if (!member.manageable) return;
  try {
    const rolesWithEmoji = member.roles.cache
      .filter(role => extractEmojis(role.name).length > 0)
      .sort((a, b) => b.position - a.position);

    const topRole = rolesWithEmoji.first();
    const emojis = topRole ? extractEmojis(topRole.name).slice(0, 2) : [];
    const emojiSuffix = emojis.length > 0 ? ` ${emojis.join('')}` : '';

    const baseName = member.displayName.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+/gu, "").trim();
    const newNickname = `${baseName}${emojiSuffix}`;

    if (member.displayName !== newNickname) {
      await member.setNickname(newNickname).catch(() => {});
      const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle("🪄 Nickname Updated")
          .setDescription(`**Member:** ${member.user.tag}\n**New Nickname:** ${newNickname}\n**Top Role:** ${topRole ? topRole.name : "None"}`)
          .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`❌ Failed to apply emoji nickname for ${member.user.tag}:`, err);
  }
}

// === READY EVENT ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try { loadCommands(client); } catch (e) { console.warn('loadCommands err', e); }
  try { await loadSlashCommands(client); } catch (e) { console.warn('loadSlashCommands err', e); }
  try { loadEvents(client); } catch (e) { console.warn('loadEvents err', e); }

  for (const cid of ROLE_CHANNELS) {
    const channel = await client.channels.fetch(cid).catch(() => null);
    if (channel) await ensurePanelInChannel(channel);
  }

  // Auto-check every 5 minutes
  setInterval(async () => {
    for (const cid of ROLE_CHANNELS) {
      const channel = await client.channels.fetch(cid).catch(() => null);
      if (channel) await ensurePanelInChannel(channel);
    }
  }, 5 * 60 * 1000);

  console.log('🔁 Role panel auto-check active (5m).');

  console.log("🔄 Syncing nickname emojis...");
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();
    for (const member of members.values()) await applyHighestRoleEmoji(member);
  }
  console.log("✅ Nickname emojis synced!");
});

// === AUTO RECREATE PANEL ===
client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  if (!ROLE_CHANNELS.includes(message.channelId)) return;
  if (message.content?.includes(PANEL_MARKER)) {
    const channel = await client.channels.fetch(message.channelId).catch(() => null);
    if (channel) {
      console.log(`♻️ Recreating deleted role panel in #${channel.name}`);
      await sendPanelToChannel(channel);
    }
  } else {
    // Double safety: if last panel is gone, recreate
    const channel = await client.channels.fetch(message.channelId).catch(() => null);
    if (!channel) return;
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const exists = msgs?.some(m => m.content?.includes(PANEL_MARKER));
    if (!exists) await sendPanelToChannel(channel);
  }
});

// === ROLE INTERACTION ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const roleId = roleMap[interaction.customId];
  if (!roleId) return;

  const member = interaction.member;
  const hasRole = member.roles.cache.has(roleId);

  try {
    if (hasRole) {
      await member.roles.remove(roleId, 'Toggled via panel');
      await interaction.reply({ content: `❌ Removed <@&${roleId}> from you.`, ephemeral: true });
    } else {
      await member.roles.add(roleId, 'Toggled via panel');
      await interaction.reply({ content: `✅ Added <@&${roleId}> to you.`, ephemeral: true });
    }
    await applyHighestRoleEmoji(member);
  } catch (err) {
    console.error('Role toggle error:', err);
    await interaction.reply({ content: '❌ Failed to toggle role.', ephemeral: true });
  }
});

// === WELCOME / GOODBYE ===
client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle('👋 Welcome!')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setDescription(`Welcome to **${member.guild.name}**, ${member}! 🎉\nWe now have **${member.guild.memberCount} members**!`)
    .setFooter({ text: 'Glad to have you here!' })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
  await applyHighestRoleEmoji(member);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle('😢 Goodbye!')
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setDescription(`${member.user.tag} has left the server.\nWe now have **${member.guild.memberCount} members** left.`)
    .setFooter({ text: 'We’ll miss you!' })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
});

// === MESSAGE HANDLER ===
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const wflRegex = /\b(?:win\s*or\s*lose|win\s*lose|w[\s\/\.\-]*f[\s\/\.\-]*l)\b/i;
  if (wflRegex.test(message.content)) {
    try { await message.react('🇼'); await message.react('🇫'); await message.react('🇱'); } catch {}
  }

  try { await warnModule.handleEvent({ message }); } catch (err) { console.error(err); }

  const prefix = config.prefix;
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
    if (command) {
      try { await command.letStart({ args, message, discord: { client } }); } catch (error) { console.error(error); }
      return;
    }
  }

  if (gptModule && message.channel.id === gptModule.config.channelId)
    try { await gptModule.letStart({ message }); } catch (err) { console.error("GPT module error:", err); }

  if (metaModule && message.channel.id === metaModule.config.channelId)
    try { await metaModule.letStart({ message }); } catch (err) { console.error("Meta-Ai module error:", err); }

  if (ariaModule && message.channel.id === ARIA_CHANNEL_ID)
    try { await ariaModule.letStart({ message }); } catch (err) { console.error("Aria-Ai module error:", err); }
});

// === MEMBER UPDATE ===
client.on(Events.GuildMemberUpdate, async (_, newMember) => {
  await applyHighestRoleEmoji(newMember);
});

// === ADMIN LOGS ===
client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
  const logChannel = entry.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  let description = '';
  switch (entry.action) {
    case 'MEMBER_ROLE_UPDATE':
      description = `<@${entry.executor.id}> updated roles for <@${entry.target.id}>.`;
      break;
    case 'MEMBER_BAN_ADD':
      description = `<@${entry.executor.id}> banned <@${entry.target.id}>.`;
      break;
    case 'MEMBER_BAN_REMOVE':
      description = `<@${entry.executor.id}> unbanned <@${entry.target.id}>.`;
      break;
    case 'MEMBER_UPDATE':
      description = `<@${entry.executor.id}> updated member <@${entry.target.id}>.`;
      break;
    case 'MEMBER_KICK':
      description = `<@${entry.executor.id}> kicked <@${entry.target.id}>.`;
      break;
    default:
      return;
  }
  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle('🛡️ Admin Action')
    .setDescription(description)
    .setTimestamp();
  logChannel.send({ embeds: [embed] }).catch(() => {});
});

// === LOGIN ===
client.login(config.token).catch(err => console.error('Login failed:', err));