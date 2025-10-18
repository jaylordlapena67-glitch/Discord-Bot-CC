// modules/commands/aria-ai.js
const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const COOLDOWN_MS = 5000; // 5 seconds per user
const userCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "aria-ai",
    description: "Auto Aria-Ai reply in a specific channel",
    usage: "Type anything in Aria-Ai channel",
    cooldown: 5,
    permission: 0,
    aliases: ["aria", "ariaai"],
    channelId: "1428927739431227503" // Aria-Ai only channel
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
      // Call Aria-Ai API
      const response = await axios.get(
        `https://betadash-api-swordslush-production.up.railway.app/Aria?ask=${encodeURIComponent(message.content)}&userid=${userId}&stream=`
      );

      const ariaContent = response.data?.response?.trim() || "⚠️ No response from the API.";

      // Function to send embed safely
      const sendEmbed = async (text) => {
        const embed = new EmbedBuilder()
          .setColor(Colors.Purple)
          .setDescription(text)
          .setFooter({ text: `Reply to ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();
        await message.reply({ embeds: [embed] });
      };

      if (ariaContent.length <= 4000) {
        await sendEmbed(ariaContent);
      } else {
        // Split into chunks of max 4000 characters
        const chunks = ariaContent.match(/[\s\S]{1,4000}/g);
        for (const chunk of chunks) {
          await sendEmbed(chunk);
        }
      }

    } catch (err) {
      console.error("❌ Aria-Ai API Error:", err);
      await message.reply("⚠️ Error contacting the Aria-Ai API. Please try again later.");
    }
  },
};