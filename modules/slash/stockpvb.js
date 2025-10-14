const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const { setData, getData } = require("../../../database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("pvbstock")
        .setDescription("Plants vs Brainrots auto-stock every restock time (Admin only)")
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
        "Mr Carrot": "🥕🎩", "Tomatrio": "🍅👨‍👦‍👦", "Shroombino": "🍄🎭",
        "Bat": "⚾", "Water Bucket": "🪣💧", "Frost Grenade": "🧊💣",
        "Banana Gun": "🍌🔫", "Frost Blower": "❄️🌬️", "Lucky Potion": "🍀🧪",
        "Speed Potion": "⚡🧪", "Carrot Launcher": "🥕🚀"
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
        next.setSeconds(20);
        next.setMilliseconds(0);
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

        const pvbrRoleIds = ['1427517229129404477','1427517104780869713'];
        const ping = pvbrRoleIds.map(id => `<@&${id}>`).join(' ');

        await channel.send({ content: ping, embeds: [embed] });
    },

    scheduleNext(channel, guildId) {
        const next = this.getNextRestock();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay < 0) delay += 5*60*1000;

        if(this.autoStockTimers[guildId]) clearTimeout(this.autoStockTimers[guildId]);

        this.autoStockTimers[guildId] = setTimeout(async () => {
            const allData = await getData("pvbstock/discord") || {};
            const gcData = allData[guildId];
            if(!gcData?.enabled) return this.stopAutoStock(channel, guildId);

            this.sendStock(channel); // <-- async, non-blocking
            this.scheduleNext(channel, guildId);
        }, delay);
    },

    startAutoStock(channel) {
        const guildId = channel.guild.id;
        if(this.autoStockTimers[guildId]) return;
        this.scheduleNext(channel, guildId);
    },

    stopAutoStock(channel, guildId=null){
        if(!guildId && channel) guildId = channel.guild.id;
        if(this.autoStockTimers[guildId]){
            clearTimeout(this.autoStockTimers[guildId]);
            delete this.autoStockTimers[guildId];
        }
    },

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "🚫 Only **Admins** can use this command.", ephemeral: true });
        }

        const action = interaction.options.getString("action");
        const channel = interaction.channel;
        if(!channel) return interaction.reply("❌ Cannot detect channel!");

        const guildId = interaction.guild.id;
        const allData = await getData("pvbstock/discord") || {};
        const gcData = allData[guildId] || { enabled: false, channelId: null };

        await interaction.deferReply({ ephemeral: true }); // defer first

        if (action === "on") {
            if (gcData.enabled) {
                return interaction.followUp("✅ PVBR Auto-stock is already **enabled** in this server.");
            }

            gcData.enabled = true;
            gcData.channelId = channel.id;
            allData[guildId] = gcData;
            await setData("pvbstock/discord", allData);

            this.startAutoStock(channel);
            interaction.followUp("✅ PVBR Auto-stock **enabled**! Updates will be sent every restock time.");
        }

        else if (action === "off") {
            if (!gcData.enabled) {
                return interaction.followUp("⚠️ PVBR Auto-stock is already **disabled**.");
            }

            gcData.enabled = false;
            allData[guildId] = gcData;
            await setData("pvbstock/discord", allData);

            this.stopAutoStock(channel, guildId);
            interaction.followUp("🛑 PVBR Auto-stock **disabled**. I will stop sending updates.");
        }

        else if (action === "check") {
            const status = gcData.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
            const location = gcData.channelId ? `<#${gcData.channelId}>` : "`None`";
            const next = this.getNextRestock().toLocaleTimeString("en-PH", { hour12: true });

            const embed = new EmbedBuilder()
                .setTitle("📊 PVBR Auto-stock Status")
                .addFields(
                    { name: "Status", value: status, inline: true },
                    { name: "Channel", value: location, inline: true },
                    { name: "Next Restock (PH)", value: next, inline: true }
                )
                .setColor(gcData.enabled ? "Green" : "Red");

            interaction.followUp({ embeds: [embed] });
        }
    },

    async onReady(client) {
        const allData = await getData("pvbstock/discord") || {};
        for (const [guildId, gcData] of Object.entries(allData)) {
            if (gcData.enabled && gcData.channelId) {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;
                const channel = guild.channels.cache.get(gcData.channelId);
                if (channel) this.startAutoStock(channel);
            }
        }
    }
};