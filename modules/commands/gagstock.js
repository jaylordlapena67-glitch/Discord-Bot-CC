const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "gagstock",
  version: "2.3.0",
  credits: "Jaz La Peña + ChatGPT",
  description: "Auto-check Grow a Garden stock with compact Discord updates",
};

const STOCK_FILE = path.join(__dirname, "gag_latest_stock.json");
const INTERVAL = 320000; // 5m 20s
const CHANNEL_ID = "1426901600030429317"; // <-- replace with your channel ID

// ✅ Connect to Grow a Garden WebSocket and get stock
function getStockData() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://ws.growagardenpro.com", [], {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        origin: "https://growagardenpro.com",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      },
    });

    ws.onopen = () => console.log("🌱 [GAG] Connected to WebSocket");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        resolve(data);
      } catch (err) {
        console.error("❌ [GAG] Failed to parse stock data:", err.message);
        resolve(event.data);
      }
      ws.close();
    };

    ws.onerror = (err) => reject(err);
    ws.onclose = () => console.log("🔒 [GAG] Connection closed\n");
  });
}

// ✅ Load old stock
function loadOldStock() {
  if (!fs.existsSync(STOCK_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STOCK_FILE, "utf8"));
  } catch {
    return {};
  }
}

// ✅ Save stock
function saveStock(data) {
  fs.writeFileSync(STOCK_FILE, JSON.stringify(data, null, 2));
}

// ✅ Compare old vs new and return only changes
function getChanges(oldStock, newStock) {
  const changes = {};
  for (const key in newStock) {
    if (JSON.stringify(oldStock[key]) !== JSON.stringify(newStock[key])) {
      changes[key] = newStock[key];
    }
  }
  for (const key in oldStock) {
    if (!(key in newStock)) {
      changes[key] = null; // null = removed
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ✅ Send compact stock updates
async function sendStockUpdate(client, changes) {
  let channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    try {
      channel = await client.channels.fetch(CHANNEL_ID);
    } catch (err) {
      console.error("❌ [GAG] Failed to fetch channel:", err.message);
      return;
    }
  }

  const time = new Date().toLocaleTimeString();
  let msg = `🪴 **Grow a Garden Stock Update (${time})**\n`;

  for (const [item, value] of Object.entries(changes)) {
    if (value === null) {
      msg += `❌ Removed: **${item}**\n`;
    } else if (typeof value === "object") {
      // Compact JSON for object values
      msg += `✅ Updated: **${item}** → ${JSON.stringify(value).replace(/[{}"]/g, "")}\n`;
    } else {
      msg += `✅ Updated: **${item}** → ${value}\n`;
    }
  }

  console.log("📤 [GAG] Sending stock update...");
  await channel.send(msg).catch((err) =>
    console.error("❌ [GAG] Failed to send message:", err.message)
  );
}

// === Main Loop ===
async function startLoop(client) {
  console.log(`🔁 [GAG] Starting stock watcher loop (${INTERVAL / 1000}s interval)...`);

  while (true) {
    try {
      const newStock = await getStockData();
      const oldStock = loadOldStock();
      const changes = getChanges(oldStock, newStock);

      if (changes) {
        console.log("⚡ [GAG] Changes detected!");
        saveStock(newStock);
        await sendStockUpdate(client, changes);
      } else {
        console.log("⏳ [GAG] No changes in stock.");
      }
    } catch (err) {
      console.error("❌ [GAG] Error:", err.message);
    }

    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

// === Lifecycle Hooks ===
module.exports.onReady = async (client) => {
  console.log("✅ [GAG] Grow a Garden stock watcher initialized");
  startLoop(client);
};

module.exports.checkForUpdate = async () => false;
module.exports.letStart = async ({ message }) => {
  await message.reply("🌱 Grow a Garden stock watcher is running automatically.");
};