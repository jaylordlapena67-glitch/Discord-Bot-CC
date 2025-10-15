const { EmbedBuilder, Colors } = require("discord.js");
const { setData, getData } = require("../../database.js");

// XP per message
const XP_PER_MESSAGE = 5;

// Styled level names with emojis
const LEVEL_NAMES = [
  "🌱 Rookie",
  "🌿 Newcomer",
  "🌾 Wanderer",
  "🌻 Explorer",
  "🌳 Adventurer",
  "🌸 Guardian",
  "🏵️ Elite",
  "🌹 Champion",
  "🍀 Master",
  "🍄 Hero",
  "🌺 Grandmaster",
  "🌴 Legend",
  "🪴 Mythic",
  "🏵️ Ascendant",
  "🌾 Legendary King"
];

// Exponential XP scaling (big jumps for higher levels)
function getXPForLevel(level) {
  return Math.floor(200 * Math.pow(level, 2.7)) + 200; // more XP scaling
}

// Calculate level from XP
function getLevelForXP(xp) {
  let level = 0;
  while (xp >= getXPForLevel(level + 1)) level++;
  return level;
}

// Get role name by level
function getRoleNameForLevel(level) {
  return LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length - 1)];
}

// === Create role + hierarchy ===
async function ensureRoleExistsWithHierarchy(guild, roleName, level) {
  const colors = [
    "#9ef01a", "#70e000", "#38b000", "#008000", "#007200",
    "#004b23", "#005f73", "#0a9396", "#94d2bd", "#ee9b00",
    "#ca6702", "#bb3e03", "#ae2012", "#9b2226", "#720026"
  ];

  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: colors[level % colors.length],
      reason: "Auto-created level-up role"
    }).catch(() => null);
  }

  if (!role) return null;

  // maintain hierarchy (higher level = higher position)
  const basePos = 5;
  const targetPos = basePos + level;
  if (role.position !== targetPos) {
    await role.setPosition(targetPos).catch(() => {});
  }

  return role;
}

module.exports = {
  config: {
    name: "rank",
    description: "Check your level and XP progress",
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

    // Add XP for the sender (only for themselves)
    if (target.id === message.author.id) {
      userData.xp += XP_PER_MESSAGE;
      await setData(dataPath, userData);
    }

    const level = getLevelForXP(userData.xp);
    const nextLevelXP = getXPForLevel(level + 1);
    const roleName = getRoleNameForLevel(level);

    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      const role = await ensureRoleExistsWithHierarchy(message.guild, roleName, level);
      if (role && !member.roles.cache.has(role.id)) {
        // remove previous level roles
        const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
        if (oldRoles.size > 0) await member.roles.remove(oldRoles, "Level-up role replaced");
        await member.roles.add(role, "Level-up progression");
      }
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`🏆 ${target.username}'s Rank`)
      .setDescription(
        `**Role:** ${roleName}\n` +
        `**Level:** ${level}\n` +
        `**XP:** ${userData.xp} / ${nextLevelXP}\n` +
        `**Progress:** ${(userData.xp / nextLevelXP * 100).toFixed(1)}%`
      )
      .setFooter({ text: "Keep chatting to level up!" })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  }
};