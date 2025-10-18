const { EmbedBuilder } = require("discord.js");
const WebSocket = require("ws");

module.exports.config = {
  name: "gagstock",
  version: "5.1.0",
  credits: "Jaz La Peña + ChatGPT",
  description: "Send Grow a Garden stock with full emojis every 5m20s, aligned to clock",
};

const INTERVAL_MS = 5 * 60 * 1000 + 20 * 1000; // 5m20s
const CHANNEL_ID = "1426901600030429317";

// === Full Emoji Mapping ===
const ITEM_EMOJI = {
  // Seeds
  Carrot: "🥕", Strawberry: "🍓", Blueberry: "🫐", Tomato: "🍅",
  Corn: "🌽", Daffodil: "🌼", Watermelon: "🌊", Pumpkin: "🎃",
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
};

// === Helper to get emoji ===
function getEmoji(name) {
  return ITEM_EMOJI[name.replace(/ Seed$/i, "")] || "❔";
}

// === Format items for embed ===
function formatItems(items) {
  if (!items?.length) return "❌ Empty";
  return items.map(i => `• ${getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${i.quantity ?? "?"})`).join("\n");
}

// === Fetch stock from WebSocket (working parsing like v3.1.0) ===
function getStockData() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://ws.growagardenpro.com", [], {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        origin: "https://growagardenpro.com",
        "user-agent": "Mozilla/5.0",
      },
    });

    ws.onopen = () => console.log("🌱 [GAG] Connected to WebSocket");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        let seeds = [], gear = [], eggs = [];

        // Parse according to new API
        if (data.data) {
          seeds = data.data.seeds || [];
          gear = data.data.gear || [];
          eggs = data.data.eggs || [];
        } else {
          // fallback like v3.1.0
          if (data.seeds) seeds = data.seeds;
          if (data.gear) gear = data.gear;
          if (data.eggs) eggs = data.eggs;
        }

        resolve({ seeds, gear, eggs });
      } catch (err) {
        console.error("❌ Failed to parse stock:", err.message);
        resolve({ seeds: [], gear: [], eggs: [] });
      }
      ws.close();
    };

    ws.onerror = (err) => reject(err);
    ws.onclose = () => console.log("🔒 [GAG] Connection closed\n");
  });
}

// === Send stock embed to Discord ===
async function sendStockUpdate(client, stock) {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

  const embed = new EmbedBuilder()
    .setTitle(`🪴 Grow a Garden Stock - ${now}`)
    .setColor(0x00ff00)
    .setDescription(
      `**Seeds**\n${formatItems(stock.seeds)}\n\n` +
      `**Gear**\n${formatItems(stock.gear)}\n\n` +
      `**Eggs**\n${formatItems(stock.eggs)}`
    );

  await channel.send({ embeds: [embed] });
  console.log("📤 Stock sent!");
}

// === Run stock update every 5m20s aligned ===
function getInitialDelay() {
  const now = new Date();
  const totalSeconds = now.getMinutes() * 60 + now.getSeconds();
  const remainder = totalSeconds % (INTERVAL_MS / 1000);
  return (INTERVAL_MS / 1000 - remainder) * 1000;
}

async function runStockUpdate(client) {
  const stock = await getStockData();
  await sendStockUpdate(client, stock);
}

async function startAlignedLoop(client) {
  const delay = getInitialDelay();
  console.log(`⏱ First stock update in ${Math.ceil(delay / 1000)}s to align`);

  setTimeout(() => {
    runStockUpdate(client);
    setInterval(() => runStockUpdate(client), INTERVAL_MS);
  }, delay);
}

module.exports.onReady = async (client) => {
  console.log("✅ GAG stock watcher initialized");
  startAlignedLoop(client);
};