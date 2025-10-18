const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317";

module.exports = {
  config: {
    name: "unmute",
    description: "Unmute a member",
    usage: "unmute <@user> [reason]",
    cooldown: 3,
    permission: 0,
    usePrefix: true,
  },

  letStart: async ({ message, args }) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply("🚫 You don't have permission to unmute members.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to unmute.");

    const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) return message.reply("⚠️ Member not found.");
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("⚠️ Cannot unmute an Administrator.");
    if (!targetMember.isCommunicationDisabled())
      return message.reply("⚠️ User is not muted.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await targetMember.timeout(null, reason);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("UNMUTE ACTION")
        .addFields(
          { name: "👤 User", value: user.tag, inline: true },
          { name: "🛠️ Action", value: "Unmute", inline: true },
          { name: "📄 Reason", value: reason }
        )
        .setFooter({ text: `Action by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Failed to unmute the member.");
    }
  },
};