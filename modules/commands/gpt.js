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
    channelId: "1428887115009360004" // GPT-only channel
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
      // Call GPT API
      const response = await axios.get(
        `https://betadash-api-swordslush-production.up.railway.app/gpt4?ask=${encodeURIComponent(message.content)}`
      );

      const gptContent = response.data?.content?.trim() || "⚠️ No response from the API.";

      // Function to send embed safely
      const sendEmbed = async (text) => {
        const embed = new EmbedBuilder()
          .setColor(Colors.Purple)
          .setAuthor({ name: "GPT Response" }) // 👈 small header text (like Aria-Ai)
          .setDescription(text)
          .setFooter({ text: `Reply to ${message.author.tag}` })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
      };

      if (gptContent.length <= 4000) {
        await sendEmbed(gptContent);
      } else {
        // Split long replies into chunks
        const chunks = gptContent.match(/[\s\S]{1,4000}/g);
        for (const chunk of chunks) {
          await sendEmbed(chunk);
        }
      }

    } catch (err) {
      console.error("❌ GPT API Error:", err);
      await message.reply("⚠️ Error contacting the GPT API. Please try again later.");
    }
  },
};