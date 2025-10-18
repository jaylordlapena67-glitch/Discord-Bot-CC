// modules/commands/gpt.js
const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const COOLDOWN_MS = 5000; // 5 seconds per user
const userCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "gpt",
    description: "Auto GPT reply in a specific channel",
    usage: "Type anything in GPT channel",
    cooldown: 5,
    permission: 0,
    aliases: ["chatgpt"],
    channelId: "1428887115009360004", // GPT-only channel
    apiKey: "6fdb6c73a819bc6a6f1e8f84931836284905b79712c367c837f0d30429598244"
  },

  async letStart({ message }) {
    if (message.author.bot) return;
    if (message.channel.id !== this.config.channelId) return;

    const userId = message.author.id;
    const now = Date.now();

    // Cooldown check
    if (userCooldowns[userId] && now - userCooldowns[userId] < COOLDOWN_MS) return;
    userCooldowns[userId] = now;

    try {
      // Call new GPT API
      const response = await axios.get(
        `https://haji-mix-api.gleeze.com/api/gpt4o?ask=${encodeURIComponent(message.content)}&uid=${userId}&roleplay=&api_key=${this.config.apiKey}`
      );

      const gptContent = response.data?.answer || "⚠️ No response from the API.";

      // Discord embed character limit is 4096 for description
      if (gptContent.length <= 4000) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Blurple)
          .setDescription(gptContent)
          .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
      } else {
        // Split long text into chunks of 4000 characters
        const chunks = gptContent.match(/[\s\S]{1,4000}/g);
        for (const chunk of chunks) {
          const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setDescription(chunk)
            .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTimestamp();
          await message.reply({ embeds: [embed] });
        }
      }

    } catch (err) {
      console.error("❌ GPT API Error:", err);
      await message.reply("⚠️ Error contacting the GPT API. Please try again later.");
    }
  },
};