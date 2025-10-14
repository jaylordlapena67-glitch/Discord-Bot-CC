const { Client, GatewayIntentBits, Collection, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const chalk = require('chalk');
const gradient = require('gradient-string');
const config = require('./config.js');
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { getData, setData } = require('./database.js');
const { logDiscordMessage, logCommandExecution } = require('./utils/logger');

// Import warn module
const warnModule = require('./modules/slash/warning.js'); // correct path

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
client.events = new Collection();
const cooldowns = new Map();

// Gradient helpers
const gradients = { lime: gradient('#32CD32', '#ADFF2F'), cyan: gradient('#00FFFF', '#00BFFF') };
const gradientText = (text, color) => (gradients[color] ? gradients[color](text) : text);
const boldText = (text) => chalk.bold(text);

// Reload helper
global.cc = {
    reloadCommand: function (commandName) {
        try {
            delete require.cache[require.resolve(`./modules/commands/${commandName}.js`)];
            const reloadedCommand = require(`./modules/commands/${commandName}.js`);
            client.commands.set(reloadedCommand.config?.name || reloadedCommand.data?.name, reloadedCommand);
            console.log(boldText(gradientText(`[ ${commandName} ] Command reloaded successfully.`, 'lime')));
            return true;
        } catch (error) {
            console.error(boldText(gradientText(`❌ Failed to reload command [ ${commandName} ]: ${error.message}`, 'lime')));
            return false;
        }
    }
};

// --- Ready ---
client.once('ready', async () => {
    console.log(boldText(gradientText(`Logged in as ${client.user.tag}`, 'lime')));
    loadCommands(client);
    await loadSlashCommands(client);
    loadEvents(client);
    console.log(boldText(gradientText("━━━━━━━━━━[ READY FOR USE ✅ ]━━━━━━━━━━━━", 'lime')));
});

// --- Interaction handler (buttons + slash commands) ---
client.on('interactionCreate', async interaction => {
    // Buttons
    if (interaction.isButton()) {
        const roleMap = {
            secret_role: '1427517229129404477',
            godly_role: '1427517104780869713',
            grand_master: '1427560078411563059',
            great_pumpkin: '1427560648673595402',
            levelup_lollipop: '1427560940068536320'
        };
        const roleId = roleMap[interaction.customId];
        if (!roleId) return;

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            let action = '';
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                action = 'removed';
            } else {
                await member.roles.add(roleId);
                action = 'added';
            }
            await interaction.reply({ content: `✅ Role <@&${roleId}> successfully ${action}!`, ephemeral: true });
        } catch (err) {
            console.error('❌ Error updating roles:', err);
            await interaction.reply({ content: '❌ Failed to update roles. Check permissions.', ephemeral: true });
        }
        return;
    }

    // Slash commands
    if (interaction.isCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); } 
        catch (error) { 
            console.error(`❌ Error executing slash command [${interaction.commandName}]:`, error);
            await interaction.reply({ content: `❌ | ${error.message}`, ephemeral: true });
        }
    }
});

// --- MessageCreate handler (prefix commands + auto-detect) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // --- AUTO-DETECT BADWORDS / RACIST TERMS ---
    try {
        await warnModule.handleEvent({ message });
    } catch (err) {
        console.error('❌ Error in auto-detect:', err);
    }

    // --- LOG MESSAGE ---
    logDiscordMessage(message);

    // --- PREFIX COMMAND HANDLER ---
    const isMention = message.mentions.has(client.user);
    const hasPrefix = message.content.startsWith(config.prefix);
    let content = message.content.trim();

    if (isMention) content = content.replace(new RegExp(`^<@!?${client.user.id}>`), '').trim();
    if (hasPrefix) content = content.slice(config.prefix.length).trim();
    if (!content) return;

    const args = content.split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));
    if (!command) return;

    const cooldownKey = `${message.author.id}-${command.config?.name}`;
    const cooldownTime = command.config?.cooldown || 0;

    if (cooldowns.has(cooldownKey)) {
        const expirationTime = cooldowns.get(cooldownKey) + cooldownTime * 1000;
        const now = Date.now();
        if (now < expirationTime) {
            const remainingTime = ((expirationTime - now) / 1000).toFixed(1);
            const cooldownEmbed = {
                color: Colors.Blurple,
                title: "⏳ Command Cooldown",
                description: `Hey **${message.author.username}**, the command **"${command.config.name}"** is on cooldown!\nPlease try again in **${remainingTime} seconds**.`,
                timestamp: new Date(),
                footer: { text: "Cooldown System", icon_url: client.user.displayAvatarURL() }
            };
            const cooldownMsg = await message.reply({ embeds: [cooldownEmbed] });
            setTimeout(() => cooldownMsg.delete().catch(() => {}), 30000);
            return;
        }
    }

    cooldowns.set(cooldownKey, Date.now());
    logCommandExecution(message, command, args);

    try { await command.letStart({ args, message, discord: { client } }); } 
    catch (error) { console.error(`❌ Error executing command: ${error.message}`); message.reply(`❌ | ${error.message}`); }

    if (cooldownTime > 0) setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime * 1000);
});

// --- Global error handler ---
process.on('unhandledRejection', (reason) => console.error('Unhandled Promise Rejection:', reason));

// --- Login bot ---
client.login(config.token);