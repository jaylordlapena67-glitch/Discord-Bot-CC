const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const https = require("https");
const { getData, setData } = require("../../database.js");

let lastUpdatedAt = null;

module.exports = {
  config: {
    name: "gagstock",
    description: "Grow A Garden auto-stock updates (Admin only)",
    usage: "-gagstock <on|off|check>",
    cooldown: 5,
    permission: 0,
    aliases: ["gagstocks"]
  },

  ITEM_EMOJI: {
    "Carrot": "🥕", "Strawberry": "🍓", "Blueberry": "🫐", "Orange Tulip": "🌷",
    "Tomato": "🍅", "Corn": "🌽", "Daffodil": "🌼", "Watermelon": "🍉",
    "Pumpkin": "🎃", "Apple": "🍎", "Bamboo": "🎍", "Coconut": "🥥",
    "Cactus": "🌵", "Dragon Fruit": "🐉", "Mango": "🥭", "Grape": "🍇",
    "Mushroom": "🍄", "Pepper": "🌶️", "Beanstalk": "🪴",
    "Watering Can": "💧", "Trowel": "🔨", "Trading Ticket": "🎟️",
    "Master Sprinkler": "🌟💦", "Grandmaster Sprinkler": "🌊🔥",
    "Honey Sprinkler": "🍯💦", "Level-Up Lollipop": "🍭",
    "Great Pumpkin": "🎃",
    "Crimson Thorn": "🌹"
  },

  SPECIAL_ITEMS: ["grandmaster sprinkler", "great pumpkin", "level-up lollipop"],
  SPECIAL_ROLE: "1426897330644189217", // Only 1 role ping for special items

  getEmoji(name) {
    return this.ITEM_EMOJI[name] || "❔";
  },

  formatItems(items) {
    if (!items?.length) return "❌ Empty";
    return items
      .map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`)
      .join("\n");
  },

  fetchStocks() {
    return new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        hostname: "growagarden.gg",
        path: "/api/stock",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          referer: "https://growagarden.gg/api/stocks",
          "user-agent": "Mozilla/5.0"
        }
      };
      const req = https.request(options, res => {
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
  },

  async sendStock(channel) {
    try {
      const data = await this.fetchStocks();
      if (!data) return channel.send("⚠️ Failed to fetch GAG stock.");

      const gearItems = data.gearStock || [];
      const seedItems = data.seedsStock || [];
      const eggItems = data.eggStock || [];

      const allItems = [...gearItems, ...seedItems, ...eggItems];

      // ✅ Ping role if any special item exists
      const hasSpecial = allItems.some(i => 
        this.SPECIAL_ITEMS.includes(i.name.toLowerCase()) && (i.quantity ?? 0) > 0
      );
      const ping = hasSpecial ? `<@&${this.SPECIAL_ROLE}>` : null;

      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
      const next = new Date(now);
      next.setMinutes(next.getMinutes() + 5 - (now.getMinutes() % 5)); // next 5-min interval
      next.setSeconds(0, 0);

      const embed = new EmbedBuilder()
        .setTitle("🌱 Grow A Garden Stock Update")
        .setDescription(`🕒 Current PH Time: ${now.toLocaleTimeString("en-PH", { hour12: true })}\n🕒 Next Restock: ${next.toLocaleTimeString("en-PH", { hour12: true })}`)
        .addFields(
          { name: "🥚 Eggs", value: this.formatItems(eggItems).slice(0, 1024) || "❌ Empty" },
          { name: "🌱 Seeds", value: this.formatItems(seedItems).slice(0, 1024) || "❌ Empty" },
          { name: "🛠️ Gear", value: this.formatItems(gearItems).slice(0, 1024) || "❌ Empty" }
        )
        .setColor("Green");

      await channel.send({ content: ping, embeds: [embed] });
      lastUpdatedAt = now.getTime();
    } catch (err) {
      console.error("Error fetching/sending stock:", err);
    }
  },

  async letStart({ args, message }) {
    const member = message.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("🚫 Only Admins can use this command.");

    const action = args[0]?.toLowerCase();
    if (!["on","off","check"].includes(action))
      return message.reply("⚠️ Invalid action! Use `on`, `off`, or `check`.");

    const channel = message.channel;
    const guildId = message.guild.id;
    const allData = await getData("gagstock/discord") || {};
    const gcData = allData[guildId] || { enabled: false, channelId: null };

    if (action === "on") {
      if (gcData.enabled) return message.reply("✅ GAG Auto-stock is already **enabled**.");
      gcData.enabled = true;
      gcData.channelId = channel.id;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      this.sendStock(channel);
      setInterval(() => this.sendStock(channel), 5 * 60 * 1000);
      return message.reply("✅ GAG Auto-stock **enabled**! Updates will be sent automatically.");
    }

    if (action === "off") {
      if (!gcData.enabled) return message.reply("⚠️ GAG Auto-stock is already **disabled**.");
      gcData.enabled = false;
      allData[guildId] = gcData;
      await setData("gagstock/discord", allData);
      return message.reply("🛑 GAG Auto-stock **disabled**.");
    }

    if (action === "check") {
      const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
      const location = gcData.channelId ? `<#${gcData.channelId}>` : "None";
      const embed = new EmbedBuilder()
        .setTitle("📊 Grow A Garden Auto-stock Status")
        .addFields(
          { name: "Status", value: status, inline: true },
          { name: "Channel", value: location, inline: true }
        )
        .setColor("Green");
      return message.reply({ embeds: [embed] });
    }
  },

  async onReady(client) {
    const allData = await getData("gagstock/discord") || {};
    for (const [guildId, gcData] of Object.entries(allData)) {
      if (gcData.enabled && gcData.channelId) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(gcData.channelId);
        if (channel) {
          this.sendStock(channel);
          setInterval(() => this.sendStock(channel), 5 * 60 * 1000);
          console.log(`🔁 Auto-stock resumed for guild ${guild.name}`);
        }
      }
    }
  }
};