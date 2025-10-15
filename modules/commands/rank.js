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

// Exponential XP scaling
function getXPForLevel(level) {
  return Math.floor(200 * Math.pow(level, 2.7)) + 200;
}

function getLevelForXP(xp) {
  let level = 0;
  while (xp >= getXPForLevel(level + 1)) level++;
  return level;
}

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

  // Arrange hierarchy
  const botMember = await guild.members.fetchMe();
  const botHighestPos = botMember.roles.highest.position;
  const targetPos = botHighestPos - (LEVEL_NAMES.length - 1 - level);
  if (role.position !== targetPos && targetPos > 0) {
    await role.setPosition(targetPos).catch(() => {});
  }

  return role;
}

// === Assign level role to a member ===
async function assignLevelRole(member, xp) {
  const level = getLevelForXP(xp);
  const roleName = getRoleNameForLevel(level);
  const role = await ensureRoleExistsWithHierarchy(member.guild, roleName, level);
  if (!role) return;

  const oldRoles = member.roles.cache.filter(r => LEVEL_NAMES.includes(r.name) && r.id !== role.id);
  if (oldRoles.size > 0) await member.roles.remove(oldRoles, "Level-up role replaced");

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, "Level-up progression");
  }
}

// === Export command ===
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

    if (target.id === message.author.id) {
      userData.xp += XP_PER_MESSAGE;
      await setData(dataPath, userData);
    }

    await assignLevelRole(await message.guild.members.fetch(userId), userData.xp);

    const level = getLevelForXP(userData.xp);
    const nextLevelXP = getXPForLevel(level + 1);
    const roleName = getRoleNameForLevel(level);

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
  },

  // === Auto-assign all members on bot start ===
  autoAssignAllMembers: async function(guild) {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const dataPath = `xp/${guild.id}/${member.id}`;
      let userData = (await getData(dataPath)) || { xp: 0 };
      await assignLevelRole(member, userData.xp);
    }
    console.log(`✅ All members in ${guild.name} assigned level roles.`);
  }
};