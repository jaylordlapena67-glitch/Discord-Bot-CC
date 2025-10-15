const { EmbedBuilder } = require("discord.js");
const { setData, getData } = require("../../database.js");

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

// Exponential XP growth (scales high for later levels)
function getXPForLevel(level) {
  // Base XP multiplied by exponential growth
  return Math.floor(100 * Math.pow(level, 2.5)) + 100;
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

  const basePosition = 10;
  const newPosition = basePosition + level;

  if (role.position !== newPosition) {
    await role.setPosition(newPosition).catch(() => {});
  }

  return role;
}

module.exports = {
  config: {
    name: "rank",
    description: "Check your level and role",
    usage: "rank | rank <@user>",
    cooldown: 5,
    permission: 0,
    usePrefix: true
  },

  letStart: async function({ message, args }) {
    const guildId = message.guild.id;
    const target = message.mentions.users.first() || message.author;
    const userId = target.id;

    const dataPath = `xp/${guildId}/${userId}`;
    let userData = (await getData(dataPath)) || { xp: 0 };

    // Add XP for sender if they are checking themselves
    if (target.id === message.author.id) {
      userData.xp += XP_PER_MESSAGE;
      await setData(dataPath, userData);
    }

    const level = getLevelForXP(userData.xp);
    const roleName = getRoleNameForLevel(level);

    // Assign role if not present
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      const role = await ensureRoleExistsWithHierarchy(message.guild, roleName, level);
      if (role && !member.roles.cache.has(role.id)) {
        // Remove old level roles
        const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
        if (oldRoles.size) await member.roles.remove(oldRoles, "Level up role updated");
        await member.roles.add(role, "Level up");
      }
    }

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle(`🏆 ${target.tag}'s Rank`)
      .setDescription(`**Role:** ${roleName}\n**Level:** ${level}\n**XP:** ${userData.xp}\n**XP for next level:** ${getXPForLevel(level + 1)} XP`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  }
};