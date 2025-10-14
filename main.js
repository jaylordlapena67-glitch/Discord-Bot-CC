const { Client, GatewayIntentBits, Collection, Colors } = require('discord.js');
const gradient = require('gradient-string');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8'));
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { logDiscordMessage, logCommandExecution } = require('./utils/logger');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
client.commands = new Collection();
client.slashCommands = new Collection();
client.events = new Collection(); // Ensure this is initialized correctly
const cooldowns = new Map();

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

const gradients = {
    lime: gradient('#32CD32', '#ADFF2F'),
    cyan: gradient('#00FFFF', '#00BFFF')
};

const gradientText = (text, color) => (gradients[color] ? gradients[color](text) : text);
const boldText = (text) => chalk.bold(text);

console.log(boldText(gradientText("Checking database......", 'cyan')));
console.log(boldText(gradientText("Utilized Database Loaded", 'lime')));

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

client.once('ready', async () => {
    console.log(boldText(gradientText("━━━━━━━━━━[ BOT DEPLOYMENT ]━━━━━━━━━━━━", 'lime')));
    console.log(boldText(gradientText(`Logged in as ${client.user.tag}`, 'lime')));
    console.log(boldText(gradientText("━━━━━━━━━━[ LOADING... ]━━━━━━━━━━━━", 'cyan')));

    loadCommands(client);
    await loadSlashCommands(client); // Load the slash commands
    loadEvents(client); // Load the events

    console.log(boldText(gradientText("[ DEPLOYED ALL SYSTEMS ]", 'lime')));
    console.log(gradient.cristal(`╔════════════════════`));          
    console.log(gradient.cristal(`║ BotName: ${client.user.tag}`));  
    console.log(gradient.cristal(`║ Prefix: ${config.prefix}`));  
    console.log(gradient.cristal(`╚════════════════════`));          

    console.log(boldText(gradientText("Database Status Discord", 'cyan')));
    console.log(gradientText(`Users: ${users.length}`, 'lime'));
    console.log(gradientText(`Stickers: ${stickers.length}`, 'lime'));
    console.log(gradientText(`Emoji: ${emoji.length}`, 'lime'));

    try {
        const guilds = client.guilds.cache.map(guild => guild.id);
        for (const guildId of guilds) {
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

            await client.application.commands.set(commands, guildId);
        }
        console.log(boldText(gradientText("✅ Slash commands registered successfully.", 'lime')));
    } catch (error) {
        console.error(boldText(gradientText(`❌ Failed to register slash commands: ${error.message}`, 'red')));
    }
});

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
                    setTimeout(() => {
                        cooldownMsg.delete().catch(() => {});
                    }, 30000);

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

            if (cooldownTime > 0) {
                setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime * 1000);
            }
        }
    }
});

client.on('interactionCreate', async (interaction) => {
    console.log(`Interaction received: ${interaction.commandName}`);
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
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
});
client.login(config.token);

/*if (config.autorestart) {
    setInterval(() => process.exit(1), config.autorestart * 3600000);*/
