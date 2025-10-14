const { PermissionsBitField } = require("discord.js");
const { setData, getData } = require("../../database.js");

const LOG_CHANNEL_ID = "1426904103534985317"; // Warning & mute logs channel
const MUTE_TIMES = [10*60*1000, 30*60*1000, 60*60*1000, 12*60*60*1000, 24*60*60*1000]; // 10m,30m,1h,12h,24h

const BADWORDS = [
  "tanga","bobo","gago","puta","pakyu","inutil","ulol",
  "fuck","shit","asshole","bitch","dumb","stupid","motherfucker",
  "laplap","pota","inamo","tangina","tang ina","kantut","kantot",
  "jakol","jakul","jabol","supot","blow job","blowjob","puke","puki"
];

const RACIST_WORDS = [
  "negro","nigger","chimp","nigga","baluga",
  "chink","indio","bakla","niga","bungal","beki","negra"
];

const MESSAGES = {
  badword: [
    "Please maintain respect in this server.",
    "Offensive words are not tolerated here.",
    "Language matters. Kindly watch your words.",
    "This is your warning for using bad language."
  ],
  racist: [
    "Racist or discriminatory remarks are strictly prohibited.",
    "Respect diversity. Avoid racist language.",
    "This server does not tolerate discrimination.",
    "Be mindful. Racist terms will not be accepted here."
  ]
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function addWarning(guildId, userId, type, note, channel) {
  const dataPath = `warnings/${guildId}/${userId}`;
  let warnings = (await getData(dataPath)) || { count: 0, reasons: [] };
  warnings.count = (warnings.count || 0) + 1;
  warnings.reasons.push({ type, note, time: Date.now() });
  await setData(dataPath, warnings);

  const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
  const msg = `⚠️ <@${userId}> has been warned for **${type}**.\nReason: ${note}\nWarnings: ${warnings.count}/5`;

  await channel.send({ content: msg });
  if (logChannel) await logChannel.send({ content: `📌 [LOG] ${msg}` });

  const member = await channel.guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  // Apply mute escalation
  if (warnings.count <= 5) {
    const muteDuration = MUTE_TIMES[warnings.count - 1];
    if (muteDuration) {
      await member.timeout(muteDuration, `Warning ${warnings.count}: ${note}`);
      const muteMsg = `🔇 <@${userId}> muted for ${muteDuration/60000} minutes (Warning ${warnings.count})`;
      await channel.send({ content: muteMsg });
      if (logChannel) await logChannel.send({ content: `📌 [LOG] ${muteMsg}` });

      // Log unmute
      setTimeout(async () => {
        const unmuteMsg = `🔊 <@${userId}> has been automatically unmuted (Warning ${warnings.count})`;
        if (channel) await channel.send({ content: unmuteMsg });
        if (logChannel) await logChannel.send({ content: `📌 [LOG] ${unmuteMsg}` });
      }, muteDuration);
    }
  }

  // Reset warnings after 5th warning
  if (warnings.count >= 5) {
    await setData(dataPath, { count: 0, reasons: [] });
    const resetMsg = `♻️ <@${userId}>'s warnings have been reset after reaching 5 warnings.`;
    if (channel) await channel.send({ content: resetMsg });
    if (logChannel) await logChannel.send({ content: `📌 [LOG] ${resetMsg}` });
  }
}

module.exports = {
  name: "warn",
  description: "Automatically warns, mutes, and logs users for bad behavior",
  
  // Auto-detect messages
  handleEvent: async function({ message }) {
    if (!message || !message.guild) return;
    if (message.author.id === message.client.user.id) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const words = message.content.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
    const violations = [];

    if (BADWORDS.some(w => words.includes(w))) violations.push({ type: "Bad Language", note: pickRandom(MESSAGES.badword) });
    if (RACIST_WORDS.some(w => words.includes(w))) violations.push({ type: "Racist/Discriminatory Term", note: pickRandom(MESSAGES.racist) });

    for (const v of violations) {
      await addWarning(guildId, userId, v.type, v.note, message.channel);
    }
  },

  // Manual command
  run: async function({ message, args }) {
    if (!message.guild) return;
    const guildId = message.guild.id;
    const channel = message.channel;

    if (!args.length) return channel.send("Usage: /warn @user <reason> | /warn list | /warn reset @user | /warn reset all");

    const sub = args[0].toLowerCase();

    // List warnings
    if (sub === "list") {
      const all = (await getData(`warnings/${guildId}/_all`)) || [];
      if (!all.length) return channel.send("✅ No warnings in this server.");

      let msg = "📋 Users with warnings:\n";
      for (const uid of all) {
        const data = (await getData(`warnings/${guildId}/${uid}`)) || { count: 0 };
        if (data.count > 0) msg += `• <@${uid}>: ${data.count} warning${data.count>1?"s":""}\n`;
      }
      return channel.send(msg);
    }

    // Reset all warnings
    if (sub === "reset" && args[1] === "all") {
      const all = (await getData(`warnings/${guildId}/_all`)) || [];
      for (const uid of all) await setData(`warnings/${guildId}/${uid}`, { count: 0, reasons: [] });
      await setData(`warnings/${guildId}/_all`, []);
      return channel.send("✅ All warnings have been reset.");
    }

    // Reset specific user
    if (sub === "reset" && message.mentions.users.size > 0) {
      const targetId = message.mentions.users.first().id;
      await setData(`warnings/${guildId}/${targetId}`, { count: 0, reasons: [] });
      const all = (await getData(`warnings/${guildId}/_all`)) || [];
      const idx = all.indexOf(targetId);
      if (idx !== -1) { all.splice(idx,1); await setData(`warnings/${guildId}/_all`, all); }
      return channel.send(`✅ Warnings reset for <@${targetId}>`);
    }

    // Manual warn
    if (message.mentions.users.size > 0) {
      const targetId = message.mentions.users.first().id;
      const reason = args.slice(1).join(" ").trim();
      if (!reason) return channel.send("⚠️ Please include a reason: /warn @user <reason>");
      return addWarning(guildId, targetId, "Manual Warning", reason, channel);
    }

    return channel.send("Usage: /warn @user <reason> | /warn list | /warn reset @user | /warn reset all");
  }
};