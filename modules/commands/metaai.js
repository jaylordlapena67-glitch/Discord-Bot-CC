const { EmbedBuilder, Colors } = require("discord.js");
const axios = require("axios");

const COOLDOWN_MS = 5000; // 5 seconds per user
const userCooldowns = {}; // { userId: timestamp }

module.exports = {
  config: {
    name: "metaai",
    description: "Auto Meta-Ai reply in a specific channel",
    usage: "Type anything in Meta-Ai channel",
    cooldown: 5,
    permission: 0,
    aliases: ["meta", "facebookai"],
    channelId: "1428957861676843048" // Meta-Ai only channel
  },

  async letStart({ message }) {
    if (message.author.bot) return;
    if (message.channel.id !== this.config.channelId) return;

    const userId = message.author.id;
    const now = Date.now();

    // Cooldown check (5s per user)
    if (userCooldowns[userId] && now - userCooldowns[userId] < COOLDOWN_MS) return;
    userCooldowns[userId] = now;

    try {
      // 🔗 Call Kaiz API
      const response = await axios.get(
        `https://kaiz-apis.gleeze.com/api/llama3-turbo?ask=${encodeURIComponent(message.content)}&uid=${userId}&apikey=50ebc036-6604-46cd-ae13-0dcb52958bc8`
      );

      // ✅ Extract AI response
      const aiContent = response.data?.response?.trim() || "⚠️ No response from the API.";

      // Function to send embed message
      const sendEmbed = async (text) => {
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setAuthor({ name: "Llama 3-Turbo" })
          .setDescription(text)
          .setFooter({ text: `Reply to ${message.author.tag}` })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
      };

      // Split if longer than 4000 chars
      if (aiContent.length <= 4000) {
        await sendEmbed(aiContent);
      } else {
        const chunks = aiContent.match(/[\s\S]{1,4000}/g);
        for (const chunk of chunks) await sendEmbed(chunk);
      }

    } catch (err) {
      console.error("❌ Meta-Ai API Error:", err);
      await message.reply("⚠️ Error contacting the Meta-Ai API. Please try again later.");
    }
  },
};