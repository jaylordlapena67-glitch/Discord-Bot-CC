const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "gagstock",
  version: "2.0.0",
  credits: "Jaz La Peña + ChatGPT",
  description: "Auto-check Grow a Garden stock every 5m20s and send update",
};

const STOCK_FILE = path.join(__dirname, "gag_latest_stock.json");

// ✅ Connect to Grow a Garden WebSocket
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
      } catch {
        resolve(event.data);
      }
      ws.close();
    };

    ws.onerror = (err) => reject(err);
    ws.onclose = () => console.log("🔒 [GAG] Connection closed\n");
  });
}

// ✅ Compare new vs old stock to detect changes
function detectChanges(newData) {
  if (!fs.existsSync(STOCK_FILE)) return true;
  const oldData = JSON.parse(fs.readFileSync(STOCK_FILE, "utf8"));
  return JSON.stringify(oldData) !== JSON.stringify(newData);
}

// ✅ Save new stock
function saveStock(data) {
  fs.writeFileSync(STOCK_FILE, JSON.stringify(data, null, 2));
}

// ✅ Send stock info to channel
async function sendStockUpdate(client, data) {
  const channelId = "1426901600030429317"; // <-- palitan mo kung saan mo gustong ipost
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  const time = new Date().toLocaleTimeString();
  const msg = `🪴 **Grow a Garden Stock Update (${time})**\n\`\`\`json\n${JSON.stringify(
    data,
    null,
    2
  )}\n\`\`\``;

  await channel.send(msg).catch(() => {});
}

// === Main Loop ===
async function startLoop(client) {
  console.log("🔁 [GAG] Starting stock watcher loop (5m 20s interval)...");

  while (true) {
    try {
      const stockData = await getStockData();
      const changed = detectChanges(stockData);

      if (changed) {
        console.log("⚡ [GAG] New stock detected!");
        saveStock(stockData);
        await sendStockUpdate(client, stockData);
      } else {
        console.log("⏳ [GAG] No change in stock.");
      }
    } catch (err) {
      console.error("❌ [GAG] Error:", err.message);
    }

    await new Promise((r) => setTimeout(r, 320000)); // 5m 20s
  }
}

// === Lifecycle Hooks ===
module.exports.onReady = async (client) => {
  console.log("✅ [GAG] Grow a Garden stock watcher initialized");
  startLoop(client);
};

module.exports.checkForUpdate = async () => false; // (main.js compatibility)

module.exports.letStart = async ({ message }) => {
  await message.reply("🌱 Grow a Garden stock watcher is running automatically.");
};