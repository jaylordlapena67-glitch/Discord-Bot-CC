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
    "Water Bucket": "🪣💧",
    "Frost Grenade": "🧊💣",
    "Banana Gun": "🍌🔫",
    "Frost Blower": "❄️🌬️",
    "Lucky Potion": "🍀🧪",
    "Speed Potion": "⚡🧪",
    "Carrot Launcher": "🥕🚀",
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
    return this.MANUAL_RARITY[name.replace(/ Seed$/i, "")] || "unknown";
  },

  getEmoji(name) {
    return this.ITEM_EMOJI[name.replace(/ Seed$/i, "")] || "❔";
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

    const seeds = items.filter((i) => i.name.toLowerCase().includes("seed"));
    const gear = items.filter((i) => !i.name.toLowerCase().includes("seed"));

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const timeString = now.toLocaleTimeString("en-PH", {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
    });

    const formatList = (list) =>
      list.length
        ? list.map((i) => `${this.getEmoji(i.name)} ${i.name.replace(/ Seed$/i, "")} x${i.currentStock ?? "?"}`).join("\n")
        : "❌ Empty";

    const seedsText = formatList(seeds);
    const gearText = formatList(gear);

    const RARITY_ROLES = {
      godly: "1427517104780869713",
      secret: "1427517229129404477",
    };

    const pingRoles = [];
    const specialItems = [];

    for (const i of seeds) {
      const rarity = this.getRarity(i.name);
      if (["godly", "secret"].includes(rarity) && (i.currentStock ?? 0) > 0) {
        specialItems.push(i);
        if (rarity === "godly") pingRoles.push(RARITY_ROLES.godly);
        if (rarity === "secret") pingRoles.push(RARITY_ROLES.secret);
      }
    }

    const ping = [...new Set(pingRoles)].map((id) => `<@&${id}>`).join(" ");
    const specialMentions = specialItems.map((i) => `@${i.name.replace(/ Seed$/i, "")}`).join(" ");

    const embed = new EmbedBuilder()
      .setTitle(`Plants vs Brainrots Stock - ${timeString}`)
      .setDescription(`**Seeds**\n${seedsText}\n\n**Gear**\n${gearText}`)
      .setColor("#FF69B4");

    const msg = await channel.send({
      content: [specialMentions || null, ping || null].filter(Boolean).join(" "),
      embeds: [embed],
    });

    try {
      await msg.react("🇼");
      await msg.react("🇱");
    } catch (err) {
      console.error("⚠️ Failed to add reactions:", err.message);
    }

    lastUpdatedAt = updatedAt;
  },

  async checkForUpdate(client) {
    try {
      const guild = client.guilds.cache.first();
      const channelId = (await getData("pvbstock/discord"))?.[guild.id]?.channelId;
      if (!channelId) return false;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return false;

      const { updatedAt } = await this.fetchPVBRStock();
      if (!updatedAt || updatedAt === lastUpdatedAt) return false;

      await this.sendStock(channel);
      return true;
    } catch (err) {
      console.error("❌ PVBR checkForUpdate error:", err);
      return false;
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
      if (gcData.enabled)
        return message.reply("✅ PVBR Auto-stock is already **enabled**.");
      gcData.enabled = true;
      gcData.channelId = channel.id;
      allData[guildId] = gcData;
      await setData("pvbstock/discord", allData);
      return message.reply("✅ PVBR Auto-stock **enabled**! Updates will be sent automatically.");
    }

    if (action === "off") {
      if (!gcData.enabled)
        return message.reply("⚠️ PVBR Auto-stock is already **disabled**.");
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
        .setColor("#FF69B4");
      return message.reply({ embeds: [embed] });
    }
  },

  async onReady(client) {
    console.log("🔁 PVBR module ready — fetching latest stock timestamp...");
    try {
      const stockData = await this.fetchPVBRStock();
      if (stockData.updatedAt) lastUpdatedAt = stockData.updatedAt;
      console.log("✅ LastUpdatedAt set to:", lastUpdatedAt);

      setInterval(async () => {
        await this.checkForUpdate(client);
      }, 1000);
    } catch (err) {
      console.error("❌ Error initializing PVBR loop:", err);
    }
  },
};