const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { setData, getData } = require("../../database.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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
  "🌾 Legendary King"
];

// Priority roles and their emojis
const PRIORITY_ROLES = {
  "Owner": "👑",
  "Admin": "🛡️",
  "Moderator": "🔧",
  "Midman": "⚔️"
};

// Exponential XP growth
function getXPForLevel(level) {
  return Math.floor(100 * Math.pow(level, 2.5)) + 100;
}

function getLevelForXP(xp) {
  let level = 0;
  while (xp >= getXPForLevel(level + 1)) level++;
  return level;
}

function getRoleNameForLevel(level) {
  return LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length - 1)];
}

// Ensure role exists & hierarchy
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

  const basePosition = 10;
  const newPosition = basePosition + level;
  if (role.position !== newPosition) await role.setPosition(newPosition).catch(() => {});
  return role;
}

// Update nickname with priority role emojis + level emoji
async function updateNicknameWithRoles(member, levelEmoji) {
  let emojis = [];
  for (const [roleName, emoji] of Object.entries(PRIORITY_ROLES)) {
    if (member.roles.cache.some(r => r.name === roleName)) emojis.push(emoji);
  }

  const nicknameBase = member.user.username; // use username, not current nickname
  const newNick = `${nicknameBase} ${emojis.join("")} ${levelEmoji}`.trim().substring(0, 32); // Discord limit
  if (member.nickname !== newNick) {
    await member.setNickname(newNick).catch(() => {});
  }
}

// On bot ready → sync all members
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(async guild => {
    const members = await guild.members.fetch();
    members.forEach(async member => {
      const guildId = guild.id;
      const userId = member.id;
      const userData = (await getData(`xp/${guildId}/${userId}`)) || { xp: 0 };
      const level = getLevelForXP(userData.xp);
      const roleName = getRoleNameForLevel(level);
      const levelEmoji = roleName.split(" ")[0];

      const role = await ensureRoleExistsWithHierarchy(guild, roleName, level);
      if (role && !member.roles.cache.has(role.id)) {
        const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
        if (oldRoles.size) await member.roles.remove(oldRoles, "Level up role updated");
        await member.roles.add(role, "Level up sync");
      }

      await updateNicknameWithRoles(member, levelEmoji);
    });
  });
});

// On message → gain XP
client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const dataPath = `xp/${guildId}/${userId}`;
  let userData = (await getData(dataPath)) || { xp: 0 };

  userData.xp += XP_PER_MESSAGE;
  await setData(dataPath, userData);

  const level = getLevelForXP(userData.xp);
  const roleName = getRoleNameForLevel(level);
  const levelEmoji = roleName.split(" ")[0];

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const role = await ensureRoleExistsWithHierarchy(message.guild, roleName, level);
  if (role && !member.roles.cache.has(role.id)) {
    const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
    if (oldRoles.size) await member.roles.remove(oldRoles, "Level up role updated");
    await member.roles.add(role, "Level up");
  }

  await updateNicknameWithRoles(member, levelEmoji);
});

// New member joins
client.on("guildMemberAdd", async member => {
  const guildId = member.guild.id;
  const userId = member.id;

  const userData = (await getData(`xp/${guildId}/${userId}`)) || { xp: 0 };
  const level = getLevelForXP(userData.xp);
  const roleName = getRoleNameForLevel(level);
  const levelEmoji = roleName.split(" ")[0];

  const role = await ensureRoleExistsWithHierarchy(member.guild, roleName, level);
  if (role && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Assign level role on join");
  }

  await updateNicknameWithRoles(member, levelEmoji);
});

// Command: -rank
client.commands = new Map();
client.commands.set("rank", {
  letStart: async ({ message }) => {
    const target = message.mentions.users.first() || message.author;
    const guildId = message.guild.id;
    const userId = target.id;

    const userData = (await getData(`xp/${guildId}/${userId}`)) || { xp: 0 };
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