const { EmbedBuilder, Colors, PermissionFlagsBits } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317";

module.exports = {
  config: {
    name: "unban",
    description: "Unban a member by ID",
    usage: "unban <userID> [reason]",
    cooldown: 3,
    permission: 0,
    usePrefix: true,
  },

  letStart: async ({ message, args }) => {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply("🚫 You don't have permission to unban members.");

    const userId = args[0];
    if (!userId) return message.reply("⚠️ Please provide a user ID to unban.");

    const reason = args.slice(1).join(" ") || "No reason provided";

    try {
      await message.guild.members.unban(userId, reason);

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("UNBAN ACTION")
        .addFields(
          { name: "👤 User ID", value: userId, inline: true },
          { name: "🛠️ Action", value: "Unban", inline: true },
          { name: "📄 Reason", value: reason }
        )
        .setFooter({ text: `Action by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
      const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply("⚠️ Failed to unban the user.");
    }
  },
};