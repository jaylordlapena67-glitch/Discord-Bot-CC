const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { setData, getData } = require("../../database.js");

module.exports = {
  config: {
    name: "gagstock",
    description: "Grow A Garden auto-stock based on lastGlobalUpdate (Admin only)",
    usage: "-gagstock <on|off|check>",
    cooldown: 5,
    permission: 0,
    aliases: ["gagstocks"]
  },

  ITEM_EMOJI: {
    Carrot: "🥕", Strawberry: "🍓", Blueberry: "🫐", Tomato: "🍅",
    Corn: "🌽", Daffodil: "🌼", Watermelon: "🍉", Pumpkin: "🎃",
    Apple: "🍎", Bamboo: "🎋", Coconut: "🥥", Cactus: "🌵",
    "Dragon Fruit": "🐉", Mango: "🥭", Grape: "🍇", Mushroom: "🍄",
    Pepper: "🌶", Beanstalk: "🌱", "Ember Lily": "🌺", "Sugar Apple": "🍏",
    "Burning Bud": "🔥", "Giant Pinecone": "🌲", "Elder Strawberry": "🍓",
    Romanesco: "🥦", "Crimson Thorn": "🌹", "Great Pumpkin": "🎃", Potato: "🥔",
    "Brussels Sprouts": "🥬", Cocomango: "🥭", Broccoli: "🥦", "Orange Tulip": "🌷",
    "Watering Can": "🌊", "Trading Ticket": "🎫", Trowel: "🪓", "Recall Wrench": "🔧",
    "Basic Sprinkler": "🌧", "Advanced Sprinkler": "💦", "Magnifying Glass": "🔍",
    "Favorite Tool": "⭐", "Harvest Tool": "🌾", "Common Egg": "🥚", "Bug Egg": "🐛",
    "Common Summer Egg": "🌞", "Spooky Egg": "👻"
  },

  getEmoji(name) {
    return this.ITEM_EMOJI[name.replace(/ Seed$/i, "").trim()] || "❔";
  },

  async fetchGAGStock() {
    try {
      const { data } = await axios.get("https://gagapi.onrender.com/alldata", { timeout: 10000 });
      return data || {};
    } catch (err) {
      console.error("❌ [GAG] API fetch error:", err.message);
      return {};
    }
  },

  async sendStock(client, channelId, items) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const description = ["Seeds", "Gear", "Eggs"]
      .map((cat) => {
        const arr = items.filter((i) =>
          cat === "Seeds" ? i.type === "seed" :
          cat === "Gear" ? i.type === "gear" :
          cat === "Eggs" ? i.type === "egg" : false
        );
        return `**${cat}**\n${arr.map((i) => `• ${this.getEmoji(i.name)} **${i.name}** (${i.quantity})`).join("\n") || "❌ Empty"}`;
      })
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle("🪴 Grow A Garden Stock Update")
      .setDescription(description.slice(0, 4096))
      .setColor(0xff0080)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  },

  async letStart(ctx) {
    const args = ctx.args;
    const message = ctx.message;
    const client = ctx.discord.client;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("🚫 Only Admins can use this command.");

    const action = args[0]?.toLowerCase();
    if (!["on", "off", "check"].includes(action))
      return message.reply("⚠️ Invalid action! Use `on`, `off`, or `check`.");

    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const allData = (await getData("gagstock/discord")) || {};
    let gcData = allData[guildId] || { enabled: false, channels: [] };

    if (action === "on") {
      if (!gcData.channels.includes(channelId)) gcData.channels.push(channelId);
      gcData.enabled = true;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      return message.reply("✅ GAG Auto-stock **enabled** for this channel!");
    }

    if (action === "off") {
      gcData.channels = gcData.channels.filter(id => id !== channelId);
      if (gcData.channels.length === 0) gcData.enabled = false;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      return message.reply("🛑 GAG Auto-stock **disabled** for this channel!");
    }

    if (action === "check") {
      const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
      const channels = gcData.channels.map(id => `<#${id}>`).join(", ") || "None";
      return message.reply(`📊 Status: ${status}\nChannels: ${channels}`);
    }
  },

  async checkForUpdate(client) {
    try {
      // optional cooldown to avoid rapid calls
      if (this._lastFetch && Date.now() - this._lastFetch < 10000) return false;
      this._lastFetch = Date.now();

      const stockData = await this.fetchGAGStock();
      const currentUpdate = stockData?.lastGlobalUpdate;
      if (!currentUpdate) return false;

      const lastSaved = await getData("gagstock/lastGlobalUpdate") || null;
      if (currentUpdate === lastSaved) return false;

      await setData("gagstock/lastGlobalUpdate", currentUpdate);
      console.log(`✅ [GAG] Detected new stock update: ${currentUpdate}`);

      const allData = (await getData("gagstock/discord")) || {};
      for (const guildId in allData) {
        const gcData = allData[guildId];
        if (!gcData?.enabled || !Array.isArray(gcData.channels)) continue;

        const items = [
          ...(stockData.seeds || []).map(i => ({ ...i, type: "seed" })),
          ...(stockData.gear || []).map(i => ({ ...i, type: "gear" })),
          ...(stockData.eggs || []).map(i => ({ ...i, type: "egg" }))
        ];

        for (const chId of gcData.channels) {
          await this.sendStock(client, chId, items);
        }
      }

      return true; // stock updated
    } catch (err) {
      console.error("❌ [GAG] checkForUpdate error:", err);
      return false;
    }
  }
};