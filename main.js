// ===============================
// main.js — Optimized Discord Bot Core
// ===============================

const {
  Client,
  GatewayIntentBits,
  Collection,
  Colors,
  EmbedBuilder,
  Partials,
  Events
} = require('discord.js');
const config = require('./config.js');
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
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

// === CHANNEL CONFIG ===
const ARIA_CHANNEL_ID = "1428927739431227503";
const LOG_CHANNEL_ID = '1426904103534985317';
const WELCOME_CHANNEL = '1427870606660997192';
const GOODBYE_CHANNEL = '1427870731508781066';

// ===============================
// TIME ALIGNMENT FOR STOCK CHECK
// ===============================
function getNextAlignedTime() {
  const now = new Date();
  const next = new Date(now);
  const minute = now.getMinutes();
  const nextMinute = Math.ceil(minute / 5) * 5;
  next.setMinutes(nextMinute === 60 ? 0 : nextMinute, 0, 0);
  if (nextMinute === 60) next.setHours(now.getHours() + 1);
  return next;
}

async function waitUntilNextAligned() {
  const next = getNextAlignedTime();
  const delay = next.getTime() - Date.now();
  console.log(`⏳ Waiting until ${next.toLocaleTimeString()} to start stock check...`);
  await new Promise(res => setTimeout(res, delay));
}

// ===============================
// EMOJI + NICKNAME HANDLER
// ===============================
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
    }
  } catch (err) {
    console.error(`❌ Failed to apply emoji nickname for ${member.user.tag}:`, err);
  }
}

// ===============================
// READY EVENT
// ===============================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Load all commands & events
  try { loadCommands(client); } catch (e) { console.warn('loadCommands err', e); }
  try { await loadSlashCommands(client); } catch (e) { console.warn('loadSlashCommands err', e); }
  try { loadEvents(client); } catch (e) { console.warn('loadEvents err', e); }

  // Load stock modules
  const pvbstock = client.commands.get("pvbstock");
  const gagstock = client.commands.get("gagstock");
  if (pvbstock?.onReady) await pvbstock.onReady(client);
  if (gagstock?.onReady) await gagstock.onReady(client);

  // Stock check loop every aligned 5 mins
  (async function alignedStockLoop() {
  console.log("🔁 Starting aligned stock check loop...");
  while (true) {
    await waitUntilNextAligned();
    console.log(`🕒 Stock check started (${new Date().toLocaleTimeString()})`);

    let updated = false;

    // Check every 10s up to 5 min (30 × 10s)
    for (let i = 0; i < 30; i++) {
      try {
        const pvbstock = client.commands.get("pvbstock");
        const gagstock = client.commands.get("gagstock");

        const pvbChanged = pvbstock?.checkForUpdate ? await pvbstock.checkForUpdate(client) : false;
        const gagChanged = gagstock?.checkForUpdate ? await gagstock.checkForUpdate(client) : false;

        if (pvbChanged || gagChanged) {
          console.log("✅ Stock updated — notifications sent!");
          updated = true;
          break;
        }
      } catch (err) {
        console.error("⚠️ Stock check error:", err);
      }

      await new Promise(res => setTimeout(res, 10000)); // 10s
    }

    if (!updated) console.log("⌛ No stock update found — waiting next aligned time.");
  }
})();

  // Update nickname emojis
  console.log("🔄 Updating emoji nicknames for all members...");
  for (const guild of client.guilds.cache.values()) {
    const members = await guild.members.fetch();
    for (const member of members.values()) await applyHighestRoleEmoji(member);
  }
  console.log("✅ Nickname emojis updated for all members!");
});

// ===============================
// MEMBER EVENTS
// ===============================
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
  await applyHighestRoleEmoji(member);
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

client.on(Events.GuildMemberUpdate, async (_, newMember) => {
  await applyHighestRoleEmoji(newMember);
});

// ===============================
// MESSAGE HANDLER
// ===============================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  // === Auto WFL React ===
  const wflRegex = /\b(?:win\s*or\s*lose|win\s*lose|w[\s\/\.\-]*f[\s\/\.\-]*l)\b/i;
  if (wflRegex.test(message.content)) {
    try {
      await message.react('🇼');
      await message.react('🇫');
      await message.react('🇱');
    } catch {}
  }

  // === Warning system ===
  try { await warnModule.handleEvent({ message }); } catch (err) { console.error(err); }

  // === Prefix Commands ===
  const prefix = config.prefix;
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    const command = client.commands.get(commandName)
      || client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
    if (command) {
      try { await command.letStart({ args, message, discord: { client } }); } catch (error) { console.error(error); }
      return;
    }
  }

  // === GPT / META / ARIA Modules ===
  if (gptModule && message.channel.id === gptModule.config.channelId) {
    try { await gptModule.letStart({ message }); } catch (err) { console.error("GPT module error:", err); }
  }
  if (metaModule && message.channel.id === metaModule.config.channelId) {
    try { await metaModule.letStart({ message }); } catch (err) { console.error("Meta-AI error:", err); }
  }
  if (ariaModule && message.channel.id === ARIA_CHANNEL_ID) {
    try { await ariaModule.letStart({ message }); } catch (err) { console.error("Aria-AI error:", err); }
  }
});

// ===============================
// ADMIN / MOD LOGS
// ===============================
client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
  const logChannel = entry.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;

  let description = '';
  switch (entry.action) {
    case 'MEMBER_ROLE_UPDATE':
      description = `<@${entry.executor.id}> **updated roles** for <@${entry.target.id}>.`;
      break;
    case 'MEMBER_BAN_ADD':
      description = `<@${entry.executor.id}> **banned** <@${entry.target.id}>.`;
      break;
    case 'MEMBER_BAN_REMOVE':
      description = `<@${entry.executor.id}> **unbanned** <@${entry.target.id}>.`;
      break;
    case 'MEMBER_UPDATE':
      description = `<@${entry.executor.id}> **updated member** <@${entry.target.id}>.`;
      break;
    case 'MEMBER_KICK':
      description = `<@${entry.executor.id}> **kicked** <@${entry.target.id}>.`;
      break;
    default:
      return;
  }

  if (description) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('🛡️ Admin Action')
      .setDescription(description)
      .setTimestamp();
    logChannel.send({ embeds: [embed] }).catch(() => {});
  }
});

// ===============================
// LOGIN
// ===============================
client.login(config.token).catch(err => console.error('Login failed:', err));