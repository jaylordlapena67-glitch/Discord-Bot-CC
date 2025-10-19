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
    "Basic Sprinkler": "🌧", "Advanced Sprinkler": "💦", "Godly Sprinkler": "⚡",
    "Magnifying Glass": "🔍", "Master Sprinkler": "🏆", "Cleaning Spray": "🧴",
    "Cleansing PetShard": "🪄", "Favorite Tool": "⭐", "Harvest Tool": "🌾",
    "Friendship Pot": "🤝", "Medium Toy": "🧸", "Medium Treat": "🍪",
    "Grandmaster Sprinkler": "🌟", "Levelup Lollipop": "🍭",
    "Common Egg": "🥚", "Uncommon Egg": "🥚", "Rare Egg": "🥚",
    "Legendary Egg": "🥚", "Mythical Egg": "🥚", "Bug Egg": "🐛",
    "Exotic Bug Egg": "🐞", "Night Egg": "🌙", "Premium Night Egg": "🌙",
    "Bee Egg": "🐝", "Anti Bee Egg": "🐝", "Premium Anti Bee Egg": "🐝",
    "Common Summer Egg": "🌞", "Rare Summer Egg": "🌞", "Paradise Egg": "🦩",
    "Oasis Egg": "🏝", "Dinosaur Egg": "🦖", "Primal Egg": "🦕",
    "Premium Primal Egg": "🦖", "Rainbow Premium Primal Egg": "🌈🦕",
    "Zen Egg": "🐕", "Gourmet Egg": "🍳", "Sprout Egg": "🌱",
    "Enchanted Egg": "🧚", "Fall Egg": "🍂", "Premium Fall Egg": "🍂",
    "Jungle Egg": "🌳", "Spooky Egg": "👻"
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
    const discord = ctx.discord;
    const client = discord.client;

    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("🚫 Only Admins can use this command.");

    const action = args[0]?.toLowerCase();
    if (!["on", "off", "check"].includes(action))
      return message.reply("⚠️ Invalid action! Use `on`, `off`, or `check`.");

    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const allData = (await getData("gagstock/discord")) || {};
    let gcData = allData[guildId];
    if (!gcData || !Array.isArray(gcData.channels))
      gcData = { enabled: false, channels: [] };

    if (action === "on") {
      if (!gcData.channels.includes(channelId)) gcData.channels.push(channelId);
      gcData.enabled = true;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      return message.reply("✅ GAG Auto-stock **enabled** for this channel!");
    }

    if (action === "off") {
      gcData.channels = gcData.channels.filter((id) => id !== channelId);
      if (gcData.channels.length === 0) gcData.enabled = false;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      return message.reply("🛑 GAG Auto-stock **disabled** for this channel!");
    }

    if (action === "check") {
      const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
      const channels = gcData.channels.map((id) => `<#${id}>`).join(", ") || "None";
      return message.reply(`📊 Status: ${status}\nChannels: ${channels}`);
    }
  },

  async startAutoCheck(client) {
    console.log("[GAG] ⏳ Starting aligned 5-minute stock watcher...");
    let checkingInterval = null;

    const waitUntilNextAligned = () => {
      const now = new Date();
      const mins = now.getMinutes();
      const nextAligned = Math.ceil(mins / 5) * 5;
      const next = new Date(now);
      next.setMinutes(nextAligned);
      next.setSeconds(0);
      next.setMilliseconds(0);
      if (next <= now) next.setMinutes(next.getMinutes() + 5);

      const waitMs = next - now;
      console.log(`[GAG] Waiting ${Math.round(waitMs / 1000)}s until next aligned time...`);
      setTimeout(startSecondCheck, waitMs);
    };

    const startSecondCheck = async () => {
      console.log("[GAG] 🕒 Aligned time reached — checking API every second...");
      clearInterval(checkingInterval);

      checkingInterval = setInterval(async () => {
        try {
          const stockData = await module.exports.fetchGAGStock();
          const apiUpdate = stockData?.lastGlobalUpdate;
          if (!apiUpdate) return;

          const lastSaved = await getData("gagstock/lastGlobalUpdate");
          if (apiUpdate !== lastSaved) {
            await setData("gagstock/lastGlobalUpdate", apiUpdate);
            console.log(`[GAG] ✅ Detected update: ${apiUpdate}`);
            await module.exports.broadcastStock(client, stockData);

            clearInterval(checkingInterval);
            waitUntilNextAligned();
          }
        } catch (err) {
          if (err.response?.status === 429) {
            console.log("⚠️ [GAG] Rate limited, pausing 15s...");
            clearInterval(checkingInterval);
            setTimeout(startSecondCheck, 15000);
          } else {
            console.log("❌ [GAG] API check error:", err.message);
          }
        }
      }, 1000);
    };

    waitUntilNextAligned();
  },

  async broadcastStock(client, stockData) {
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
        await module.exports.sendStock(client, chId, items);
      }
    }
  }
};