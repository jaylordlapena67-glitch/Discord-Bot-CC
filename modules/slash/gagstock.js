const https = require("https");
const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { getData, setData } = require("../../../database.js");

const autoStockTimers = {};

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
  "Silver Fertilizer": "⚪", "Level-Up Lollipop": "🍭",
  "Great Pumpkin": "🎃", "Crimson Thorn": "🌹"
};

function getEmoji(name) {
  return ITEM_EMOJI[name] || "❔";
}

function getNextRestock() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const m = now.getMinutes();
  const next = new Date(now);
  const restockMinutes = [1,6,11,16,21,26,31,36,41,46,51,56];
  const nextM = restockMinutes.find(min => min > m);
  if(nextM !== undefined) next.setMinutes(nextM);
  else { next.setHours(next.getHours()+1); next.setMinutes(1); }
  next.setSeconds(20); next.setMilliseconds(0);
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
    const req = https.request(options, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(err){ reject(err); }
      });
    });
    req.on("error", e => reject(e));
    req.end();
  });
}

function formatSectionText(items) {
  if(!items || items.length === 0) return "❌ Empty";
  return items.map(i => `• ${getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`).join("\n");
}

async function sendStock(channel) {
  const gcData = await getData(`stock/${channel.id}`);
  if(!gcData?.enabled) return;

  const data = await fetchStocks();
  if(!data) return;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const next = getNextRestock();

  const embed = new EmbedBuilder()
    .setColor("#00ff80")
    .setTitle("🌱 GrowAGarden Auto-Stock Update")
    .setDescription(`🕒 Current PH Time: ${now.toLocaleTimeString("en-PH", { hour12: false })}\n🔄 Next Restock: ${next.toLocaleTimeString("en-PH", { hour12: false })}`)
    .addFields(
      { name: "🛠️ Gear", value: formatSectionText(data.gearStock), inline: false },
      { name: "🥚 Eggs", value: formatSectionText(data.eggStock), inline: false },
      { name: "🌱 Seeds", value: formatSectionText(data.seedsStock), inline: false }
    )
    .setFooter({ text: "Updates every restock time" });

  await channel.send({ embeds: [embed] });

  // Ping roles if configured
  if(gcData.pingRoles?.length) {
    await channel.send(`${gcData.pingRoles.map(id => `<@&${id}>`).join(" ")}`);
  }
}

async function scheduleNext(channel) {
  const next = getNextRestock();
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  let delay = next.getTime() - now.getTime();
  if(delay < 0) delay += 5*60*1000;

  if(autoStockTimers[channel.id]) clearTimeout(autoStockTimers[channel.id]);

  autoStockTimers[channel.id] = setTimeout(async () => {
    await sendStock(channel);
    scheduleNext(channel);
  }, delay);
}

function startAutoStock(channel) {
  if(autoStockTimers[channel.id]) return;
  scheduleNext(channel);
}

function stopAutoStock(channelId) {
  if(autoStockTimers[channelId]) {
    clearTimeout(autoStockTimers[channelId]);
    delete autoStockTimers[channelId];
  }
}

module.exports = {
  data: {
    name: "gagstock",
    description: "Enable/disable GrowAGarden auto-stock updates",
    options: [
      {
        name: "option",
        type: 3,
        description: "on | off | check",
        required: true
      }
    ]
  },

  async execute(interaction) {
    const option = interaction.options.getString("option")?.toLowerCase();
    const channel = interaction.channel;

    if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: "❌ Only **server admins** can use this command.", ephemeral: true });

    const allData = await getData("stock") || {};
    const gcData = allData[channel.id] || { enabled: false, pingRoles: [] };

    if(option === "on"){
      if(gcData.enabled) return interaction.reply({ content: "⚠️ Auto-stock already **enabled**.", ephemeral: true });
      gcData.enabled = true;
      allData[channel.id] = gcData;
      await setData("stock", allData);
      startAutoStock(channel);
      return interaction.reply({ content: "✅ Auto-stock **enabled**. Updates every restock time.", ephemeral: true });
    }

    if(option === "off"){
      gcData.enabled = false;
      allData[channel.id] = gcData;
      await setData("stock", allData);
      stopAutoStock(channel.id);
      return interaction.reply({ content: "❌ Auto-stock **disabled**.", ephemeral: true });
    }

    if(option === "check"){
      const status = gcData.enabled ? "🟢 ON" : "🔴 OFF";
      return interaction.reply({ content: `📊 Auto-stock status: **${status}**`, ephemeral: true });
    }

    return interaction.reply({ content: "⚙️ Usage: `/gagstock on | off | check`", ephemeral: true });
  },

  async onLoad(client){
    const allData = await getData("stock") || {};
    for(const channelId in allData){
      const channelData = allData[channelId];
      if(channelData.enabled){
        const channel = await client.channels.fetch(channelId).catch(()=>null);
        if(channel) startAutoStock(channel);
      }
    }
  }
};