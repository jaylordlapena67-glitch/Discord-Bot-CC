const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317"; // Admin Log Channel ID
const IGNORE_ROLE_ID = "1427447542475657278"; // Role to ignore

function parseTime(str) {
  const regex = /^(\d+)([mhd])$/i;
  const match = str.match(regex);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return null;
}

module.exports = {
  config: {
    name: "moderation",
    description: "Kick, ban, mute, or unmute users (reason optional)",
    usage: "moderation kick|ban|mute|unmute <@user> [duration for mute] [reason optional]",
    cooldown: 5,
    permission: 0,
    usePrefix: true,
  },

  letStart: async function ({ message, args }) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply("🚫 Only admins can use this command.");
    }

    const sub = args[0]?.toLowerCase();
    if (!sub || !["kick", "ban", "mute", "unmute"].includes(sub)) {
      return message.reply(
        "⚠️ Usage: moderation kick|ban|mute|unmute <@user> [duration for mute] [reason optional]"
      );
    }

    const mentions = message.mentions.users;
    if (!mentions.size) return message.reply("⚠️ Please mention at least one user.");

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    let muteDuration = null;
    let durationArg = null;
    if (sub === "mute") {
      durationArg = args.find((arg) => parseTime(arg));
      if (!durationArg) return message.reply("⚠️ Please provide a valid mute duration (e.g., 10m, 1h, 1d).");
      muteDuration = parseTime(durationArg);
    }

    let firstArgIndexAfterMentions = Math.max(
      ...mentions.map((u) => args.findIndex((a) => a.includes(u.id)))
    ) + 1;
    if (sub === "mute" && durationArg)
      firstArgIndexAfterMentions = args.indexOf(durationArg) + 1;

    const reason = args.slice(firstArgIndexAfterMentions).join(" ").trim() || "No reason provided";

    for (const [userId, user] of mentions) {
      const targetMember = await message.guild.members.fetch(userId).catch(() => null);
      if (!targetMember) continue;
      if (targetMember.roles.cache.has(IGNORE_ROLE_ID)) continue;

      const embed = new EmbedBuilder()
        .setColor(
          sub === "kick"
            ? Colors.Orange
            : sub === "ban"
            ? Colors.Red
            : sub === "mute"
            ? Colors.Blue
            : Colors.Green
        )
        .setAuthor({ name: `${sub.toUpperCase()} ACTION` })
        .addFields(
          { name: "👤 User", value: `${user.tag}`, inline: true },
          { name: "🛠️ Action", value: sub, inline: true },
          ...(sub === "mute"
            ? [{ name: "⏰ Duration", value: durationArg, inline: true }]
            : []),
          { name: "📄 Reason", value: reason }
        )
        .setFooter({
          text: `Action by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      try {
        // --- KICK ---
        if (sub === "kick") {
          if (!targetMember.kickable) {
            message.reply(`⚠️ I can't kick ${user.tag}.`);
            continue;
          }
          await targetMember.kick(reason);
        }

        // --- BAN ---
        else if (sub === "ban") {
          if (!targetMember.bannable) {
            message.reply(`⚠️ I can't ban ${user.tag}.`);
            continue;
          }
          await targetMember.ban({ reason });
        }

        // --- MUTE ---
        else if (sub === "mute") {
          if (!targetMember.moderatable) {
            message.reply(`⚠️ I can't mute ${user.tag}.`);
            continue;
          }

          await targetMember.timeout(muteDuration, reason);

          // Auto-unmute after duration
          setTimeout(async () => {
            const refreshed = await message.guild.members.fetch(userId).catch(() => null);
            if (refreshed && refreshed.isCommunicationDisabled()) {
              await refreshed.timeout(null);
              const unmuteEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setAuthor({ name: "AUTO UNMUTE" })
                .setDescription(`🔊 <@${userId}> has been automatically unmuted after ${durationArg}.`)
                .setFooter({
                  text: `Auto-unmuted from mute duration`,
                  iconURL: message.guild.iconURL({ dynamic: true }),
                })
                .setTimestamp();

              await message.channel.send({ embeds: [unmuteEmbed] });
              if (logChannel) await logChannel.send({ embeds: [unmuteEmbed] });
            }
          }, muteDuration);
        }

        // --- UNMUTE ---
        else if (sub === "unmute") {
          if (!targetMember.isCommunicationDisabled()) {
            message.reply(`⚠️ ${user.tag} is not muted.`);
            continue;
          }
          await targetMember.timeout(null, reason);
        }

        await message.reply({ embeds: [embed] });
        if (logChannel) await logChannel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`❌ Failed to ${sub} ${user.tag}:`, err);
        message.reply(`⚠️ Failed to ${sub} ${user.tag}.`);
      }
    }
  },
};