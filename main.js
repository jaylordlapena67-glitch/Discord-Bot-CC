const {
    Client,
    GatewayIntentBits,
    Collection,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
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
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();

const ROLE_CHANNELS = [
    "1426904612861902868", // GAG
    "1426904690343284847"  // PVB
];

const roleMap = {
    secret_role: '1427517229129404477',
    godly_role: '1427517104780869713',
    grand_master: '1427560078411563059',
    great_pumpkin: '1427560648673595402',
    levelup_lollipop: '1427560940068536320'
};

// === READY EVENT ===
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    loadCommands(client);
    await loadSlashCommands(client);
    loadEvents(client);

    // Ensure role message exists
    async function ensureRoleMessage(channel) {
        const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        const existing = messages?.find(m => m.content.includes("🎭 **Choose a role below:**"));
        if (!existing) {
            await channel.send({
                content: "🎭 **Choose a role below:**",
                components: [getRoleButtons(null)]
            });
            console.log(`✅ Created new role panel in ${channel.name}`);
        } else {
            console.log(`✅ Role panel already exists in ${channel.name}`);
        }
    }

    for (const channelId of ROLE_CHANNELS) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) await ensureRoleMessage(channel);
    }

    setInterval(async () => {
        for (const channelId of ROLE_CHANNELS) {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) await ensureRoleMessage(channel);
        }
    }, 5 * 60 * 1000);
});

// === ROLE BUTTON CREATOR ===
function getRoleButtons(member) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("secret_role")
            .setLabel("Secret Role")
            .setStyle(member?.roles.cache.has(roleMap.secret_role) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("godly_role")
            .setLabel("Godly Role")
            .setStyle(member?.roles.cache.has(roleMap.godly_role) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("grand_master")
            .setLabel("Grand Master")
            .setStyle(member?.roles.cache.has(roleMap.grand_master) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("great_pumpkin")
            .setLabel("Great Pumpkin")
            .setStyle(member?.roles.cache.has(roleMap.great_pumpkin) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("levelup_lollipop")
            .setLabel("Levelup Lollipop")
            .setStyle(member?.roles.cache.has(roleMap.levelup_lollipop) ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
}

// === MEMBER WELCOME / GOODBYE ===
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

    channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', async (member) => {
    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(`😢 ${member.user.tag} left the server`)
        .addFields({ name: 'Member Count', value: `${member.guild.memberCount}`, inline: true })
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// === ROLE BUTTON INTERACTION ===
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const roleId = roleMap[interaction.customId];
    if (!roleId) return;

    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);

        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
        } else {
            await member.roles.add(roleId);
        }

        const updatedButtons = getRoleButtons(member);
        await interaction.update({ components: [updatedButtons] });

    } catch (err) {
        console.error('Role update error:', err);
        await interaction.reply({ content: 'Error updating your role.', ephemeral: true });
    }
});

// === AUTO SYNC BUTTON COLORS ===
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    for (const channelId of ROLE_CHANNELS) {
        const channel = await newMember.guild.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;
        const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        const rolePanel = messages?.find(m => m.content.includes("🎭 **Choose a role below:**"));
        if (!rolePanel) continue;

        const updatedButtons = getRoleButtons(newMember);
        await rolePanel.edit({ components: [updatedButtons] }).catch(() => null);
    }
});

// === MESSAGE HANDLER ===
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ✅ Auto detect "WFL", "win lose", "win or lose", "w/f/l", etc.
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

    // === COMMAND HANDLER ===
    const prefix = config.prefix;
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    const command =
        client.commands.get(commandName) ||
        client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
    if (!command) return;

    try {
        await command.letStart({ args, message, discord: { client } });
    } catch (error) {
        console.error(`Command error: ${error.message}`);
        message.reply(`❌ | ${error.message}`);
    }
});

client.login(config.token);