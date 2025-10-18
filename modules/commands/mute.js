const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317";

// Parse duration (e.g. 10m, 1h, 1d)
function parseTime(str) {
  const regex = /^(\d+)([mhd])$/i;
  const match = str.match(regex);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
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

  run: async ({ message, args }) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply("🚫 You don’t have permission to mute members.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to mute.");

    const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) return message.reply("⚠️ Member not found.");
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("⚠️ Cannot mute an Administrator.");

    // Check duration
    const durationArg = args.find(arg => parseTime(arg));
    if (!durationArg) return message.reply("⚠️ Provide a valid duration (e.g., 10m, 1h, 1d).");

    const muteDuration = parseTime(durationArg);
    const reason = args.slice(args.indexOf(durationArg) + 1).join(" ") || "No reason provided";

    try {
      await targetMember.timeout(muteDuration, `Muted by ${message.author.tag}: ${reason}`);

      // ✅ Embed message
      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle("🔇 Member Muted")
        .addFields(
          { name: "👤 User", value: `${user.tag}`, inline: true },
          { name: "⏰ Duration", value: durationArg, inline: true },
          { name: "📄 Reason", value: reason }
        )
        .setFooter({
          text: `Action by ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

      // Send to log channel if exists
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      return message.reply("⚠️ Failed to mute member. Check if my role is higher.");
    }
  },
};