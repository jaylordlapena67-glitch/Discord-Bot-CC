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
const warnModule = require('./modules/commands/warning.js'); // auto warning
const xpModule = require('./modules/commands/rank.js'); // rank/xp module

// === CLIENT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.slashCommands = new Collection();

// === CHANNELS ===
const GAG_CHANNEL_ID = "1426904612861902868";
const PVB_CHANNEL_ID = "1426904690343284847";
const ROLE_CHANNELS = [GAG_CHANNEL_ID, PVB_CHANNEL_ID];

// === ROLE IDS ===
const roleMap = {
  secret_role: '1427517229129404477',
  godly_role: '1427517104780869713',
  grand_master: '1427560078411563059',
  great_pumpkin: '1427560648673595402',
  levelup_lollipop: '1427560940068536320'
};

const PANEL_MARKER = '🎭 **Choose a role below:**';

// === BUTTON BUILDER (all green) ===
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

// === SEND PANEL TO CHANNEL ===
async function sendPanelToChannel(channel) {
  try {
    const row = buildButtonsForChannel(channel.id);
    await channel.send({ content: PANEL_MARKER, components: [row] });
    console.log(`✅ Sent role panel in #${channel.name || channel.id}`);
  } catch (err) {
    console.error(`❌ Failed to send role panel to ${channel.id}:`, err);
  }
}

// === ENSURE PANEL EXISTS ===
async function ensurePanelInChannel(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = msgs?.find(m => m.content?.includes(PANEL_MARKER));
  if (!existing) await sendPanelToChannel(channel);
}

// === READY ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try { loadCommands(client); } catch (e) { console.warn('loadCommands err', e); }
  try { await loadSlashCommands(client); } catch (e) { console.warn('loadSlashCommands err', e); }
  try { loadEvents(client); } catch (e) { console.warn('loadEvents err', e); }

  // ensure all panels exist
  for (const cid of ROLE_CHANNELS) {
    const channel = await client.channels.fetch(cid).catch(() => null);
    if (channel) await ensurePanelInChannel(channel);
  }

  // periodic 5 min recheck
  setInterval(async () => {
    for (const cid of ROLE_CHANNELS) {
      const channel = await client.channels.fetch(cid).catch(() => null);
      if (channel) await ensurePanelInChannel(channel);
    }
  }, 5 * 60 * 1000);

  console.log('🔁 Role panel auto-check active (5m).');

  // auto assign level roles on bot start
  for (const guild of client.guilds.cache.values()) {
    await xpModule.autoAssignAllMembers(guild);
  }

  // ✅ Resume pvbstock auto feature if enabled before restart
  const pvbstock = client.commands.get("pvbstock");
  if (pvbstock?.onReady) {
    await pvbstock.onReady(client);
    console.log("🌱 PVBR auto-stock resumed for all guilds with enabled state.");
  }
});

// === AUTO RECREATE PANEL IF DELETED ===
client.on(Events.MessageDelete, async (message) => {
  if (!message?.content?.includes(PANEL_MARKER)) return;
  if (!ROLE_CHANNELS.includes(message.channelId)) return;
  const channel = await client.channels.fetch(message.channelId).catch(() => null);
  if (channel) await sendPanelToChannel(channel);
});

// === ROLE BUTTON INTERACTION ===
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
  } catch (err) {
    console.error('Role toggle error:', err);
    await interaction.reply({ content: '❌ Failed to toggle role.', ephemeral: true });
  }
});

// === WELCOME / GOODBYE ===
const WELCOME_CHANNEL = '1427870606660997192';
const GOODBYE_CHANNEL = '1427870731508781066';

client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(`👋 Welcome ${member.user.tag}!`)
      .setDescription(`Glad to have you here, <@${member.id}>! 🎉`)
      .addFields({ name: 'Member Count', value: `${member.guild.memberCount}`, inline: true })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }

  await applyEmojiToNickname(member);
  await xpModule.assignLevelRole(member, 0);
});

client.on(Events.GuildMemberRemove, async (member) => {
  const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(`😢 ${member.user.tag} left the server`)
    .addFields({ name: 'Member Count', value: `${member.guild.memberCount}`, inline: true })
    .setTimestamp();
  await channel.send({ embeds: [embed] });
});

// === MESSAGE: WFL + AUTO WARNING ===
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const wflRegex = /\b(?:win\s*or\s*lose|win\s*lose|w[\s\/\.\-]*f[\s\/\.\-]*l)\b/i;
  if (wflRegex.test(message.content)) {
    try {
      await message.react('🇼');
      await message.react('🇫');
      await message.react('🇱');
    } catch (err) { console.error('Error reacting WFL:', err); }
  }

  try { await warnModule.handleEvent({ message }); } catch (err) { console.error('Auto-warning error:', err); }

  const prefix = config.prefix;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  const command =
    client.commands.get(commandName) ||
    client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
  if (!command) return;

  try { await command.letStart({ args, message, discord: { client } }); } catch (error) {
    console.error('Command error:', error);
    try { await message.reply(`❌ | ${error.message}`); } catch {}
  }
});

// === AUTO NICKNAME EMOJI SYSTEM ===
const ROLE_EMOJIS = {
  "1427447542475657278": { emoji: "👑", color: Colors.Gold },
  "1427959238705025175": { emoji: "🛡️", color: Colors.Red },
  "1427959010111393854": { emoji: "⚔️", color: Colors.Blue },
  "1427974807672328254": { emoji: "💼", color: Colors.Purple }
};

async function applyEmojiToNickname(member) {
  if (!member.manageable) return;
  try {
    let foundRole = null;
    for (const [roleId, data] of Object.entries(ROLE_EMOJIS)) {
      if (member.roles.cache.has(roleId)) {
        foundRole = data;
        break;
      }
    }
    if (!foundRole) return;

    const baseName = member.displayName.replace(/[\p{Emoji_Presentation}\p{Emoji}\u200D]+$/u, "").trim();
    const newNickname = `${baseName} ${foundRole.emoji}`;
    if (member.displayName !== newNickname) {
      await member.setNickname(newNickname).catch(() => {});
      console.log(`✅ Updated nickname for ${member.user.tag}: ${newNickname}`);
    }
  } catch (err) {
    console.error(`❌ Failed to apply emoji nickname for ${member.user.tag}:`, err);
  }
}

// update all on bot start
client.once("ready", async () => {
  console.log("🔄 Checking and updating nicknames with emojis...");
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      await applyEmojiToNickname(member);
    }
  }
  console.log("✅ Nickname emojis updated for all members!");
});

// update when roles change
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await applyEmojiToNickname(newMember);
});

// === LOGIN ===
client.login(config.token).catch(err => console.error('Login failed:', err));