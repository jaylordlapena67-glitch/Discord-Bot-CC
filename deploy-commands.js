const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.js'); // Your token & client ID

const token = config.token;
const clientId = config.client_id;
const guildId = '1426904103534985317'; // <-- Replace with your test server ID

const commands = [];

// Automatically load all slash commands from modules/commands
const commandsPath = path.join(__dirname, 'modules', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️ Skipped file (no slash command data): ${file}`);
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), // Guild commands appear instantly
            { body: commands },
        );

        console.log('✅ Successfully registered all slash commands.');
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
})();