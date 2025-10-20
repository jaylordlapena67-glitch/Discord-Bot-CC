const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { setData, getData } = require("../../database.js");

let lastUpdatedAt = null;

module.exports = {
  config: {
    name: "pvbstock",
    description: "Plants vs Brainrots auto-stock every restock time (Admin only)",
    usage: "-pvbstock <on|off|check>",
    cooldown: 5,
    permission: 0,
    aliases: ["pvbstocks"],
  },

  ITEM_EMOJI: {
    Cactus: "🌵",
    Strawberry: "🍓",
    Pumpkin: "🎃",
    Sunflower: "🌻",
    "Dragon Fruit": "🐉🍉",
    "Water Bucket": "🪣💧",
    "Frost Grenade": "🧊💣",
    "Banana Gun": "🍌🔫",
    Eggplant: "🍆",
    Watermelon: "🍉✨",
    Grape: "🍇✨",
    Cocotank: "🥥🛡️",
    "Carnivorous Plant": "🪴🦷",
    "King Limone": "🍋",
    Mango: "🥭",
    "Mr Carrot": "🥕🎩",
    Tomatrio: "🍅👨‍👦‍👦",
    Shroombino: "🍄🎭",
    Bat: "⚾",
    "Frost Blower": "❄️🌬️",
    "Lucky Potion": "🍀🧪",
    "Speed Potion": "⚡🧪",
    "Carrot Launcher": "🥕🚀",
  },

  CATEGORY_EMOJI: {
    common: "🟢",
    rare: "🌿",
    epic: "🔵",
    legendary: "🟣",
    mythic: "✨",
    godly: "🟡",
    secret: "🎩",
    unknown: "❔",
  },

  MANUAL_RARITY: {
    Cactus: "rare",
    Strawberry: "rare",
    Pumpkin: "epic",
    Sunflower: "epic",
    "Dragon Fruit": "legendary",
    Eggplant: "legendary",
    Watermelon: "mythic",
    Grape: "mythic",
    Cocotank: "godly",
    "Carnivorous Plant": "godly",
    "King Limone": "secret",
    Mango: "secret",
    "Mr Carrot": "secret",
    Tomatrio: "secret",
    Shroombino: "secret",
    Bat: "common",
    "Water Bucket": "epic",
    "Frost Grenade": "epic",
    "Banana Gun": "epic",
    "Frost Blower": "legendary",
    "Lucky Potion": "legendary",
    "Speed Potion": "legendary",
    "Carrot Launcher": "godly",
  },

  getRarity(name) {
    const cleanName = name.replace(/ Seed$/i, "").trim();
    return this.MANUAL_RARITY[cleanName] || "unknown";
  },

  getEmoji(name) {
    const cleanName = name.replace(/ Seed$/i, "").trim();
    return this.ITEM_EMOJI[cleanName] || "❔";
  },

  formatItems(items) {
    if (!items?.length) return "❌ Empty";
    const grouped = {};

    // Group by rarity and format item info
    for (const i of items) {
      const type = this.getRarity(i.name);
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(
        `• ${this.getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${i.currentStock ?? "?"}, Price: ${i.currentPrice ?? "?"})`
      );
    }

    const order = ["common", "rare", "epic", "legendary", "mythic", "godly", "secret", "unknown"];
    return order
      .filter(cat => grouped[cat])
      .map(cat => `[${this.CATEGORY_EMOJI[cat]} ${cat.toUpperCase()}]\n${grouped[cat].join("\n")}`)
      .join("\n\n");
  },

  async fetchPVBRStock() {
    try {
      const res = await axios.get("https://plantsvsbrainrotsstocktracker.com/api/stock?since=0");
      return res.data || {};
    } catch (e) {
      console.error("❌ Error fetching PVBR stock:", e);
      return {};
    }
  },

  async sendStock(channel) {
    const { items, updatedAt } = await this.fetchPVBRStock();
    if (!items?.length) return channel.send("⚠️ Failed to fetch PVBR stock.");

    // Group items by category
    const seeds = items.filter(i => i.category === "seed");
    const gear = items.filter(i => i.category === "gear");

    // Format and display the items
    const seedsText = this.formatItems(seeds);
    const gearText = this.formatItems(gear);

    const ITEM_ROLES = {
      "King Limone": "1429082109934309470",
      "Mango": "1429082598121930783",
      "Shroombino": "1429082733581303869",
      "Tomatrio": "1429082909460922508",
      "Mr Carrot": "1429083035982233641",
      "Carnivorous Plant": "1429083268925493440",
      "Cocotank": "1429083369609625640",
      "Grape": "1429083522722828379",
      "Watermelon": "1429083636921270292",
      "Eggplant": "1429083760560963768",
      "Dragon Fruit": "1429083864638423050",
    };

    const pingRoles = [];

    // Add roles for available items
    for (const item of items) {
      const name = item.name.replace(/ Seed$/i, "").trim();
      const stock = item.currentStock ?? 0;
      if (stock > 0 && ITEM_ROLES[name]) pingRoles.push(ITEM_ROLES[name]);
    }

    const uniquePings = [...new Set(pingRoles)];
    const ping = uniquePings.map(id => `<@&${id}>`).join(" ");

    const privateServerChannelId = "1426903128565088357";
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const timeString = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

    const description = `**Seeds**\n${seedsText.slice(0, 1024) || "❌ Empty"}\n\n**Gear**\n${
      gearText.slice(0, 1024) || "❌ Empty"
    }\n\n🏃‍♂️ **Join Fast! Here’s the list of private server!** <#${privateServerChannelId}>`;

    const embed = new EmbedBuilder()
      .setTitle(`Plants vs Brainrots Stock - ${timeString}`)
      .setDescription(description.slice(0, 4096))
      .setColor(0xff0080);

    await channel.send({ content: ping || "", embeds: [embed] });
    lastUpdatedAt = updatedAt;
  },

  async checkForUpdate(client) {
    try {
      const allData = (await getData("pvbstock/discord")) || {};
      for (const [guildId, data] of Object.entries(allData)) {
        if (!data.enabled || !data.channelId) continue;
        const channel = await client.channels.fetch(data.channelId).catch(() => null);
        if (!channel) continue;

        const { updatedAt } = await this.fetchPVBRStock();
        if (updatedAt && updatedAt !== lastUpdatedAt) {
          await this.sendStock(channel);
          lastUpdatedAt = updatedAt;
          console.log(`✅ PVBR stock updated in guild ${guildId}`);
        }
      }
    } catch (err) {
      console.error("❌ PVBR checkForUpdate error:", err);
    }
  },

  async letStart({ args, message }) {
    const member = message.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("🚫 Only Admins can use this command.");

    const action = args[0]?.toLowerCase();
    if (!["on", "off", "check"].includes(action))
      return message.reply("⚠️ Invalid action! Use `on`, `off`, or `check`.");

    const channel = message.channel;
    const guildId = message.guild.id;
    const allData = (await getData("pvbstock/discord")) || {};
    const gcData = allData[guildId] || { enabled: false, channelId: null };

    if (action === "on") {
      gcData.enabled = true;
      gcData.channelId = channel.id;
      allData[guildId] = gcData;
      await setData("pvbstock/discord", allData);
      return message.reply("✅ PVBR Auto-stock **enabled** for this channel!");
    }

    if (action === "off") {
      gcData.enabled = false;
      allData[guildId] = gcData;
      await setData("pvbstock/discord", allData);
      return message.reply("🛑 PVBR Auto-stock **disabled**.");
    }

    if (action === "check") {
      const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
      const location = gcData.channelId ? `<#${gcData.channelId}>` : "`None`";
      const embed = new EmbedBuilder()
        .setTitle("📊 PVBR Auto-stock Status")
        .addFields(
          { name: "Status", value: status, inline: true },
          { name: "Channel", value: location, inline: true }
        )
        .setColor(0xff0080);
      return message.reply({ embeds: [embed] });
    }
  },
};