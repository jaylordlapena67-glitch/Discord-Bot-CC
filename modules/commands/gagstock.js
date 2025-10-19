const { EmbedBuilder } = require("discord.js");
const { setData, getData } = require("../../database.js");
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

  formatItems(items) {
    if (!items?.length) return "❌ Empty";
    // Group items by type
    const groups = {
      Seeds: [],
      Gear: [],
      Eggs: [],
    };
    for (const i of items) {
      if (i.type === "seed") groups.Seeds.push(i);
      else if (i.type === "gear") groups.Gear.push(i);
      else if (i.type === "egg") groups.Eggs.push(i);
    }

    const formatGroup = (title, arr) =>
      `**${title}**\n${arr.map(x => `• ${this.getEmoji(x.name)} **${x.name}** (${x.quantity ?? "?"})`).join("\n") || "❌ Empty"}`;

    return [formatGroup("Seeds", groups.Seeds), formatGroup("Gear", groups.Gear), formatGroup("Eggs", groups.Eggs)].join("\n\n");
  },

  async fetchGAGStock() {
    return new Promise(resolve => {
      const ws = new WebSocket("wss://ws.growagardenpro.com"); // replace with actual endpoint
      ws.on("open", () => ws.send(JSON.stringify({ action: "getStock" })));
      ws.on("message", data => {
        resolve(JSON.parse(data));
        ws.close();
      });
      ws.on("error", err => {
        console.error("❌ GAG WS error:", err);
        resolve({});
      });
    });
  },

  async sendStock(client, items) {
    const channelId = "1426901600030429317"; // replace with your target channel
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const description = this.formatItems(items);
    const embed = new EmbedBuilder()
      .setTitle(`🌱 GAG Stock Update`)
      .setDescription(description)
      .setColor(0xff0080)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
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

  async onReady(client) {
    console.log("🔁 GAG module ready — fetching lastGlobalUpdate...");
    try {
      const stockData = await this.fetchGAGStock();
      if (stockData.lastGlobalUpdate) lastGlobalUpdate = stockData.lastGlobalUpdate;
      console.log("✅ lastGlobalUpdate set:", lastGlobalUpdate);

      const loop = async () => {
        const nextTime = this.getNextAligned5Min();
        const delay = nextTime - Date.now();
        console.log(`⏳ Waiting until next 5-min mark: ${nextTime.toLocaleTimeString()}`);
        setTimeout(async () => {
          let updated = false;

          // check every second until change is detected
          for (let i = 0; i < 300; i++) { // max 5 min
            const stockData = await this.fetchGAGStock();
            if (stockData.lastGlobalUpdate && stockData.lastGlobalUpdate !== lastGlobalUpdate) {
              lastGlobalUpdate = stockData.lastGlobalUpdate;
              await this.sendStock(client, stockData.items || []);
              updated = true;
              break;
            }
            await new Promise(res => setTimeout(res, 1000));
          }

          if (!updated) console.log("⌛ No stock changes detected in this interval.");
          loop(); // repeat forever
        }, delay);
      };

      loop();
    } catch (err) {
      console.error("❌ Error initializing GAG module loop:", err);
    }
  },
};