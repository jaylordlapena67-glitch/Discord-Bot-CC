const { setData, getData } = require("../../database.js");
const WARN_LIMIT = 3;
const LOG_CHANNEL_ID = "1426904103534985317"; // Warning logs channel

// Bad words & racist words
const badwords = [
  "tanga","bobo","gago","puta","pakyu","inutil","ulol",
  "fuck","shit","asshole","bitch","dumb","stupid","motherfucker",
  "laplap","pota","inamo","tangina","tang ina","kantut","kantot",
  "jakol","jakul","jabol","supot","blow job","blowjob","puke","puki"
];

const racistWords = [
  "negro","nigger","chimp","nigga","baluga",
  "chink","indio","bakla","niga","bungal","beki","negra"
];

const messages = {
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

// Add warning function
async function addWarning(guildId, userId, type, note, channel) {
  const dataPath = `warnings/${guildId}/${userId}`;
  let warnings = (await getData(dataPath)) || { count: 0, reasons: [] };

  warnings.count = (warnings.count || 0) + 1;
  warnings.reasons.push({ type, note, time: Date.now() });
  await setData(dataPath, warnings);

  const msg = `⚠️ <@${userId}> has been warned for **${type}**.\nReason: ${note}\nWarnings: ${warnings.count}/${WARN_LIMIT}`;

  // Send to current channel
  await channel.send({ content: msg });

  // Send to logs channel
  const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) await logChannel.send({ content: `📌 [LOG] ${msg}` });

  // Auto-kick if reached limit
  if (warnings.count >= WARN_LIMIT) {
    try {
      const member = await channel.guild.members.fetch(userId);
      if (member) {
        await member.kick(`Reached ${WARN_LIMIT} warnings`);
        const kickedMsg = `🚫 <@${userId}> has been kicked for reaching ${WARN_LIMIT} warnings.`;
        await channel.send({ content: kickedMsg });
        if (logChannel) await logChannel.send({ content: `📌 [LOG] ${kickedMsg}` });
        await setData(dataPath, { count: 0, reasons: [] });
      }
    } catch (err) {
      console.error(err);
      await channel.send("⚠️ Failed to kick user. Check bot permissions.");
      if (logChannel) await logChannel.send({ content: `⚠️ Failed to kick <@${userId}>. Error: ${err}` });
    }
  }
}

// 🔹 Auto-detect messages
module.exports.handleEvent = async function({ message }) {
  try {
    if (!message || !message.guild) return;
    const guildId = message.guild.id;
    const userId = message.author.id;
    if (userId === message.client.user.id) return; // Skip bot itself

    const lower = message.content.toLowerCase();
    const words = lower.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);

    const violations = [];
    if (badwords.some(w => words.includes(w))) violations.push({ type: "Bad Language", note: pickRandom(messages.badword) });
    if (racistWords.some(w => words.includes(w))) violations.push({ type: "Racist/Discriminatory Term", note: pickRandom(messages.racist) });

    for (const v of violations) {
      await addWarning(guildId, userId, v.type, v.note, message.channel);
    }
  } catch (err) {
    console.error("Warning handleEvent error:", err);
  }
};

// 💬 Manual commands
module.exports.run = async function({ message, args }) {
  try {
    if (!message.guild) return;
    const guildId = message.guild.id;
    const senderId = message.author.id;
    const channel = message.channel;

    if (args.length === 0) return channel.send("Usage: /warn @user <reason> | /warn list | /warn reset @user | /warn reset all");

    const sub = args[0].toLowerCase();

    // List warnings
    if (sub === "list") {
      const all = (await getData(`warnings/${guildId}/_all`)) || [];
      if (!all.length) return channel.send("✅ No warnings in this server.");

      let msg = "📋 Users with warnings:\n";
      for (const uid of all) {
        const data = (await getData(`warnings/${guildId}/${uid}`)) || { count: 0 };
        if (data.count > 0) msg += `• <@${uid}>: ${data.count} warning${data.count > 1 ? "s" : ""}\n`;
      }
      return channel.send(msg);
    }

    // Reset all
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
      if (idx !== -1) { all.splice(idx, 1); await setData(`warnings/${guildId}/_all`, all); }
      return channel.send(`✅ Warnings reset for <@${targetId}>`);
    }

    // Manual warn
    if (message.mentions.users.size > 0) {
      const targetId = message.mentions.users.first().id;
      const reason = args.slice(1).join(" ").trim();
      if (!reason) return channel.send("⚠️ Please include a reason: /warn @user <reason>");
      return addWarning(guildId, targetId, "Manual Warning", reason, channel);
    }

    channel.send("Usage: /warn @user <reason> | /warn list | /warn reset @user | /warn reset all");
  } catch (err) {
    console.error("Warning run error:", err);
  }
};