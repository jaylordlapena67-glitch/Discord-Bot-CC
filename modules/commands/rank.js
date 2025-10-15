const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events
} = require("discord.js");
const { setData, getData } = require("../../database.js");

const XP_PER_MESSAGE = 5;

// Role names with emojis
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

// Special roles (by ID) and their emojis
const SPECIAL_ROLES = {
  "1427447542475657278": "👑", // Owner
  "1427959238705025175": "🛡️", // Admin
  "1427959010111393854": "🔰", // Moderator
  "1427974807672328254": "⚔️"  // Midman
};

// XP growth curve
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

// Create or update level role hierarchy
async function ensureRoleExists(guild, roleName, level) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: "Green",
      reason: "Level role auto-created"
    }).catch(() => null);
  }
  if (!role) return null;

  const basePosition = 10;
  const newPosition = basePosition + level;
  if (role.position !== newPosition) {
    await role.setPosition(newPosition).catch(() => {});
  }
  return role;
}

// Update nickname with emoji
async function updateNickname(member, roleName) {
  if (!member.manageable) return;

  let newName = member.user.username;

  // Add special role emoji (priority order)
  for (const [roleId, emoji] of Object.entries(SPECIAL_ROLES)) {
    if (member.roles.cache.has(roleId)) {
      newName += ` ${emoji}`;
      break;
    }
  }

  // Add level emoji
  const levelEmoji = roleName.split(" ")[0];
  newName += ` ${levelEmoji}`;

  if (member.nickname !== newName) {
    await member.setNickname(newName).catch(() => {});
  }
}

// Command
module.exports = {
  config: {
    name: "rank",
    description: "Check your level and role",
    usage: "rank | rank <@user>",
    cooldown: 5,
    permission: 0,
    usePrefix: true
  },

  letStart: async function ({ message }) {
    const guildId = message.guild.id;
    const target = message.mentions.users.first() || message.author;
    const userId = target.id;

    const dataPath = `xp/${guildId}/${userId}`;
    let userData = (await getData(dataPath)) || { xp: 0 };

    // Add XP for the sender
    if (target.id === message.author.id) {
      userData.xp += XP_PER_MESSAGE;
      await setData(dataPath, userData);
    }

    const level = getLevelForXP(userData.xp);
    const roleName = getRoleNameForLevel(level);

    // Update role and nickname
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      const role = await ensureRoleExists(message.guild, roleName, level);
      if (role && !member.roles.cache.has(role.id)) {
        const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
        if (oldRoles.size) await member.roles.remove(oldRoles, "Level role update");
        await member.roles.add(role, "Level up");
      }
      await updateNickname(member, roleName);
    }

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle(`🏆 ${target.username}'s Rank`)
      .setDescription(`**Role:** ${roleName}\n**Level:** ${level}\n**XP:** ${userData.xp}\n**Next Level:** ${getXPForLevel(level + 1)} XP`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },

  // Auto-update all nicknames on restart
  updateAllNicknames: async function (guild) {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      const guildId = guild.id;
      const userId = member.id;
      const dataPath = `xp/${guildId}/${userId}`;
      let userData = (await getData(dataPath)) || { xp: 0 };
      const level = getLevelForXP(userData.xp);
      const roleName = getRoleNameForLevel(level);
      await ensureRoleExists(guild, roleName, level);
      await updateNickname(member, roleName);
    }
  }
};

// Event: new member joins
module.exports.onMemberJoin = async function (member) {
  const guild = member.guild;
  const guildId = guild.id;
  const userId = member.id;
  const dataPath = `xp/${guildId}/${userId}`;

  let userData = (await getData(dataPath)) || { xp: 0 };
  await setData(dataPath, userData);

  const level = getLevelForXP(userData.xp);
  const roleName = getRoleNameForLevel(level);

  const role = await ensureRoleExists(guild, roleName, level);
  if (role && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Initial level role");
  }

  await updateNickname(member, roleName);
};