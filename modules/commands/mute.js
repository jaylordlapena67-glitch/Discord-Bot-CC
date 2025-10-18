const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317";

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
    name: "mute",
    description: "Mute a member for a duration",
    usage: "mute <@user> <duration> [reason]",
    cooldown: 3,
    permission: 0,
    usePrefix: true,
  },

  letStart: async ({ message, args }) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply("🚫 You don't have permission to mute members.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to mute.");

    const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) return message.reply("⚠️ Member not found.");
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("⚠️ Cannot mute an Administrator.");

    const durationArg = args.find((arg) => parseTime(arg));
    if (!durationArg) return message.reply("⚠️ Provide a valid duration (e.g., 10m, 1h, 1d).");
    const muteDuration = parseTime(durationArg);

    const reason = args.slice(args.indexOf(durationArg) + 1).join(" ") || "No reason provided";

    try {
      await targetMember.timeout(muteDuration, reason);

      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle("MUTE ACTION")
        .addFields(
          { name: "👤 User", value: user.tag, inline: true },
          { name: "⏰ Duration", value: durationArg, inline: true },
          { name: "📄 Reason", value: reason }
        )
        .setFooter({ text: `Action by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });

      // Auto-unmute after duration
      setTimeout(async () => {
        const refreshed = await message.guild.members.fetch(user.id).catch(() => null);
        if (refreshed && refreshed.isCommunicationDisabled()) {
          await refreshed.timeout(null, "Auto-unmute after mute duration");
          const unmuteEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle("AUTO UNMUTE")
            .setDescription(`🔊 ${user.tag} has been automatically unmuted.`)
            .setFooter({ text: "Auto-unmuted", iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();

          await message.channel.send({ embeds: [unmuteEmbed] });
          if (logChannel) await logChannel.send({ embeds: [unmuteEmbed] });
        }
      }, muteDuration);
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Failed to mute the member.");
    }
  },
};