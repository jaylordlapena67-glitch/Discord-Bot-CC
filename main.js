const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials } = require("discord.js");
const { getData, setData } = require("../../database.js");
const warnModule = require("../events/autoWarning.js");
const config = require("../../config.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ✅ Role button channel IDs
const GAG_CHANNEL_ID = "1426904612861902868";
const PVB_CHANNEL_ID = "1426904690343284847";

// ✅ Function to create role buttons
async function sendRoleButtons(channel, type) {
    const embed = new EmbedBuilder()
        .setTitle(type === "gag" ? "🎮 GAG Role Selector" : "🌽 PVB Role Selector")
        .setDescription("Click a button below to get your role!")
        .setColor(type === "gag" ? 0x2ecc71 : 0x3498db);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${type}_join`)
            .setLabel(`Join ${type.toUpperCase()}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`${type}_leave`)
            .setLabel(`Leave ${type.toUpperCase()}`)
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
}

// ✅ Auto check & resend role buttons if missing
async function ensureRoleButtons() {
    const gagChannel = await client.channels.fetch(GAG_CHANNEL_ID).catch(() => null);
    const pvbChannel = await client.channels.fetch(PVB_CHANNEL_ID).catch(() => null);
    if (!gagChannel || !pvbChannel) return;

    const gagMessages = await gagChannel.messages.fetch({ limit: 10 });
    const pvbMessages = await pvbChannel.messages.fetch({ limit: 10 });

    const gagHasButtons = gagMessages.some(m => m.components?.length > 0);
    const pvbHasButtons = pvbMessages.some(m => m.components?.length > 0);

    if (!gagHasButtons) await sendRoleButtons(gagChannel, "gag");
    if (!pvbHasButtons) await sendRoleButtons(pvbChannel, "pvb");
}

// ✅ Handle role button interactions
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, member } = interaction;
    const type = customId.includes("gag") ? "gag" : "pvb";
    const roleName = type.toUpperCase();
    const role = interaction.guild.roles.cache.find(r => r.name === roleName);

    if (!role) return interaction.reply({ content: `⚠️ Role **${roleName}** not found!`, ephemeral: true });

    if (customId.endsWith("join")) {
        await member.roles.add(role);
        return interaction.reply({ content: `✅ Added **${roleName}** role!`, ephemeral: true });
    } else if (customId.endsWith("leave")) {
        await member.roles.remove(role);
        return interaction.reply({ content: `❎ Removed **${roleName}** role.`, ephemeral: true });
    }
});

// ✅ Member count update every join/leave
async function updateMemberCount(guild) {
    const channel = guild.channels.cache.find(c => c.name.toLowerCase().includes("member-count"));
    if (channel) {
        await channel.setName(`👥 Members: ${guild.memberCount}`).catch(() => {});
    }
}

client.on("guildMemberAdd", async member => updateMemberCount(member.guild));
client.on("guildMemberRemove", async member => updateMemberCount(member.guild));

// ✅ Auto react to "WFL" type messages
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    // Detect “win lose”, “win or lose”, “w/f/l”, “wfl”, etc.
    const wflRegex = /\b(?:win\s*or\s*lose|win\s*lose|w[\s\/\.\-]*f[\s\/\.\-]*l)\b/i;

    if (wflRegex.test(message.content)) {
        try {
            await message.react('🇼');
            await message.react('🇫');
            await message.react('🇱');
        } catch (err) {
            console.error('❌ Error reacting to WFL message:', err);
        }
    }

    // Auto warning (if you have auto-warning module)
    try {
        await warnModule.handleEvent({ message });
    } catch (err) {
        console.error('Auto-detect error:', err);
    }

    // Command handler
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

// ✅ On ready
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await ensureRoleButtons();
    client.setInterval(ensureRoleButtons, 60_000 * 5); // check every 5 minutes
});

client.login(config.token);