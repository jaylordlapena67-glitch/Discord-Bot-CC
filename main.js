const {
  Client,
  GatewayIntentBits,
  Collection,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Partials
} = require('discord.js');
const config = require('./config.js');
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { getData, setData } = require('./database.js');
const warnModule = require('./modules/commands/warning.js'); // ✅ keep auto warning system

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

// === BUTTON BUILDER ===
function buildButtonsForChannel(channelId, member) {
  const hasRole = (id) => member?.roles?.cache?.has(roleMap[id]);

  if (channelId === PVB_CHANNEL_ID) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('secret_role')
        .setLabel('Secret Role')
        .setStyle(hasRole('secret_role') ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('godly_role')
        .setLabel('Godly Role')
        .setStyle(hasRole('godly_role') ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  if (channelId === GAG_CHANNEL_ID) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('grand_master')
        .setLabel('Grand Master')
        .setStyle(hasRole('grand_master') ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('great_pumpkin')
        .setLabel('Great Pumpkin')
        .setStyle(hasRole('great_pumpkin') ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('levelup_lollipop')
        .setLabel('Levelup Lollipop')
        .setStyle(hasRole('levelup_lollipop') ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  return new ActionRowBuilder();
}

// === PANEL CREATION ===
async function sendPanelToChannel(channel) {
  try {
    const row = buildButtonsForChannel(channel.id, null);
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

// === MEMBER-BASED PANEL UPDATE ===
async function updatePanelForMember(member, channel) {
  const row = buildButtonsForChannel(channel.id, member);
  try {
    await channel.send({
      content: `${member.displayName}, here’s your updated role view 👇`,
      components: [row],
      ephemeral: true
    });
  } catch (err) {
    console.warn('❌ Ephemeral panel failed:', err.message);
  }
}

// === READY ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try { loadCommands(client); } catch (e) { console.warn('loadCommands err', e); }
  try { await loadSlashCommands(client); } catch (e) { console.warn('loadSlashCommands err', e); }
  try { loadEvents(client); } catch (e) { console.warn('loadEvents err', e); }

  for (const cid of ROLE_CHANNELS) {
    const channel = await client.channels.fetch(cid).catch(() => null);
    if (channel) await ensurePanelInChannel(channel);
  }

  // periodic check
  setInterval(async () => {
    for (const cid of ROLE_CHANNELS) {
      const channel = await client.channels.fetch(cid).catch(() => null);
      if (channel) await ensurePanelInChannel(channel);
    }
  }, 5 * 60 * 1000);

  console.log('🔁 Role panel auto-check active (5m).');
});

// === MESSAGE DELETE (Recreate Panel) ===
client.on('messageDelete', async (message) => {
  if (!message?.content?.includes(PANEL_MARKER)) return;
  if (!ROLE_CHANNELS.includes(message.channelId)) return;
  const channel = await client.channels.fetch(message.channelId).catch(() => null);
  if (channel) {
    console.log(`🗑️ Panel deleted in #${channel.name || channel.id}, recreating...`);
    await sendPanelToChannel(channel);
  }
});

// === INTERACTION ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;
  const mappedRoleId = roleMap[customId];
  if (!mappedRoleId) return;

  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

  const has = member.roles.cache.has(mappedRoleId);
  if (has) await member.roles.remove(mappedRoleId, 'Toggled via panel');
  else await member.roles.add(mappedRoleId, 'Toggled via panel');

  await updatePanelForMember(member, interaction.channel);
  await interaction.deferUpdate();
});

// === MEMBER UPDATES ===
client.on('guildMemberUpdate', async (_, newMember) => {
  for (const cid of ROLE_CHANNELS) {
    const channel = await newMember.guild.channels.fetch(cid).catch(() => null);
    if (channel) await updatePanelForMember(newMember, channel);
  }
});

// === WELCOME / GOODBYE ===
const WELCOME_CHANNEL = '1427870606660997192';
const GOODBYE_CHANNEL = '1427870731508781066';

client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(`👋 Welcome ${member.user.tag}!`)
    .setDescription(`Glad to have you here, <@${member.id}>! 🎉`)
    .addFields({ name: 'Member Count', value: `${member.guild.memberCount}`, inline: true })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();
  await channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async (member) => {
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
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Detect "win lose", "win or lose", "wfl", "w.f.l", etc
  const wflRegex = /\b(?:win\s*or\s*lose|win\s*lose|w[\s\/\.\-]*f[\s\/\.\-]*l)\b/i;
  if (wflRegex.test(message.content)) {
    try {
      await message.react('🇼');
      await message.react('🇫');
      await message.react('🇱');
    } catch (err) {
      console.error('Error reacting WFL:', err);
    }
  }

  // ✅ Auto warning module restored
  try {
    await warnModule.handleEvent({ message });
  } catch (err) {
    console.error('Auto-warning error:', err);
  }

  // Prefix command handler
  const prefix = config.prefix;
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  const command =
    client.commands.get(commandName) ||
    client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
  if (!command) return;

  try {
    await command.letStart({ args, message, discord: { client } });
  } catch (error) {
    console.error('Command error:', error);
    try { await message.reply(`❌ | ${error.message}`); } catch {}
  }
});

// === LOGIN ===
client.login(config.token).catch(err => console.error('Login failed:', err));