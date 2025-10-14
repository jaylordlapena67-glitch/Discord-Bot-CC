const { Client, GatewayIntentBits, Collection, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const gradient = require('gradient-string');
const chalk = require('chalk');
const config = require('./config.js');
const { loadCommands, loadSlashCommands } = require('./utils/commandLoader');
const loadEvents = require('./utils/eventLoader');
const { logDiscordMessage, logCommandExecution } = require('./utils/logger');
const { getData, setData } = require('./database.js');

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

// --- Gradient helpers ---
const gradients = { lime: gradient('#32CD32', '#ADFF2F'), cyan: gradient('#00FFFF', '#00BFFF') };
const gradientText = (text, color) => (gradients[color] ? gradients[color](text) : text);
const boldText = (text) => chalk.bold(text);

// --- Reload helper ---
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

// --- On Ready ---
client.once('ready', async () => {
    console.log(boldText(gradientText("━━━━━━━━━━[ BOT DEPLOYMENT STARTED ]━━━━━━━━━━━━", 'lime')));
    console.log(boldText(gradientText(`Logged in as ${client.user.tag}`, 'lime')));

    loadCommands(client);
    await loadSlashCommands(client);
    loadEvents(client);

    console.log(boldText(gradientText("[ DEPLOY COMPLETE ]", 'lime')));

    // --- Register global slash commands ---
    try {
        console.log(gradientText("\n🧹 Clearing old global slash commands...", 'cyan'));
        await client.application.commands.set([]);

        const commands = client.slashCommands.map(command => ({
            name: command.data.name,
            description: command.data.description,
            options: command.data.options || [],
        }));

        console.log(gradientText(`🚀 Registering ${commands.length} global commands...`, 'lime'));
        await client.application.commands.set(commands);
        console.log(boldText(gradientText("\n✅ Global slash commands registered successfully!", 'lime')));
    } catch (error) {
        console.error(boldText(gradientText(`❌ Failed to register global commands: ${error.message}`, 'red')));
    }

    // --- Send role selection messages ---
    try {
        const pvbChannelId = '1426904690343284847'; // PVBR role picker
        const gagChannelId = '1426904612861902868'; // GAG role picker
        const allGuildData = await getData('pvb_roles') || {};

        for (const guild of client.guilds.cache.values()) {
            // PVBR roles
            const existingPvb = allGuildData[guild.id]?.pvb;
            const pvbChannel = guild.channels.cache.get(pvbChannelId);
            if (pvbChannel && pvbChannel.isTextBased() && !existingPvb?.messageId) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('secret_role').setLabel('SECRET').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('godly_role').setLabel('GODLY').setStyle(ButtonStyle.Success)
                );

                const msg = await pvbChannel.send({
                    content: `📢 **Choose your PVBR stock alert roles:**\nSelect one or both roles below.`,
                    components: [row]
                });

                allGuildData[guild.id] = { ...allGuildData[guild.id], pvb: { messageId: msg.id, channelId: pvbChannel.id } };
            }

            // GAG roles
            const existingGag = allGuildData[guild.id]?.gag;
            const gagChannel = guild.channels.cache.get(gagChannelId);
            if (gagChannel && gagChannel.isTextBased() && !existingGag?.messageId) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('grand_master').setLabel('Grand Master').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('great_pumpkin').setLabel('Great Pumpkin').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('levelup_lollipop').setLabel('Level-Up Lollipop').setStyle(ButtonStyle.Danger)
                );

                const msg = await gagChannel.send({
                    content: `📢 **Choose your GAG stock alert roles:**\nSelect the role you want to be pinged for.`,
                    components: [row]
                });

                allGuildData[guild.id] = { ...allGuildData[guild.id], gag: { messageId: msg.id, channelId: gagChannel.id } };
            }
        }

        await setData('pvb_roles', allGuildData);
        console.log('✅ Role selection messages initialized.');
    } catch (err) {
        console.error('❌ Failed to send role selection messages:', err);
    }

    console.log(boldText(gradientText("━━━━━━━━━━[ READY FOR USE ✅ ]━━━━━━━━━━━━", 'lime')));
});

// --- Button interaction handler ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const member = interaction.member;
        const rolesToAdd = [];

        // PVBR
        if (interaction.customId === 'secret_role') rolesToAdd.push('1427517229129404477');
        if (interaction.customId === 'godly_role') rolesToAdd.push('1427517104780869713');

        // GAG
        if (interaction.customId === 'grand_master') rolesToAdd.push('1427560078411563059');
        if (interaction.customId === 'great_pumpkin') rolesToAdd.push('1427560648673595402');
        if (interaction.customId === 'levelup_lollipop') rolesToAdd.push('1427560940068536320');

        try {
            for (const roleId of rolesToAdd) {
                if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
                else await member.roles.add(roleId);
            }
            await interaction.reply({ content: `✅ Role(s) updated successfully!`, ephemeral: true });
        } catch (err) {
            console.error('❌ Error assigning/removing roles:', err);
            await interaction.reply({ content: '❌ Failed to update roles.', ephemeral: true });
        }
        return;
    }

    // Slash command handler
    if (!interaction.isCommand()) return;
    const command = client.slashCommands.get(interaction.commandName);
    if (command) {
        try { await command.execute(interaction); } 
        catch (error) { console.error(`❌ Error executing slash command [${interaction.commandName}]:`, error); await interaction.reply({ content: `❌ | ${error.message}`, ephemeral: true }); }
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

        try { await command.letStart({ args, message, discord: { client } }); } 
        catch (error) { console.error(`❌ Error executing command: ${error.message}`); message.reply(`❌ | ${error.message}`); }

        if (cooldownTime > 0) setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime * 1000);
    }
});

// --- Error handler ---
process.on('unhandledRejection', (reason) => { console.error('Unhandled Promise Rejection:', reason); });

// --- Start bot ---
client.login(config.token);

// --- Render health check ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));