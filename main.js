// main.js
const { Client, GatewayIntentBits, Collection, Colors } = require('discord.js');
const gradient = require('gradient-string');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const config = require('./config.js'); // Make sure TOKEN is here
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { logDiscordMessage, logCommandExecution } = require('./utils/logger');

// --- Discord client setup ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.events = new Collection();
const cooldowns = new Map();

// --- Database setup ---
const dbPath = path.join(__dirname, 'database/json');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const loadDatabase = (fileName) => {
    const filePath = path.join(dbPath, `${fileName}.json`);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const saveDatabase = (fileName, data) => {
    const filePath = path.join(dbPath, `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const stickers = loadDatabase('stickers');
const users = loadDatabase('users');
const servers = loadDatabase('servers');
const emoji = loadDatabase('emoji');

// --- Gradient utils ---
const gradients = {
    lime: gradient('#32CD32', '#ADFF2F'),
    cyan: gradient('#00FFFF', '#00BFFF')
};
const gradientText = (text, color) => (gradients[color] ? gradients[color](text) : text);
const boldText = (text) => chalk.bold(text);

// --- Global reload helper ---
global.cc = {
    reloadCommand: function (commandName) {
        try {
            delete require.cache[require.resolve(`./modules/commands/${commandName}.js`)];
            const reloadedCommand = require(`./modules/commands/${commandName}.js`);
            client.commands.set(reloadedCommand.config.name, reloadedCommand);
            console.log(boldText(gradientText(`[ ${commandName} ] Command reloaded successfully.`, 'lime')));
            return true;
        } catch (error) {
            console.error(boldText(gradientText(`❌ Failed to reload command [ ${commandName} ]: ${error.message}`, 'lime')));
            return false;
        }
    }
};

// --- Discord ready event ---
client.once('ready', async () => {
    console.log(boldText(gradientText("━━━━━━━━━━[ BOT DEPLOYMENT STARTED ]━━━━━━━━━━━━", 'lime')));
    console.log(boldText(gradientText(`Logged in as ${client.user.tag}`, 'lime')));
    console.log(boldText(gradientText("━━━━━━━━━━[ LOADING COMMANDS & EVENTS ]━━━━━━━━━━━━", 'cyan')));

    // Load all local commands, slash commands, and events
    loadCommands(client);
    await loadSlashCommands(client);
    loadEvents(client);

    console.log(boldText(gradientText("[ DEPLOY COMPLETE ]", 'lime')));
    console.log(gradient.cristal(`╔════════════════════`));          
    console.log(gradient.cristal(`║ BotName: ${client.user.tag}`));  
    console.log(gradient.cristal(`║ Prefix: ${config.prefix}`));  
    console.log(gradient.cristal(`╚════════════════════`));          

    // --- Global slash command registration ---
    try {
        console.log(gradientText("\n🧹 Clearing old global slash commands...", 'cyan'));
        await client.application.commands.set([]); // Clears all old global commands

        const commands = client.slashCommands.map(command => {
            if (command.data) {
                return {
                    name: command.data.name,
                    description: command.data.description,
                    options: command.data.options || [],
                };
            }
            return {};
        });

        console.log(gradientText(`🚀 Registering ${commands.length} global commands...`, 'lime'));
        await client.application.commands.set(commands);

        console.log(boldText(gradientText("\n✅ Global slash commands registered successfully!", 'lime')));
    } catch (error) {
        console.error(boldText(gradientText(`❌ Failed to register global commands: ${error.message}`, 'red')));
    }

    console.log(boldText(gradientText("━━━━━━━━━━[ READY FOR USE ✅ ]━━━━━━━━━━━━", 'lime')));
});

// --- Message handling (prefix commands) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    logDiscordMessage(message);

    const isMention = message.mentions.has(client.user);
    const hasPrefix = message.content.startsWith(config.prefix);

    let content = message.content.trim();
    if (isMention) content = content.replace(new RegExp(`^<@!?${client.user.id}>`), '').trim();
    if (hasPrefix) content = content.slice(config.prefix.length).trim();
    if (!content) return;

    const args = content.split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.config.aliases?.includes(commandName));

    if (command) {
        if ((command.config.usePrefix === false) || (command.config.usePrefix && hasPrefix) || isMention) {
            const cooldownKey = `${message.author.id}-${command.config.name}`;
            const cooldownTime = command.config.cooldown || 0;

            if (cooldowns.has(cooldownKey)) {
                const expirationTime = cooldowns.get(cooldownKey) + cooldownTime * 1000;
                const now = Date.now();

                if (now < expirationTime) {
                    const remainingTime = ((expirationTime - now) / 1000).toFixed(1);
                    const cooldownEmbed = {
                        color: Colors.Blurple,
                        title: "⏳ Command Cooldown",
                        description: `Hey **${message.author.username}**, the command **"${command.config.name}"** is on cooldown!\n\nPlease try again in **${remainingTime} seconds**.`,
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

            try {
                await command.letStart({ args, message, discord: { client } });
            } catch (error) {
                console.error(`❌ Error executing command: ${error.message}`);
                message.reply(`❌ | ${error.message}`);
            }

            if (cooldownTime > 0) setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime * 1000);
        }
    }
});

// --- Slash commands handling ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.slashCommands.get(interaction.commandName);
    if (command) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Error executing slash command [${interaction.commandName}]:`, error);
            interaction.reply({ content: `❌ | ${error.message}`, ephemeral: true });
        }
    }
});

// --- Error handling ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
});

// --- Login Discord ---
client.login(config.token);

// --- Optional: Express health check for Render ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));