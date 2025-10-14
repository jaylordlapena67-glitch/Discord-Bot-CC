const { EmbedBuilder } = require("discord.js");
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

  // Update _all list
  let allUsers = (await getData(`warnings/${guildId}/_all`)) || [];
  if (!allUsers.includes(userId)) {
    allUsers.push(userId);
    await setData(`warnings/${guildId}/_all`, allUsers);
  }

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
      const muteMsg = `🔇 <@${userId}> muted for ${muteDuration / 60000} minutes (Warning ${warnings.count})`;
      await channel.send({ content: muteMsg });
      if (logChannel) await logChannel.send({ content: `📌 [LOG] ${muteMsg}` });

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
  config: {
    name: "warning",
    description: "Warn users or manage warnings",
    usage: "warning <@user> <reason> | warning list | warning reset [@user|all]",
    cooldown: 5,
    permission: 0,
    usePrefix: true,
  },

  letStart: async function({ message, args }) {
    const guildId = message.guild.id;
    const channel = message.channel;

    const subCommand = args[0]?.toLowerCase();
    
    if (subCommand === "list") {
      const all = (await getData(`warnings/${guildId}/_all`)) || [];
      if (!all.length) return message.reply("✅ No warnings in this server.");

      let msg = "📋 Users with warnings:\n";
      for (const uid of all) {
        const data = (await getData(`warnings/${guildId}/${uid}`)) || { count: 0 };
        if (data.count > 0) msg += `• <@${uid}>: ${data.count} warning${data.count>1?"s":""}\n`;
      }
      return message.reply(msg);
    }

    if (subCommand === "reset") {
      const targetMention = message.mentions.users.first();
      const isAll = args[1]?.toLowerCase() === "all";

      if (isAll) {
        const all = (await getData(`warnings/${guildId}/_all`)) || [];
        for (const uid of all) await setData(`warnings/${guildId}/${uid}`, { count: 0, reasons: [] });
        await setData(`warnings/${guildId}/_all`, []);
        return message.reply("✅ All warnings have been reset.");
      }

      if (targetMention) {
        await setData(`warnings/${guildId}/${targetMention.id}`, { count: 0, reasons: [] });
        const all = (await getData(`warnings/${guildId}/_all`)) || [];
        const idx = all.indexOf(targetMention.id);
        if (idx !== -1) { all.splice(idx, 1); await setData(`warnings/${guildId}/_all`, all); }
        return message.reply(`✅ Warnings reset for <@${targetMention.id}>`);
      }

      return message.reply("⚠️ Specify a user or 'all' to reset warnings.");
    }

    // Manual warn: /warning @user reason
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Please mention a user to warn.");
    const reason = args.slice(1).join(" ") || "No reason provided";
    await addWarning(guildId, target.id, "Manual Warning", reason, channel);
    return message.reply(`✅ <@${target.id}> has been warned.`);
  },

  handleEvent: async function({ message }) {
    if (!message.guild || message.author.bot) return;

    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    // Ignore admins/staff
    const adminRoles = ["Admin", "Moderator", "Staff"];
    if (member.roles.cache.some(r => adminRoles.includes(r.name))) return;

    const content = message.content.toLowerCase();
    const violations = [];

    // --- BAD WORDS ---
    for (const word of BADWORDS) {
      const regex = new RegExp(`(?<!\\w)${word.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}(?!\\w)`, "i");
      if (regex.test(content)) {
        violations.push({ type: "Bad Language", note: pickRandom(MESSAGES.badword) });
        break;
      }
    }

    // --- RACIST WORDS ---
    for (const word of RACIST_WORDS) {
      const regex = new RegExp(`(?<!\\w)${word.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}(?!\\w)`, "i");
      if (regex.test(content)) {
        violations.push({ type: "Racist/Discriminatory Term", note: pickRandom(MESSAGES.racist) });
        break;
      }
    }

    // --- LINK DETECTION ---
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const allowedDomains = ["roblox.com"]; // all Roblox links allowed
    const urls = message.content.match(urlRegex) || [];
    for (const url of urls) {
      const allowed = allowedDomains.some(domain => url.includes(domain));
      if (!allowed) {
        violations.push({
          type: "Posting Links",
          note: "Sharing links other than Roblox is not allowed."
        });
      }
    }

    // --- APPLY WARNINGS ---
    for (const v of violations) {
      await addWarning(message.guild.id, message.author.id, v.type, v.note, message.channel);

      // Send custom embed for links
      if (v.type === "Posting Links") {
        const embed = new EmbedBuilder()
          .setColor(0xFF4500)
          .setTitle("⚠️ Link Not Allowed")
          .setDescription(`❌ You shared a link that is not allowed in this server.`)
          .addFields(
            { name: "Allowed Links", value: "✅ All Roblox links are allowed." },
            { name: "Warning", value: `You have received a warning for posting disallowed links.` }
          )
          .setTimestamp()
          .setFooter({ text: `Server: ${message.guild.name}`, iconURL: message.guild.iconURL({ dynamic: true }) });

        await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
      }
    }
  }
};
