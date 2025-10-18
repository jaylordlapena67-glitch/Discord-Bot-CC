// modules/commands/gpt.js
const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const GPT_CHANNEL_ID = "1428887115009360004"; // GPT-only channel
const COOLDOWN_MS = 5000; // 5 seconds per user
const userCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "gpt",
    description: "Auto GPT reply in a specific channel",
    usage: "Type anything in GPT channel",
    cooldown: 5,
    permission: 0,
    aliases: ["pinoygpt"],
  },

  async letStart({ message }) {
    if (message.author.bot) return;
    if (message.channel.id !== GPT_CHANNEL_ID) return;

    const userId = message.author.id;
    const now = Date.now();

    // Cooldown check
    if (userCooldowns[userId] && now - userCooldowns[userId] < COOLDOWN_MS) return;
    userCooldowns[userId] = now;

    try {
      const response = await axios.get(
        `https://api-rynxzei.onrender.com/api/pinoygpt?prompt=${encodeURIComponent(message.content)}&uid=${userId}`
      );

      const gptContent = response.data?.response || "⚠️ No response from the API.";

      // Build GPT embed (replying in same chat)
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setDescription(gptContent)
        .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error("❌ GPT API Error:", err);
      await message.reply("⚠️ Error contacting the GPT API. Please try again later.");
    }
  },
};