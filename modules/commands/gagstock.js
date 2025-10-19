const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const WebSocket = require("ws");
const { setData, getData } = require("../../database.js");

let lastGlobalUpdate = null;
let lastSendTime = 0; // 🕒 anti-spam limiter (5s cooldown)

module.exports = {
  config: {
    name: "gagstock",
    description: "Grow A Garden auto-stock every aligned 5-minute interval (Admin only)",
    usage: "-gagstock <on|off|check>",
    cooldown: 5,
    permission: 0,
    aliases: ["gagstocks"],
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
    ExoticBugEgg: "🐞", "Night Egg": "🌙", "Premium Night Egg": "🌙",
    BeeEgg: "🐝", AntiBeeEgg: "🐝", "Premium Anti Bee Egg": "🐝",
    "Common Summer Egg": "🌞", "Rare Summer Egg": "🌞", ParadiseEgg: "🦩",
    OasisEgg: "🏝", DinosaurEgg: "🦖", PrimalEgg: "🦕",
    "Premium Primal Egg": "🦖", RainbowPremiumPrimalEgg: "🌈🦕",
    "Zen Egg": "🐕", "Gourmet Egg": "🍳", "Sprout Egg": "🌱",
    "Enchanted Egg": "🧚", "Fall Egg": "🍂", "Premium Fall Egg": "🍂",
    "Jungle Egg": "🌳", "Spooky Egg": "👻",
  },

  getEmoji(name) {
    return this.ITEM_EMOJI[name.replace(/ Seed$/i, "").trim()] || "❔";
  },

  // 🌿 WebSocket stock fetch
  async fetchGAGStock() {
    return new Promise((resolve) => {
      const ws = new WebSocket("wss://ws.growagardenpro.com");
      let resolved = false;

      ws.on("open", () => ws.send(JSON.stringify({ action: "getStock" })));

      ws.on("message", (data) => {
        if (resolved) return; // 🧠 ignore duplicate WS packets
        resolved = true;

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({});
        } finally {
          ws.close();
        }
      });

      ws.on("error", (err) => {
        console.error("❌ [GAG] WebSocket error:", err);
        resolve({});
      });

      ws.on("close", () => {
        if (!resolved) resolve({});
      });
    });
  },

  // 🪴 Embed sender
  async sendStock(client, channelId, items) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const description = ["Seeds", "Gear", "Eggs"]
      .map((cat) => {
        const arr = items.filter((i) =>
          cat === "Seeds" ? i.type === "seed" :
          cat === "Gear" ? i.type === "gear" : 
          cat === "Eggs" ? i.type === "egg"
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

  // ⚙️ Command handler
  async letStart({ args, message, discord }) {
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

  // 🔁 Called every aligned check by main.js
  async checkForUpdate(client) {
    try {
      const now = Date.now();
      if (now - lastSendTime < 5000) return; // 🧊 ignore if <5s since last send
      const stockData = await this.fetchGAGStock();
      const currentUpdate = stockData?.data?.lastGlobalUpdate;

      if (!currentUpdate || currentUpdate === lastGlobalUpdate) return;
      lastGlobalUpdate = currentUpdate;
      lastSendTime = now;

      console.log(`✅ [GAG] Stock updated at ${new Date().toLocaleTimeString()}`);

      const allData = (await getData("gagstock/discord")) || {};
      for (const guildId in allData) {
        const gcData = allData[guildId];
        if (!gcData?.enabled || !Array.isArray(gcData.channels)) continue;

        const items = [
          ...(stockData.data.seeds || []),
          ...(stockData.data.gear || []),
          ...(stockData.data.events || []),
          ...(stockData.data.honey || []),
          ...(stockData.data.eggs || []),
        ].filter((i) => ["seed", "gear", "egg"].includes(i.type));

        if (items.length === 0) continue;

        for (const chId of gcData.channels) {
          await this.sendStock(client, chId, items);
        }
      }
    } catch (err) {
      console.error("❌ [GAG] checkForUpdate error:", err);
    }
  },
};