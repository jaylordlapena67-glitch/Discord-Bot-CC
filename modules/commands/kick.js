const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317";

module.exports = {
  config: {
    name: "kick",
    description: "Kick a member",
    usage: "kick <@user> [reason]",
    cooldown: 3,
    permission: 0,
    usePrefix: true,
  },

  letStart: async ({ message, args }) => {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply("🚫 You don't have permission to kick members.");
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply("⚠️ Please mention a user to kick.");

    const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
    if (!targetMember) return message.reply("⚠️ Member not found.");
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("⚠️ Cannot kick an Administrator.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await targetMember.kick(reason);

      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle("KICK ACTION")
        .addFields(
          { name: "👤 User", value: user.tag, inline: true },
          { name: "🛠️ Action", value: "Kick", inline: true },
          { name: "📄 Reason", value: reason }
        )
        .setFooter({ text: `Action by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Failed to kick the member.");
    }
  },
};