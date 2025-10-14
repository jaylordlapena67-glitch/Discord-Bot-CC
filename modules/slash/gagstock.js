const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const https = require("https");
const { getData, setData } = require("../../database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gagstock")
        .setDescription("Grow A Garden auto-stock updates (Admin only)")
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
        "Carrot": "🥕", "Strawberry": "🍓", "Blueberry": "🫐", "Orange Tulip": "🌷",
        "Tomato": "🍅", "Corn": "🌽", "Daffodil": "🌼", "Watermelon": "🍉",
        "Pumpkin": "🎃", "Apple": "🍎", "Bamboo": "🎍", "Coconut": "🥥",
        "Cactus": "🌵", "Dragon Fruit": "🐉", "Mango": "🥭", "Grape": "🍇",
        "Mushroom": "🍄", "Pepper": "🌶️", "Beanstalk": "🪴",
        "Watering Can": "💧", "Trowel": "🔨", "Trading Ticket": "🎟️",
        "Master Sprinkler": "🌟💦", "Grandmaster Sprinkler": "🌊🔥",
        "Honey Sprinkler": "🍯💦", "Level Up Lollipop": "🍭"
    },

    SPECIAL_ITEMS: ["Grand Master", "Great Pumpkin", "Level-Up Lollipop"],

    getEmoji(name) {
        return this.ITEM_EMOJI[name] || "❔";
    },

    formatItems(items) {
        if (!items || items.length === 0) return "❌ Empty";
        return items.map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`).join("\n");
    },

    fetchStocks() {
        const options = {
            method: "GET",
            hostname: "growagarden.gg",
            path: "/api/stock",
            headers: {
                accept: "*/*",
                "content-type": "application/json",
                referer: "https://growagarden.gg/api/stocks",
                "user-agent": "Mozilla/5.0"
            },
        };
        return new Promise((resolve, reject) => {
            const req = https.request(options, res => {
                const chunks = [];
                res.on("data", chunk => chunks.push(chunk));
                res.on("end", () => {
                    try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                    catch (err) { reject(err); }
                });
            });
            req.on("error", e => reject(e));
            req.end();
        });
    },

    getNextAligned() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const m = now.getMinutes();
        const restockMinutes = [1,6,11,16,21,26,31,36,41,46,51,56];
        let nextM = restockMinutes.find(min => min > m);
        const next = new Date(now);
        if(nextM !== undefined) next.setMinutes(nextM);
        else { next.setHours(next.getHours()+1); next.setMinutes(1); }
        next.setSeconds(0);
        next.setMilliseconds(0);
        return next;
    },

    async sendStock(channel) {
        try {
            const data = await this.fetchStocks();
            if(!data) return channel.send("⚠️ Failed to fetch GAG stock.");

            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
            const next = this.getNextAligned();

            const embed = new EmbedBuilder()
                .setTitle("🌱 Grow A Garden Stock Update")
                .setDescription(`🕒 Current PH Time: ${now.toLocaleTimeString("en-PH",{hour12:true})}\n🕒 Next Restock: ${next.toLocaleTimeString("en-PH",{hour12:true})}`)
                .addFields(
                    { name: "Items", value: this.formatItems(data.items).slice(0,1024) || "❌ Empty" }
                )
                .setColor("Green");

            const specials = (data.items || []).filter(i => this.SPECIAL_ITEMS.includes(i.name) && (i.quantity ?? 0) > 0);
            let ping = "";
            if(specials.length > 0){
                const roleIds = ["1427560078411563059","1427560648673595402","1427560940068536320"];
                ping = roleIds.map(id => `<@&${id}>`).join(" ");
            }

            await channel.send({ content: ping || null, embeds: [embed] });
        } catch (err) {
            console.error("Error fetching/sending stock:", err);
        }
    },

    scheduleNext(channel, guildId) {
        const next = this.getNextAligned();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();

        if(this.autoStockTimers[guildId]) clearTimeout(this.autoStockTimers[guildId]);

        this.autoStockTimers[guildId] = setTimeout(async () => {
            await this.sendStock(channel);
            this.scheduleNext(channel, guildId); // recursive scheduling
        }, delay);
    },

    startAutoStock(channel) {
        const guildId = channel.guild.id;
        this.scheduleNext(channel, guildId); // aligned scheduling
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
        const allData = await getData("gagstock/discord") || {};
        const gcData = allData[guildId] || { enabled: false, channelId: null };

        if (action === "on") {
            if (gcData.enabled) return interaction.reply("✅ GAG Auto-stock is already **enabled**.");

            gcData.enabled = true;
            gcData.channelId = channel.id;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);

            // ✅ Send immediately
            await this.sendStock(channel);

            // ✅ Schedule aligned restock
            this.startAutoStock(channel);

            return interaction.reply("✅ GAG Auto-stock **enabled**! Updates every aligned restock time.");
        }

        else if (action === "off") {
            if (!gcData.enabled) return interaction.reply("⚠️ GAG Auto-stock is already **disabled**.");

            gcData.enabled = false;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);

            this.stopAutoStock(channel, guildId);
            return interaction.reply("🛑 GAG Auto-stock **disabled**.");
        }

        else if (action === "check") {
            const status = gcData.enabled ? "✅ **Enabled**" : "❌ **Disabled**";
            const location = gcData.channelId ? `<#${gcData.channelId}>` : "`None`";
            const next = this.getNextAligned().toLocaleTimeString("en-PH", { hour12: true });

            const embed = new EmbedBuilder()
                .setTitle("📊 GAG Auto-stock Status")
                .addFields(
                    { name: "Status", value: status, inline: true },
                    { name: "Channel", value: location, inline: true },
                    { name: "Next Restock (PH)", value: next, inline: true }
                )
                .setColor(gcData.enabled ? "Green" : "Red");

            return interaction.reply({ embeds: [embed] });
        }
    },

    async onReady(client) {
        const allData = await getData("gagstock/discord") || {};
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