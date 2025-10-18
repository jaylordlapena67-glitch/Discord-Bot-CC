// modules/commands/gpt.js
const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const GPT_CHANNEL_ID = "1428887115009360004"; // GPT-only channel
const GPT_COOLDOWN_MS = 5000; // 5 seconds per user
const gptUserCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "gpt",
    description: "GPT auto-reply in a specific channel",
    usage: "Type anything in GPT channel",
    cooldown: 5,
    permission: 0,
    aliases: ["chatgpt"],
  },

  async letStart({ message }) {
    if (!message.guild || message.author.bot) return;

    const userId = message.author.id;
    const now = Date.now();

    // Cooldown check
    if (gptUserCooldowns[userId] && now - gptUserCooldowns[userId] < GPT_COOLDOWN_MS) return;
    gptUserCooldowns[userId] = now;

    // Start typing animation
    const typingMessage = await message.reply("🤖 Thinking");
    let dotCount = 0;
    const typingInterval = setInterval(async () => {
      dotCount = (dotCount + 1) % 4;
      const dots = ".".repeat(dotCount);
      try { await typingMessage.edit(`🤖 Thinking${dots}`); } catch {}
    }, 700);

    try {
      // Call new GPT API
      const response = await axios.get(
        `https://api-rynxzei.onrender.com/api/gpt4-convo?prompt=${encodeURIComponent(message.content)}&uid=${userId}`
      );

      const gptContent = response.data?.response || "⚠️ No response from the API.";
      clearInterval(typingInterval);

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setDescription(gptContent)
        .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await typingMessage.edit({ content: null, embeds: [embed] });
    } catch (err) {
      clearInterval(typingInterval);
      await typingMessage.edit("⚠️ Error contacting the GPT API. Please try again later.");
      console.error("❌ GPT API Error:", err);
    }
  },
};