const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

module.exports.config = {
  name: "gagstock",
  version: "3.1.0",
  credits: "Jaz La Peña + ChatGPT",
  description: "Send full Grow a Garden stock every 5m20s in JSON, aligned to clock",
};

const INTERVAL_MS = 5 * 60 * 1000 + 20 * 1000; // 5m20s
const CHANNEL_ID = "1426901600030429317"; // Replace with your Discord channel ID

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
        let stockItems = {};
        if (data.stock) stockItems = data.stock;
        else if (data.items) stockItems = data.items;
        else stockItems = data;
        resolve(stockItems);
      } catch (err) {
        console.error("❌ [GAG] Failed to parse stock data:", err.message);
        resolve({});
      }
      ws.close();
    };

    ws.onerror = (err) => reject(err);
    ws.onclose = () => console.log("🔒 [GAG] Connection closed\n");
  });
}

// ✅ Send all stock to Discord in JSON code block, split if too long
async function sendStockUpdate(client, stock) {
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
  const header = `🪴 **Grow a Garden Stock Update (${time})**\n`;

  const stockJson = JSON.stringify(stock, null, 2);
  const lines = stockJson.split("\n");

  let chunk = header + "```json\n";
  for (const line of lines) {
    if ((chunk.length + line.length + 5) > 2000) { // +5 for closing ```
      chunk += "```";
      await channel.send(chunk);
      chunk = "```json\n" + line + "\n"; // start new message
    } else {
      chunk += line + "\n";
    }
  }

  if (chunk.length > 10) chunk += "```"; // close last message
  if (chunk.length > 0) await channel.send(chunk);

  console.log("📤 [GAG] Stock sent successfully in separate messages if too long!");
}

// ✅ Calculate delay until next aligned 5m20s interval
function getInitialDelay() {
  const now = new Date();
  const totalSeconds = now.getMinutes() * 60 + now.getSeconds();
  const remainder = totalSeconds % (INTERVAL_MS / 1000);
  const delaySeconds = (INTERVAL_MS / 1000) - remainder;
  return delaySeconds * 1000;
}

// ✅ Run a single stock update
async function runStockUpdate(client) {
  try {
    const stock = await getStockData();
    await sendStockUpdate(client, stock);
  } catch (err) {
    console.error("❌ [GAG] Error:", err.message);
  }
}

// ✅ Start aligned loop
async function startAlignedLoop(client) {
  const delay = getInitialDelay();
  console.log(`⏱ [GAG] First stock update in ${Math.ceil(delay / 1000)} seconds to align with 5m20s intervals`);

  setTimeout(() => {
    runStockUpdate(client); // first update

    setInterval(() => {
      runStockUpdate(client); // repeat every 5m20s
    }, INTERVAL_MS);
  }, delay);
}

// === Lifecycle Hooks ===
module.exports.onReady = async (client) => {
  console.log("✅ [GAG] Grow a Garden stock watcher initialized");
  startAlignedLoop(client);
};

module.exports.checkForUpdate = async () => false;

module.exports.letStart = async ({ message }) => {
  await message.reply("🌱 Grow a Garden stock watcher is running automatically.");
};