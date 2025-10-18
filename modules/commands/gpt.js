// modules/commands/gpt.js
const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const GPT_CHANNEL_ID = "1428887115009360004"; // GPT-only channel
const COOLDOWN_MS = 5000; // 5 seconds per user
const userCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "gpt",
    description: "Auto responds in a specific GPT channel",
    usage: "Type anything in GPT channel",
    cooldown: 5,
    permission: 0,
    aliases: ["pinoygpt"],
  },

  async letStart({ message }) {
    if (message.author.bot) return; // ignore bots
    if (message.channel.id !== GPT_CHANNEL_ID) return; // ignore other channels

    const userId = message.author.id;
    const now = Date.now();

    // Cooldown check
    if (userCooldowns[userId] && now - userCooldowns[userId] < COOLDOWN_MS) return;
    userCooldowns[userId] = now;

    // Start typing animation
    const typingMessage = await message.reply("🤖 Thinking");
    let dotCount = 0;
    const typingInterval = setInterval(async () => {
      dotCount = (dotCount + 1) % 4; // 0,1,2,3 dots
      const dots = ".".repeat(dotCount);
      try { await typingMessage.edit(`🤖 Thinking${dots}`); } catch {} // ignore if deleted
    }, 700); // 700ms per dot

    try {
      // Call Pinoy GPT API
      const response = await axios.get(
        `https://api-rynxzei.onrender.com/api/pinoygpt?prompt=${encodeURIComponent(message.content)}&uid=${userId}`
      );

      const gptContent = response.data?.response || "⚠️ No response from the API.";

      // Stop typing animation
      clearInterval(typingInterval);

      // Build GPT embed (no author name or icon)
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setDescription(gptContent)
        .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      // Edit typing message with final GPT embed
      await typingMessage.edit({ content: null, embeds: [embed] });

    } catch (err) {
      clearInterval(typingInterval);
      await typingMessage.edit("⚠️ Error contacting the GPT API. Please try again later.");
      console.error("❌ GPT API Error:", err);
    }
  },
};