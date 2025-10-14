// main.js
const { Client, GatewayIntentBits, Collection, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const gradient = require('gradient-string');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const config = require('./config.js'); // Token at prefix
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { logDiscordMessage, logCommandExecution } = require('./utils/logger');
const { getData, setData } = require('./database.js'); // Database module

// --- Discord client setup ---
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
            client.commands.set(reloadedCommand.config?.name || reloadedCommand.data?.name, reloadedCommand);
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

    // Load commands, slash commands, events
    loadCommands(client);
    await loadSlashCommands(client);
    loadEvents(client);

    console.log(boldText(gradientText("[ DEPLOY COMPLETE ]", 'lime')));

    // --- Register global slash commands ---
    try {
        console.log(gradientText("\n🧹 Clearing old global slash commands...", 'cyan'));
        await client.application.commands.set([]);

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

    // --- Send role selection buttons ONLY ONCE per guild ---
    try {
        const stockChannelId = '1426904690343284847'; // fixed channel
        const allGuildData = await getData('pvb_roles') || {};
        for (const guild of client.guilds.cache.values()) {
            const existingData = allGuildData[guild.id];
            if (!existingData || !existingData.messageId) {
                const channel = guild.channels.cache.get(stockChannelId);
                if (!channel || !channel.isTextBased()) continue;

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('secret_role')
                            .setLabel('SECRET')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('godly_role')
                            .setLabel('GODLY')
                            .setStyle(ButtonStyle.Success)
                    );

                const msg = await channel.send({
                    content: `📢 **Choose your stock alert roles:**\nYou can select one or both roles by clicking below.`,
                    components: [row]
                });

                allGuildData[guild.id] = { messageId: msg.id, channelId: channel.id };
            }
        }

        await setData('pvb_roles', allGuildData);
        console.log('✅ Role selection message initialized.');
    } catch (err) {
        console.error('❌ Failed to send role selection message:', err);
    }

    // --- Resume PVBR Auto-stock after restart ---
    try {
        const allGuildData = await getData('pvbstock/discord') || {};
        for (const guildId in allGuildData) {
            const gcData = allGuildData[guildId];
            if (gcData.enabled && gcData.channelId) {
                try {
                    const guild = await client.guilds.fetch(guildId);
                    const channel = await guild.channels.fetch(gcData.channelId);
                    if (channel && channel.isTextBased()) {
                        const command = client.slashCommands.get('pvbstock');
                        if (command) command.startAutoStock(channel);
                        console.log(`✅ PVBR Auto-stock resumed for guild ${guildId} in channel ${channel.id}`);
                    }
                } catch (err) {
                    console.error(`❌ Failed to resume PVBR Auto-stock for guild ${guildId}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('❌ Error loading PVBR auto-stock database:', err);
    }

    console.log(boldText(gradientText("━━━━━━━━━━[ READY FOR USE ✅ ]━━━━━━━━━━━━", 'lime')));
});

// --- Button interaction handler ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const member = interaction.member;
        const rolesToAdd = [];
        if (interaction.customId === 'secret_role') rolesToAdd.push('1427517229129404477'); // Secret
        if (interaction.customId === 'godly_role') rolesToAdd.push('1427517104780869713'); // Godly

        try {
            for (const roleId of rolesToAdd) {
                if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
            }
            await interaction.reply({ content: `✅ You have been given your selected role(s)!`, ephemeral: true });
        } catch (err) {
            console.error('❌ Error assigning roles:', err);
            await interaction.reply({ content: '❌ Failed to assign roles.', ephemeral: true });
        }
        return;
    }

    if (!interaction.isCommand()) return;
    const command = client.slashCommands.get(interaction.commandName);
    if (command) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`❌ Error executing slash command [${interaction.commandName}]:`, error);
            await interaction.reply({ content: `❌ | ${error.message}`, ephemeral: true });
        }
    }
});

// --- Prefix command handler ---
client.on('messageCreate', async message => {
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
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.config?.aliases?.includes(commandName));

    if (command) {
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