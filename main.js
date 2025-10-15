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
const warnModule = require('./modules/commands/warning.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions // ✅ FIXED
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.slashCommands = new Collection();

// CHANNELS
const GAG_CHANNEL_ID = "1426904612861902868";   // GAG
const PVB_CHANNEL_ID = "1426904690343284847";   // PVB
const ROLE_CHANNELS = [GAG_CHANNEL_ID, PVB_CHANNEL_ID];

// ROLE IDS
const roleMap = {
  secret_role: '1427517229129404477',
  godly_role: '1427517104780869713',
  grand_master: '1427560078411563059',
  great_pumpkin: '1427560648673595402',
  levelup_lollipop: '1427560940068536320'
};

// Marker to identify our panel messages
const PANEL_MARKER = '🎭 **Choose a role below:**';

// Build buttons for a specific channel and member (member may be null)
function buildButtonsForChannel(channelId, member) {
  // PvB panel: secret & godly
  if (channelId === PVB_CHANNEL_ID) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('secret_role')
        .setLabel('Secret Role')
        .setStyle(member?.roles?.cache?.has(roleMap.secret_role) ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('godly_role')
        .setLabel('Godly Role')
        .setStyle(member?.roles?.cache?.has(roleMap.godly_role) ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  // GAG panel: grand_master, great_pumpkin, levelup_lollipop
  if (channelId === GAG_CHANNEL_ID) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('grand_master')
        .setLabel('Grand Master')
        .setStyle(member?.roles?.cache?.has(roleMap.grand_master) ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('great_pumpkin')
        .setLabel('Great Pumpkin')
        .setStyle(member?.roles?.cache?.has(roleMap.great_pumpkin) ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('levelup_lollipop')
        .setLabel('Levelup Lollipop')
        .setStyle(member?.roles?.cache?.has(roleMap.levelup_lollipop) ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  // Fallback (shouldn't happen)
  return new ActionRowBuilder();
}

// Send a new panel (channel-specific)
async function sendPanelToChannel(channel) {
  try {
    const row = buildButtonsForChannel(channel.id, null);
    await channel.send({ content: PANEL_MARKER, components: [row] });
    console.log(`✅ Sent role panel in #${channel.name || channel.id}`);
  } catch (err) {
    console.error(`❌ Failed to send role panel to ${channel.id}:`, err);
  }
}

// Ensure there's at least one panel message in the channel (search recent messages)
async function ensurePanelInChannel(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const existing = msgs?.find(m => typeof m.content === 'string' && m.content.includes(PANEL_MARKER));
    if (!existing) {
      await sendPanelToChannel(channel);
      return null;
    }
    return existing;
  } catch (err) {
    console.error('❌ ensurePanelInChannel error:', err);
    return null;
  }
}

// Update the panel message(s) in a channel to reflect a given member's roles
async function updatePanelForMemberInChannel(guild, channelId, member) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return;
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const panel = msgs?.find(m => typeof m.content === 'string' && m.content.includes(PANEL_MARKER));
  if (!panel) return;
  try {
    const row = buildButtonsForChannel(channelId, member);
    await panel.edit({ components: [row] });
  } catch (err) {
    console.warn('Could not edit panel message:', err?.message || err);
  }
}

// Update all panels for a member (called on guildMemberUpdate or after interaction)
async function updateAllPanelsForMember(member) {
  for (const cid of ROLE_CHANNELS) {
    await updatePanelForMemberInChannel(member.guild, cid, member);
  }
}

// === READY ===
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try { loadCommands(client); } catch (e) { console.warn('loadCommands err', e); }
  try { await loadSlashCommands(client); } catch (e) { console.warn('loadSlashCommands err', e); }
  try { loadEvents(client); } catch (e) { console.warn('loadEvents err', e); }

  // Ensure each channel has a panel (if missing, create)
  for (const cid of ROLE_CHANNELS) {
    const channel = await client.channels.fetch(cid).catch(() => null);
    if (channel) await ensurePanelInChannel(channel);
  }

  // Periodic check as backup (5 minutes)
  setInterval(async () => {
    for (const cid of ROLE_CHANNELS) {
      const channel = await client.channels.fetch(cid).catch(() => null);
      if (channel) await ensurePanelInChannel(channel);
    }
  }, 5 * 60 * 1000);

  console.log('🔁 Role panel auto-check active (5m).');
});

// === MESSAGE DELETE: if a panel message is deleted, recreate immediately ===
client.on('messageDelete', async (message) => {
  try {
    if (!message || !message.guild || !message.channelId) return;
    if (!message.content || typeof message.content !== 'string') return;
    if (!message.content.includes(PANEL_MARKER)) return;
    if (!ROLE_CHANNELS.includes(message.channelId)) return;

    const channel = await client.channels.fetch(message.channelId).catch(() => null);
    if (channel) {
      console.log(`🗑️ Panel deleted in #${channel.name || channel.id} — recreating...`);
      await sendPanelToChannel(channel);
    }
  } catch (err) {
    console.error('messageDelete handler error:', err);
  }
});

// === INTERACTION: role buttons ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  const mappedRoleId = roleMap[customId];
  if (!mappedRoleId) return; // not our button

  try {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const has = member.roles.cache.has(mappedRoleId);
    if (has) await member.roles.remove(mappedRoleId, 'Toggled via panel').catch(() => {});
    else await member.roles.add(mappedRoleId, 'Toggled via panel').catch(() => {});

    // Update the panel message the user clicked on to reflect this member's roles
    const channelId = interaction.channelId;
    const panelMessage = interaction.message;
    if (panelMessage?.editable) {
      try {
        const row = buildButtonsForChannel(channelId, member);
        await panelMessage.edit({ components: [row] });
      } catch (err) {}
    }

    await updateAllPanelsForMember(member);
    await interaction.deferUpdate();
  } catch (err) {
    console.error('interactionCreate error:', err);
    try { await interaction.reply({ content: 'Error updating role.', ephemeral: true }); } catch {}
  }
});

// === GUILDMEMBERUPDATE ===
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    await updateAllPanelsForMember(newMember);
  } catch (err) {
    console.error('guildMemberUpdate handler error:', err);
  }
});

// === WELCOME / GOODBYE ===
const WELCOME_CHANNEL = '1427870606660997192';
const GOODBYE_CHANNEL = '1427870731508781066';

client.on('guildMemberAdd', async (member) => {
  try {
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
  } catch (err) { console.error('guildMemberAdd err', err); }
});

client.on('guildMemberRemove', async (member) => {
  try {
    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`😢 ${member.user.tag} left the server`)
      .addFields({ name: 'Member Count', value: `${member.guild.memberCount}`, inline: true })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) { console.error('guildMemberRemove err', err); }
});

// === MESSAGE CREATE: WFL detector ===
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

  // Auto warning
  try {
    await warnModule.handleEvent({ message });
  } catch (err) {
    console.error('Auto-detect error:', err);
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