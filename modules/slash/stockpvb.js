const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const axios = require("axios");
const { setData, getData } = require("../..database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pvbstock")
        .setDescription("PVBR auto-stock every 1,6,11... +20s delay with rare seed alerts")
        .addStringOption(option =>
            option.setName("action")
                .setDescription("Choose on, off, or check")
                .setRequired(true)
                .addChoices(
                    { name: "On", value: "on" },
                    { name: "Off", value: "off" },
                    { name: "Check", value: "check" }
                )
        ),

    autoStockTimers: {},

    ITEM_EMOJI: {
        "Cactus": "🌵", "Strawberry": "🍓", "Pumpkin": "🎃", "Sunflower": "🌻",
        "Dragon Fruit": "🐉🍉", "Eggplant": "🍆", "Watermelon": "🍉✨", "Grape": "🍇✨",
        "Cocotank": "🥥🛡️", "Carnivorous Plant": "🪴🦷", "King Limone": "🍋", "Mango": "🥭",
        "Mr Carrot": "🥕🎩", "Tomatrio": "🍅👨‍👦‍👦", "Shroombino": "🍄🎭", "Bat": "⚾",
        "Water Bucket": "🪣💧", "Frost Grenade": "🧊💣", "Banana Gun": "🍌🔫",
        "Frost Blower": "❄️🌬️", "Lucky Potion": "🍀🧪", "Speed Potion": "⚡🧪",
        "Carrot Launcher": "🥕🚀"
    },

    CATEGORY_EMOJI: {
        "common": "🟢", "rare": "🌿", "epic": "🔵", "legendary": "🟣",
        "mythic": "✨", "godly": "🟡", "secret": "🎩", "unknown": "❔"
    },

    MANUAL_RARITY: {
        "Cactus": "rare", "Strawberry": "rare", "Pumpkin": "epic", "Sunflower": "epic",
        "Dragon Fruit": "legendary", "Eggplant": "legendary", "Watermelon": "mythic", "Grape": "mythic",
        "Cocotank": "godly", "Carnivorous Plant": "godly", "King Limone": "secret", "Mango": "secret",
        "Mr Carrot": "secret", "Tomatrio": "secret", "Shroombino": "secret",
        "Bat": "common", "Water Bucket": "epic", "Frost Grenade": "epic", "Banana Gun": "epic",
        "Frost Blower": "legendary", "Lucky Potion": "legendary", "Speed Potion": "legendary",
        "Carrot Launcher": "godly"
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
            grouped[type].push(`• ${this.getEmoji(i.name)} ${i.name.replace(/ Seed$/i, "")} (${i.currentStock ?? "?"})`);
        }
        const order = ["common","rare","epic","legendary","mythic","godly","secret","unknown"];
        return order.filter(cat => grouped[cat])
            .map(cat => `[${this.CATEGORY_EMOJI[cat]} ${cat.toUpperCase()}]\n${grouped[cat].join("\n")}`)
            .join("\n\n");
    },

    async fetchPVBRStock() {
        try {
            const res = await axios.get("https://plantsvsbrainrotsstocktracker.com/api/stock?since=0");
            return res.data?.items || [];
        } catch (e) {
            console.error("Error fetching PVBR stock:", e);
            return [];
        }
    },

    getNextRestock() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const m = now.getMinutes();
        const next = new Date(now);
        const restockMinutes = [1,6,11,16,21,26,31,36,41,46,51,56];
        const nextM = restockMinutes.find(min => min > m);
        if(nextM!==undefined) next.setMinutes(nextM);
        else { next.setHours(next.getHours()+1); next.setMinutes(1); }
        next.setSeconds(20); next.setMilliseconds(0);
        return next;
    },

    async sendStock(channel) {
        const stock = await this.fetchPVBRStock();
        if(!stock?.length) return channel.send("⚠️ Failed to fetch PVBR stock.");

        const seeds = stock.filter(i => i.name.toLowerCase().includes("seed"));
        const gear = stock.filter(i => !i.name.toLowerCase().includes("seed"));

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const next = this.getNextRestock();

        const embed = new EmbedBuilder()
            .setTitle("🌱 Plants vs Brainrots Stock 🌱")
            .setDescription(`🕒 Current Time: ${now.toLocaleTimeString("en-PH",{hour12:true})}\n🕒 Next Restock: ${next.toLocaleTimeString("en-PH",{hour12:true})}`)
            .addFields(
                { name: "🌿 Seeds", value: this.formatItems(seeds).slice(0,1024) || "❌ Empty" },
                { name: "🛠️ Gear", value: this.formatItems(gear).slice(0,1024) || "❌ Empty" }
            )
            .setColor("Green");

        await channel.send({ embeds: [embed] });

        // Rare seed alert with private server links
        const rare = seeds.filter(s => ["godly","secret"].includes(this.getRarity(s.name)));
        if(rare.length){
            const alert = `🚨 RARE SEED DETECTED 🚨\n\n${rare.map(s=>`${this.getEmoji(s.name)} ${s.name.replace(/ Seed$/i,"")} (${s.currentStock})`).join("\n")}\n\n⚡ Join fast! Choose a non-full server:\n` +
                `https://www.roblox.com/share?code=5a9bf02c4952464eaf9c0ae66eb456bf&type=Server\n` +
                `https://www.roblox.com/share?code=d1afbbba2d5ed946b83caeb423a09e37&type=Server\n` +
                `https://www.roblox.com/share?code=a7e01c0a62c66e4c8a572cd79e77070e&type=Server\n` +
                `https://www.roblox.com/share?code=f9b0d9025486cb4494514ad5ee9cce54&type=Server`;
            await channel.send(alert);
        }
    },

    scheduleNext(channel) {
        const next = this.getNextRestock();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay<0) delay += 5*60*1000;

        const channelId = channel.id;
        if(this.autoStockTimers[channelId]) clearTimeout(this.autoStockTimers[channelId]);

        this.autoStockTimers[channelId] = setTimeout(async () => {
            const gcData = await getData(`pvbstock/${channelId}`);
            if(!gcData?.enabled) return this.stopAutoStock(channel);

            await this.sendStock(channel);
            this.scheduleNext(channel);
        }, delay);
    },

    startAutoStock(channel) {
        const channelId = channel.id;
        if(this.autoStockTimers[channelId]) return;
        this.scheduleNext(channel);
    },

    stopAutoStock(channel){
        const channelId = channel.id;
        if(this.autoStockTimers[channelId]){
            clearTimeout(this.autoStockTimers[channelId]);
            delete this.autoStockTimers[channelId];
        }
    },

    async execute(interaction) {
        const action = interaction.options.getString("action");
        const channel = interaction.channel;
        let gcData = (await getData(`pvbstock/${channel.id}`)) || { enabled: false };

        if(action==="on"){
            if(gcData.enabled) return interaction.reply("⚠️ Auto-stock already active!");
            gcData.enabled = true;
            await setData(`pvbstock/${channel.id}`, gcData);
            this.startAutoStock(channel);
            return interaction.reply("✅ PVBR Auto-stock enabled. Runs every 1,6,11,... +20s delay.");
        }

        if(action==="off"){
            gcData.enabled = false;
            await setData(`pvbstock/${channel.id}`, gcData);
            this.stopAutoStock(channel);
            return interaction.reply("❌ PVBR Auto-stock disabled.");
        }

        if(action==="check"){
            return interaction.reply(`📊 PVBR Auto-stock: ${gcData.enabled ? "ON ✅" : "OFF ❌"}`);
        }
    }
};
