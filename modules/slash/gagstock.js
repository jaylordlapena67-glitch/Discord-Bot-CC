const https = require("https");
const { EmbedBuilder } = require("discord.js");
const { getData, setData } = require("../../../database.js");

const autoStockTimers = {};
const autoStockTimeouts = {};

const ITEM_EMOJI = {
  "Carrot": "🥕", "Strawberry": "🍓", "Blueberry": "🫐", "Orange Tulip": "🌷",
  "Tomato": "🍅", "Corn": "🌽", "Daffodil": "🌼", "Watermelon": "🍉",
  "Pumpkin": "🎃", "Apple": "🍎", "Bamboo": "🎍", "Coconut": "🥥",
  "Cactus": "🌵", "Dragon Fruit": "🐉", "Mango": "🥭", "Grape": "🍇",
  "Mushroom": "🍄", "Pepper": "🌶️", "Beanstalk": "🪴", "Ember Lily": "🔥🌸",
  "Sugar Apple": "🍏", "Burning Bud": "🔥🌱", "Giant Pinecone": "🌲",
  "Elder Strawberry": "🍓✨", "Romanesco": "🥦", "Potato": "🥔",
  "Brussels Sprouts": "🥬", "Cocomango": "🥭🥥", "Broccoli": "🥦",

  "Common Egg": "🥚", "Uncommon Egg": "🥚✨", "Rare Egg": "🥚💎",
  "Legendary Egg": "🥚🌟", "Mythical Egg": "🥚🔥", "Bug Egg": "🐛🥚",

  "Watering Can": "💧", "Trowel": "🔨", "Trading Ticket": "🎟️",
  "Recall Wrench": "🔧", "Basic Sprinkler": "🌊", "Advanced Sprinkler": "💦",
  "Medium Treat": "🍪", "Medium Toy": "🧸", "Night Staff": "🌙",
  "Star Caller": "⭐", "Garden Guide": "📖", "Godly Sprinkler": "🌪️",
  "Chocolate Sprinkler": "🍫", "Magnifying Glass": "🔍",
  "Master Sprinkler": "🌟💦", "Grandmaster Sprinkler": "🌊🔥",
  "Honey Sprinkler": "🍯💦", "Favorite Tool": "🛠️",
  "Silver Fertilizer": "⚪", "Level Up Lollipop": "🍭"
};

function getEmoji(name) {
  return ITEM_EMOJI[name] || "❔";
}

function getNext5Min(date = null) {
  const now = date || new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  let minutes = now.getMinutes();
  let nextMinutes = Math.floor(minutes / 5) * 5 + 1;
  if (nextMinutes <= minutes) nextMinutes += 5;
  const next = new Date(now);
  next.setMinutes(nextMinutes);
  next.setSeconds(0, 0);
  if (nextMinutes >= 60) {
    next.setHours(now.getHours() + 1);
    next.setMinutes(nextMinutes % 60);
  }
  return next;
}

function fetchStocks() {
  const options = {
    method: "GET",
    hostname: "growagarden.gg",
    path: "/api/stock",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      referer: "https://growagarden.gg/stocks"
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", e => reject(e));
    req.end();
  });
}

function formatSectionText(items) {
  if (!items || items.length === 0) return "❌ Empty";
  return items.map(i => `• ${getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`).join("\n");
}

async function sendStock(channel) {
  const gcData = await getData(`stock/${channel.id}`);
  if (!gcData?.enabled) return;

  const data = await fetchStocks();
  if (!data) return;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const next = getNext5Min();

  const embed = new EmbedBuilder()
    .setColor("#00ff80")
    .setTitle("🌱 GrowAGarden Auto-Stock Update")
    .setDescription(
      `🕒 **Current PH Time:** ${now.toLocaleTimeString("en-PH", { hour12: false })}\n` +
      `🔄 **Next Restock:** ${next.toLocaleTimeString("en-PH", { hour12: false })}`
    )
    .addFields(
      { name: "🛠️ Gear", value: formatSectionText(data.gearStock), inline: false },
      { name: "🥚 Eggs", value: formatSectionText(data.eggStock), inline: false },
      { name: "🌱 Seeds", value: formatSectionText(data.seedsStock), inline: false }
    )
    .setFooter({ text: "Updates every 5 minutes" });

  await channel.send({ embeds: [embed] });
}

async function startAutoStock(channel) {
  const gcData = await getData(`stock/${channel.id}`);
  if (!gcData?.enabled) return;

  if (autoStockTimers[channel.id]) return;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const next = getNext5Min(now);
  const delay = next.getTime() - now.getTime();

  autoStockTimeouts[channel.id] = setTimeout(() => {
    sendStock(channel);
    autoStockTimers[channel.id] = setInterval(() => sendStock(channel), 5 * 60 * 1000);
  }, delay);
}

function stopAutoStock(channelId) {
  if (autoStockTimers[channelId]) {
    clearInterval(autoStockTimers[channelId]);
    delete autoStockTimers[channelId];
  }
  if (autoStockTimeouts[channelId]) {
    clearTimeout(autoStockTimeouts[channelId]);
    delete autoStockTimeouts[channelId];
  }
}

module.exports = {
  name: "gagstock",
  description: "Enable/disable GrowAGarden auto-stock updates (every 5 mins)",
  async execute(message, args) {
    const option = args[0]?.toLowerCase();
    const channel = message.channel;

    // ✅ Only admins can use
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("❌ Only **server admins** can use this command.");
    }

    let gcData = (await getData(`stock/${channel.id}`)) || { enabled: false };

    if (option === "on") {
      if (gcData.enabled) return message.reply("⚠️ Auto-stock already **enabled**.");
      gcData.enabled = true;
      await setData(`stock/${channel.id}`, gcData);
      startAutoStock(channel);
      return message.reply("✅ Auto-stock **enabled**. Updates every 5 minutes.");
    }

    if (option === "off") {
      gcData.enabled = false;
      await setData(`stock/${channel.id}`, gcData);
      stopAutoStock(channel.id);
      return message.reply("❌ Auto-stock **disabled**.");
    }

    if (option === "check") {
      const status = gcData.enabled ? "🟢 ON" : "🔴 OFF";
      return message.reply(`📊 Auto-stock status: **${status}**`);
    }

    return message.reply("⚙️ Usage: `gagstock on | off | check`");
  },

  // 🔁 Resume auto stock when bot restarts
  async onLoad(client) {
    const allData = (await getData("stock")) || {};
    for (const id in allData) {
      if (allData[id].enabled) {
        const channel = await client.channels.fetch(id).catch(() => null);
        if (channel) {
          startAutoStock(channel);
          channel.send("♻️ Bot restarted — auto-stock resumed.");
        }
      } else stopAutoStock(id);
    }
  }
};