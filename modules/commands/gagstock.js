const { EmbedBuilder } = require("discord.js");
const WebSocket = require("ws");

let lastGlobalUpdate = null;

module.exports = {
  config: {
    name: "gagstock",
    description: "GAG auto-stock every aligned 5-minute interval",
    usage: "-gagstock <on|off|check>",
    cooldown: 5,
    permission: 0,
  },

  ITEM_EMOJI: {
    // Seeds
    Carrot: "🥕", Strawberry: "🍓", Blueberry: "🫐", Tomato: "🍅",
    Corn: "🌽", Daffodil: "🌼", Watermelon: "🍉", Pumpkin: "🎃",
    Apple: "🍎", Bamboo: "🎋", Coconut: "🥥", Cactus: "🌵",
    DragonFruit: "🐉", Mango: "🥭", Grape: "🍇", Mushroom: "🍄",
    Pepper: "🌶", Beanstalk: "🌱", EmberLily: "🌺", SugarApple: "🍏",
    BurningBud: "🔥", GiantPinecone: "🌲", ElderStrawberry: "🍓",
    Romanesco: "🥦", CrimsonThorn: "🌹", GreatPumpkin: "🎃", Potato: "🥔",
    BrusselsSprouts: "🥬", Cocomango: "🥭", Broccoli: "🥦", OrangeTulip: "🌷",

    // Gear
    WateringCan: "🌊", TradingTicket: "🎫", Trowel: "🪓", RecallWrench: "🔧",
    BasicSprinkler: "🌧", AdvancedSprinkler: "💦", GodlySprinkler: "⚡",
    MagnifyingGlass: "🔍", MasterSprinkler: "🏆", CleaningSpray: "🧴",
    CleansingPetShard: "🪄", FavoriteTool: "⭐", HarvestTool: "🌾",
    FriendshipPot: "🤝", MediumToy: "🧸", MediumTreat: "🍪",
    GrandmasterSprinkler: "🌟", LevelupLollipop: "🍭",

    // Eggs
    "Common Egg": "🥚", "Uncommon Egg": "🥚", "Rare Egg": "🥚",
    "Legendary Egg": "🥚", "Mythical Egg": "🥚", "Bug Egg": "🐛",
    "Exotic Bug Egg": "🐞", "Night Egg": "🌙", "Premium Night Egg": "🌙",
    "Bee Egg": "🐝", "Anti Bee Egg": "🐝", "Premium Anti Bee Egg": "🐝",
    "Common Summer Egg": "🌞", "Rare Summer Egg": "🌞", "Paradise Egg": "🦩",
    "Oasis Egg": "🏝", "Dinosaur Egg": "🦖", "Primal Egg": "🦕",
    "Premium Primal Egg": "🦖", "Rainbow Premium Primal Egg": "🌈🦕",
    "Zen Egg": "🐕", "Gourmet Egg": "🍳", "Sprout Egg": "🌱",
    "Enchanted Egg": "🧚", "Fall Egg": "🍂", "Premium Fall Egg": "🍂",
    "Jungle Egg": "🌳", "Spooky Egg": "👻",
  },

  getEmoji(name) {
    return this.ITEM_EMOJI[name.replace(/ Seed$/i, "").trim()] || "❔";
  },

  getNextAligned5Min() {
    const now = new Date();
    const minutes = now.getMinutes();
    const next = new Date(now);
    const alignedMinute = Math.ceil((minutes + 1) / 5) * 5;
    if (alignedMinute === 60) next.setHours(now.getHours() + 1, 0, 0, 0);
    else next.setMinutes(alignedMinute, 0, 0);
    return next;
  },

  async fetchGAGStock() {
    return new Promise(resolve => {
      const ws = new WebSocket("wss://ws.growagardenpro.com"); // GAG endpoint
      ws.on("open", () => ws.send(JSON.stringify({ action: "getStock" })));
      ws.on("message", data => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
        ws.close();
      });
      ws.on("error", err => {
        console.error("❌ GAG WS error:", err);
        resolve({});
      });
    });
  },

  async sendStock(client, items) {
    const channelId = "1426901600030429317"; // Discord channel
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const description = Object.entries({
      Seeds: items.filter(i => i.type === "seed"),
      Gear: items.filter(i => i.type === "gear"),
      Eggs: items.filter(i => i.type === "egg"),
    })
      .map(([cat, arr]) =>
        `**${cat}**\n${arr.map(i => `• ${this.getEmoji(i.name)} **${i.name}** (${i.quantity})`).join("\n") || "❌ Empty"}`
      )
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle("🪴 Grow a Garden Stock Update")
      .setDescription(description)
      .setColor(0xff0080)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  },

  async onReady(client) {
    console.log("🔁 GAG module ready — starting auto-stock loop...");

    const loop = async () => {
      const nextTime = this.getNextAligned5Min();
      const delay = nextTime - Date.now();
      console.log(`⏳ Waiting until next 5-min mark: ${nextTime.toLocaleTimeString()}`);
      setTimeout(async () => {
        const stockData = await this.fetchGAGStock();
        if (stockData?.data?.lastGlobalUpdate && stockData.data.lastGlobalUpdate !== lastGlobalUpdate) {
          lastGlobalUpdate = stockData.data.lastGlobalUpdate;

          const allItems = [
            ...(stockData.data.seeds || []),
            ...(stockData.data.gear || []),
            ...(stockData.data.events || []),
            ...(stockData.data.honey || [])
          ].filter(i => ["seed", "gear", "egg"].includes(i.type));

          if (allItems.length > 0) await this.sendStock(client, allItems);
        } else {
          console.log("⌛ No stock changes detected this interval.");
        }

        loop(); // repeat forever
      }, delay);
    };

    loop();
  }
};