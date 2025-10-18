const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317"; // Admin Log Channel ID

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

  letStart: async ({ message, args }) => {
    const member = message.member;
    if (!member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("🚫 Only admins can use this command.");

    const sub = args[0]?.toLowerCase();
    if (!sub || !["kick", "ban", "mute", "unmute"].includes(sub))
      return message.reply(
        "⚠️ Usage: moderation kick|ban|mute|unmute <@user> [duration for mute] [reason optional]"
      );

    const mentions = message.mentions.members;
    if (!mentions.size) return message.reply("⚠️ Please mention at least one user.");

    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

    for (const [userId, targetMember] of mentions) {
      if (!targetMember) continue;

      // Ignore users with Administrator permission
      if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
        message.reply(`⚠️ Cannot ${sub} ${targetMember.user.tag} (Administrator).`);
        continue;
      }

      let durationArg = null;
      let muteDuration = null;
      let reason = "No reason provided";

      if (sub === "mute") {
        durationArg = args.find((a) => parseTime(a));
        if (!durationArg)
          return message.reply("⚠️ Please provide a valid mute duration (e.g., 10m, 1h, 1d).");
        muteDuration = parseTime(durationArg);

        const durationIndex = args.indexOf(durationArg);
        reason = args.slice(durationIndex + 1).join(" ") || reason;
      } else {
        const lastMentionIndex = args.findIndex((a) => a.includes(userId));
        reason = args.slice(lastMentionIndex + 1).join(" ") || reason;
      }

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
          { name: "👤 User", value: `${targetMember.user.tag}`, inline: true },
          { name: "🛠️ Action", value: sub, inline: true },
          ...(sub === "mute" ? [{ name: "⏰ Duration", value: durationArg, inline: true }] : []),
          { name: "📄 Reason", value: reason }
        )
        .setFooter({
          text: `Action by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      try {
        if (sub === "kick") {
          if (!targetMember.kickable) {
            message.reply(`⚠️ I can't kick ${targetMember.user.tag}.`);
            continue;
          }
          await targetMember.kick(reason);
        } else if (sub === "ban") {
          if (!targetMember.bannable) {
            message.reply(`⚠️ I can't ban ${targetMember.user.tag}.`);
            continue;
          }
          await targetMember.ban({ reason });
        } else if (sub === "mute") {
          if (!targetMember.moderatable) {
            message.reply(`⚠️ I can't mute ${targetMember.user.tag}.`);
            continue;
          }
          await targetMember.timeout(muteDuration, reason);

          // Auto-unmute
          setTimeout(async () => {
            const refreshed = await message.guild.members.fetch(userId).catch(() => null);
            if (refreshed && refreshed.isCommunicationDisabled()) {
              await refreshed.timeout(null);
              const unmuteEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setAuthor({ name: "AUTO UNMUTE" })
                .setDescription(
                  `🔊 <@${userId}> has been automatically unmuted after ${durationArg}.`
                )
                .setFooter({
                  text: `Auto-unmuted from mute duration`,
                  iconURL: message.guild.iconURL({ dynamic: true }),
                })
                .setTimestamp();

              await message.channel.send({ embeds: [unmuteEmbed] });
              if (logChannel) await logChannel.send({ embeds: [unmuteEmbed] });
            }
          }, muteDuration);
        } else if (sub === "unmute") {
          if (!targetMember.isCommunicationDisabled()) {
            message.reply(`⚠️ ${targetMember.user.tag} is not muted.`);
            continue;
          }
          await targetMember.timeout(null, reason);
        }

        await message.reply({ embeds: [embed] });
        if (logChannel) await logChannel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`❌ Failed to ${sub} ${targetMember.user.tag}:`, err);
        message.reply(`⚠️ Failed to ${sub} ${targetMember.user.tag}.`);
      }
    }
  },
};