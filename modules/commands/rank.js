const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require("discord.js");
const { setData, getData } = require("../../database.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();
const PREFIX = "-"; // Bot prefix

// XP per message
const XP_PER_MESSAGE = 5;

// Styled level names with emojis
const LEVEL_NAMES = [
  "🌱 Rookie",
  "🌿 Newcomer",
  "🌾 Protege",
  "🌻 Journeyer",
  "🌳 Adventurer",
  "🌸 Spartan",
  "🏵️ Champion",
  "🌹 Guardian",
  "🍀 Conqueror",
  "🍄 Hero",
  "🌺 Master",
  "🌴 Legend",
  "🪴 Sovereign",
  "🏵️ Emperor",
  "🌾 Legendary King",
  "👑 𝗢𝗪𝗡𝗘𝗥",       // Special roles start
  "🛡️ 𝗔𝗗𝗠𝗜𝗡",
  "🔧 𝗠𝗢𝗗𝗘𝗥𝗔𝗧𝗢𝗥",
  "⚔️ 𝗠𝗜𝗗𝗠𝗔𝗡"
];

// Quadratic XP growth
function getXPForLevel(level) {
  return 100 * (level ** 2) + 100;
}

// Determine current level
function getLevelForXP(xp) {
  let level = 0;
  while (xp >= getXPForLevel(level + 1)) level++;
  return level;
}

function getRoleNameForLevel(level) {
  return LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length - 1)];
}

// Ensure role exists & set hierarchy
async function ensureRoleExistsWithHierarchy(guild, roleName, level) {
  let role = guild.roles.cache.find(r => r.name === roleName);

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: "Green",
      reason: "Level up role auto-created"
    }).catch(() => null);
  }

  if (!role) return null;

  // Base position (adjust if you have other server roles)
  const basePosition = 10;
  const newPosition = basePosition + level;

  if (role.position !== newPosition) {
    await role.setPosition(newPosition).catch(() => {});
  }

  return role;
}

// Special user IDs for automatic role assignment
const OWNER_IDS = ["YOUR_OWNER_ID"];
const ADMIN_IDS = ["YOUR_ADMIN_ID"];
const MOD_IDS = ["YOUR_MOD_ID"];
const MIDMAN_IDS = ["YOUR_MIDMAN_ID"];

async function assignSpecialRole(member) {
  if (OWNER_IDS.includes(member.id)) {
    let role = await ensureRoleExistsWithHierarchy(member.guild, "👑 𝗢𝗪𝗡𝗘𝗥", 999);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
  } else if (ADMIN_IDS.includes(member.id)) {
    let role = await ensureRoleExistsWithHierarchy(member.guild, "🛡️ 𝗔𝗗𝗠𝗜𝗡", 998);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
  } else if (MOD_IDS.includes(member.id)) {
    let role = await ensureRoleExistsWithHierarchy(member.guild, "🔧 𝗠𝗢𝗗𝗘𝗥𝗔𝗧𝗢𝗥", 997);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
  } else if (MIDMAN_IDS.includes(member.id)) {
    let role = await ensureRoleExistsWithHierarchy(member.guild, "⚔️ 𝗠𝗜𝗗𝗠𝗔𝗡", 996);
    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role);
  }
}

// On member join → assign special roles
client.on("guildMemberAdd", async (member) => {
  await assignSpecialRole(member);
});

// On message → gain XP
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const dataPath = `xp/${guildId}/${userId}`;
  let userData = (await getData(dataPath)) || { xp: 0 };

  // Add XP
  userData.xp += XP_PER_MESSAGE;

  // Determine level
  const newLevel = getLevelForXP(userData.xp);
  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const roleName = getRoleNameForLevel(newLevel);

  // Ensure role exists with hierarchy
  const role = await ensureRoleExistsWithHierarchy(message.guild, roleName, newLevel);
  if (!role) return;

  // Remove old level roles
  const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
  if (oldRoles.size) await member.roles.remove(oldRoles, "Level up role updated");

  // Add new role if not present
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Level up");

    // Level up notification
    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle(`🎉 Level Up!`)
      .setDescription(`<@${userId}> is now **${role.name}**!`)
      .addFields(
        { name: "Level", value: `${newLevel}`, inline: true },
        { name: "XP for next level", value: `${getXPForLevel(newLevel + 1)} XP`, inline: true }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  }

  // Save XP
  await setData(dataPath, userData);

  // Handle prefix commands
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    await command.letStart({ message, args });
  } catch (err) {
    console.error("Command error:", err);
    await message.reply("❌ Something went wrong executing that command.");
  }
});

// Command: -rank
client.commands.set("rank", {
  letStart: async ({ message }) => {
    const target = message.mentions.users.first() || message.author;
    const guildId = message.guild.id;

    const userData = (await getData(`xp/${guildId}/${target.id}`)) || { xp: 0 };
    const level = getLevelForXP(userData.xp);
    const roleName = getRoleNameForLevel(level);

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle(`🏆 ${target.tag}'s Rank`)
      .setDescription(`**Role:** ${roleName}\n**Level:** ${level}\n**XP:** ${userData.xp}\n**XP for next level:** ${getXPForLevel(level + 1)} XP`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  }
});

module.exports = client;