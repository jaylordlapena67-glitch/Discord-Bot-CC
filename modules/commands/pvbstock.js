const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { setData, getData } = require("../../database.js");

let lastUpdatedAt = null;
let checkingInterval = null;

module.exports = {
  config: {
    name: "pvbstock",
    description: "Plants vs Brainrots auto-stock every restock time (Admin only)",
    usage: "-pvbstock <on|off|check>",
    cooldown: 5,
    permission: 0,
    aliases: ["pvbstocks"],
  },

  autoStockTimers: {},

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
        `• ${this.getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${
          i.currentStock ?? "?"
        })`
      );
    }
    const order = [
      "common",
      "rare",
      "epic",
      "legendary",
      "mythic",
      "godly",
      "secret",
      "unknown",
    ];
    return order
      .filter((cat) => grouped[cat])
      .map(
        (cat) =>
          `[${this.CATEGORY_EMOJI[cat]} ${cat.toUpperCase()}]\n${grouped[
            cat
          ].join("\n")}`
      )
      .join("\n\n");
  },

  async fetchPVBRStock() {
    try {
      const res = await axios.get(
        "https://plantsvsbrainrotsstocktracker.com/api/stock?since=0"
      );
      return res.data || {};
    } catch (e) {
      console.error("Error fetching PVBR stock:", e);
      return {};
    }
  },

  // 🕒 Aligns current time to nearest past 5-min mark
  getAlignedNow() {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
    );
    const mins = Math.floor(now.getMinutes() / 5) * 5;
    now.setMinutes(mins, 0, 0);
    return now;
  },

  // 🕒 Gets next aligned 5-min mark
  getNextRestock() {
    const base = this.getAlignedNow();
    base.setMinutes(base.getMinutes() + 5);
    return base;
  },

  async sendStock(channel) {
    const { items, updatedAt } = await this.fetchPVBRStock();
    if (!items?.length) return channel.send("⚠️ Failed to fetch PVBR stock.");

    const seeds = items.filter((i) =>
      i.name.toLowerCase().includes("seed")
    );
    const gear = items.filter(
      (i) => !i.name.toLowerCase().includes("seed")
    );

    const alignedNow = this.getAlignedNow();
    const next = this.getNextRestock();

    const seedsText = this.formatItems(seeds);
    const gearText = this.formatItems(gear);

    const RARITY_ROLES = {
      godly: "1427517104780869713",
      secret: "1427517229129404477",
    };

    const hasGodly = seeds.some(
      (i) => this.getRarity(i.name) === "godly" && (i.currentStock ?? 0) > 0
    );
    const hasSecret = seeds.some(
      (i) => this.getRarity(i.name) === "secret" && (i.currentStock ?? 0) > 0
    );

    const pingRoles = [];
    if (hasGodly) pingRoles.push(RARITY_ROLES.godly);
    if (hasSecret) pingRoles.push(RARITY_ROLES.secret);

    const ping = pingRoles.map((id) => `<@&${id}>`).join(" ");

    const embed = new EmbedBuilder()
      .setTitle("🌱 Plants vs Brainrots Stock Update")
      .setDescription(
        `🕒 Current Time: **${alignedNow.toLocaleTimeString("en-PH", {
          hour12: true,
        })}**\n` +
          `🕒 Next Restock: **${next.toLocaleTimeString("en-PH", {
            hour12: true,
          })}**\n\n\u200B`
      )
      .addFields(
        { name: "🌿 Seeds", value: seedsText.slice(0, 1024) || "❌ Empty" },
        { name: "🛠️ Gear", value: gearText.slice(0, 1024) || "❌ Empty" }
      )
      .setColor("Green")
      .setFooter({
        text: `Last Updated: ${new Date(updatedAt).toLocaleTimeString("en-PH", {
          hour12: true,
        })}`,
      });

    await channel.send({ content: ping || null, embeds: [embed] });
  },

  async monitorStockChange(channel, guildId) {
    console.log("🔍 Starting API monitoring every 1s...");
    checkingInterval = setInterval(async () => {
      try {
        const res = await axios.get(
          "https://plantsvsbrainrotsstocktracker.com/api/stock?since=0"
        );
        const updatedAt = res.data?.updatedAt;
        if (!updatedAt) return;

        // First-run baseline
        if (lastUpdatedAt === null) {
          lastUpdatedAt = updatedAt;
          console.log(`🟢 Initialized baseline updatedAt: ${updatedAt}`);
          return;
        }

        // Detect API change
        if (updatedAt !== lastUpdatedAt) {
          console.log(`✅ Stock changed! Sending update...`);
          lastUpdatedAt = updatedAt;
          clearInterval(checkingInterval);
          checkingInterval = null;
          await this.sendStock(channel);
          this.waitForNextAligned(channel, guildId);
        }
      } catch (err) {
        console.error("❌ Error checking API:", err.message);
      }
    }, 1000);
  },

  waitForNextAligned(channel, guildId) {
    const restockMinutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    console.log("⏳ Waiting for next aligned time (5-min interval)...");
    const alignCheck = setInterval(() => {
      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })
      );
      const m = now.getMinutes();
      const s = now.getSeconds();
      if (restockMinutes.includes(m) && s === 0) {
        clearInterval(alignCheck);
        this.monitorStockChange(channel, guildId);
      }
    }, 1000);
  },

  startAutoStock(channel) {
    const guildId = channel.guild.id;
    console.log(`🌱 PVBR Auto-stock started for ${channel.guild.name}`);
    this.waitForNextAligned(channel, guildId);
  },

  stopAutoStock(channel, guildId = null) {
    if (!guildId && channel) guildId = channel.guild.id;
    if (checkingInterval) clearInterval(checkingInterval);
    if (this.autoStockTimers[guildId]) {
      clearTimeout(this.autoStockTimers[guildId]);
      delete this.autoStockTimers[guildId];
    }
  },

  async letStart({ args, message }) {
    const member = message.member;
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("🚫 Only **Admins** can use this command.");

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
      this.startAutoStock(channel);
      return message.reply(
        "✅ PVBR Auto-stock **enabled**! Updates will be sent every restock time."
      );
    }

    if (action === "off") {
      if (!gcData.enabled)
        return message.reply("⚠️ PVBR Auto-stock is already **disabled**.");
      gcData.enabled = false;
      allData[guildId] = gcData;
      await setData("pvbstock/discord", allData);
      this.stopAutoStock(channel, guildId);
      return message.reply("🛑 PVBR Auto-stock **disabled**.");
    }

    if (action === "check") {
      const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
      const location = gcData.channelId
        ? `<#${gcData.channelId}>`
        : "`None`";
      const next = this.getNextRestock().toLocaleTimeString("en-PH", {
        hour12: true,
      });

      const embed = new EmbedBuilder()
        .setTitle("📊 PVBR Auto-stock Status")
        .addFields(
          { name: "Status", value: status, inline: true },
          { name: "Channel", value: location, inline: true },
          { name: "Next Restock (PH)", value: next, inline: false }
        )
        .setColor("Green");

      return message.reply({ embeds: [embed] });
    }
  },

  async onReady(client) {
    const allData = (await getData("pvbstock/discord")) || {};
    for (const [guildId, gcData] of Object.entries(allData)) {
      if (gcData.enabled && gcData.channelId) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(gcData.channelId);
        if (channel) {
          this.startAutoStock(channel);
          console.log(`🔁 Auto-stock resumed for guild ${guild.name}`);
        }
      }
    }
  },
};