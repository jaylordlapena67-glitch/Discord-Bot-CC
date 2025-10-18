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
    Cactus: "common",
    Strawberry: "common",
    Pumpkin: "common",
    Sunflower: "common",
    "Dragon Fruit": "common",
    "Water Bucket": "epic",
    "Frost Grenade": "epic",
    "Banana Gun": "epic",
  },

  getRarity(name) {
    return this.MANUAL_RARITY[name.replace(/ Seed$/i, "")] || "unknown";
  },

  getEmoji(name) {
    return this.ITEM_EMOJI[name.replace(/ Seed$/i, "")] || "❔";
  },

  formatItems(items) {
    if (!items?.length) return "❌ Empty";
    const grouped = {};
    for (const i of items) {
      const type = this.getRarity(i.name);
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(
        `• ${this.getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${i.currentStock ?? "?"})`
      );
    }
    const order = ["common","rare","epic","legendary","mythic","godly","secret","unknown"];
    return order
      .filter(cat => grouped[cat])
      .map(cat => `[${this.CATEGORY_EMOJI[cat]} ${cat.toUpperCase()}]\n${grouped[cat].join("\n")}`)
      .join("\n\n");
  },

  async fetchPVBRStock() {
    try {
      const res = await axios.get("https://plantsvsbrainrotsstocktracker.com/api/stock?since=0");
      return res.data || { items: [], updatedAt: null };
    } catch (e) {
      console.error("❌ Error fetching PVBR stock:", e);
      return { items: [], updatedAt: null };
    }
  },

  async sendStock(channel) {
    const { items, updatedAt } = await this.fetchPVBRStock();
    if (!items?.length) return channel.send("⚠️ Failed to fetch PVBR stock.");

    // Filter items by category
    const seeds = items.filter(i => i.category === "seed");
    const gear = items.filter(i => i.category === "gear");

    const seedsText = this.formatItems(seeds);
    const gearText = this.formatItems(gear);

    // Ping for special stock
    const RARITY_ROLES = { godly: "1426897330644189217", secret: "1426897330644189217" };
    const pingRoles = [];
    if (seeds.some(i => ["godly","secret"].includes(this.getRarity(i.name)) && (i.currentStock ?? 0) > 0))
      pingRoles.push(...Object.values(RARITY_ROLES));

    const ping = pingRoles.map(id => `<@&${id}>`).join(" ");

    const privateServerChannelId = "1426903128565088357";
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const timeString = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

    let description = `**Seeds**\n${seedsText || "❌ Empty"}\n\n**Gear**\n${gearText || "❌ Empty"}`;

    const hasSpecialStock = seeds.some(
      i => ["godly", "secret"].includes(this.getRarity(i.name)) && (i.currentStock ?? 0) > 0
    );

    if (hasSpecialStock) {
      description += `\n\n🎉 Join fast! Here's a private server list: <#${privateServerChannelId}>`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Plants vs Brainrots Stock - ${timeString}`)
      .setDescription(description)
      .setColor(0xff0080);

    await channel.send({ content: ping || null, embeds: [embed] });
    lastUpdatedAt = updatedAt;
  },

  async checkForUpdate(client) {
    try {
      const allData = (await getData("pvbstock/discord")) || {};
      for (const [guildId, guildData] of Object.entries(allData)) {
        if (!guildData.enabled || !guildData.channelId) continue;

        const channel = await client.channels.fetch(guildData.channelId).catch(() => null);
        if (!channel) continue;

        const { updatedAt } = await this.fetchPVBRStock();
        if (!updatedAt || updatedAt === lastUpdatedAt) continue;

        await this.sendStock(channel);
      }
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
        .setColor(0xff0080);
      return message.reply({ embeds: [embed] });
    }
  },

  async onReady(client) {
    console.log("🔁 PVBR module ready — fetching latest stock timestamp...");
    try {
      const { updatedAt } = await this.fetchPVBRStock();
      if (updatedAt) lastUpdatedAt = updatedAt;
      console.log("✅ LastUpdatedAt set to:", lastUpdatedAt);

      // Check for updates every 10 seconds
      setInterval(async () => {
        await this.checkForUpdate(client);
      }, 10000);
    } catch (err) {
      console.error("❌ Error initializing PVBR loop:", err);
    }
  },
};