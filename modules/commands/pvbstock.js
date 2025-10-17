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
• ${this.getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${i.currentStock ?? "?"})
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
[${this.CATEGORY_EMOJI[cat]} ${cat.toUpperCase()}]\n${grouped[cat].join("\n")}
)
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

// ✅ EMBED STYLE IDENTICAL TO YOUR SCREENSHOT
async sendStock(channel) {
const { items, updatedAt } = await this.fetchPVBRStock();
if (!items?.length) return channel.send("⚠️ Failed to fetch PVBR stock.");

const seeds = items.filter((i) => i.name.toLowerCase().includes("seed"));  
const gear = items.filter((i) => !i.name.toLowerCase().includes("seed"));  

const seedsText = this.formatItems(seeds);  
const gearText = this.formatItems(gear);  

const RARITY_ROLES = {  
  godly: "1427517104780869713",  
  secret: "1427517229129404477",  
};  

const pingRoles = [];  
if (seeds.some((i) => this.getRarity(i.name) === "godly" && (i.currentStock ?? 0) > 0))  
  pingRoles.push(RARITY_ROLES.godly);  
if (seeds.some((i) => this.getRarity(i.name) === "secret" && (i.currentStock ?? 0) > 0))  
  pingRoles.push(RARITY_ROLES.secret);  

const ping = pingRoles.map((id) => `<@&${id}>`).join(" ");  

const specialStock = seeds.some(  
  (i) =>  
    ["godly", "secret"].includes(this.getRarity(i.name)) &&  
    (i.currentStock ?? 0) > 0  
);  

const privateServerChannelId = "1426903128565088357";  
const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));  
const timeString = now.toLocaleTimeString("en-PH", {  
  hour: "2-digit",  
  minute: "2-digit",  
});  

// 🔰 Embed description — exactly like your screenshot  
let description = `**Seeds**\n${seedsText.slice(0, 1024) || "❌ Empty"}\n\n**Gear**\n${gearText.slice(0, 1024) || "❌ Empty"}`;  

if (specialStock) {  
  const specialItems = seeds  
    .filter(i => ["godly", "secret"].includes(this.getRarity(i.name)) && (i.currentStock ?? 0) > 0)  
    .map(i => `• ${this.getEmoji(i.name)} **${i.name.replace(/ Seed$/i, "")}** (${i.currentStock ?? "?"})`)  
    .join("\n");  

  description += `\n\n🎉 **Special Stock:**\n${specialItems}`;  
  description += `\n\n🚀 **Private Servers:** <#${privateServerChannelId}>`;  
}  

const embed = new EmbedBuilder()  
  .setTitle(`Plants vs Brainrots Stock - ${timeString}`)  
  .setDescription(description)  
  .setColor(0xff0080); // pink border color  

await channel.send({ content: ping || null, embeds: [embed] });  
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

setInterval(async () => {  
    for (const guild of client.guilds.cache.values()) {  
      await this.checkForUpdate(client);  
    }  
  }, 1000);  
} catch (err) {  
  console.error("❌ Error initializing PVBR loop:", err);  
}

},
};

