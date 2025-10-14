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
    autoStockTimeouts: {},

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

    getNext5Min() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        let minutes = now.getMinutes();
        let nextMinutes = Math.floor(minutes / 5) * 5 + 1;
        if (nextMinutes <= minutes) nextMinutes += 5;
        const next = new Date(now);
        next.setMinutes(nextMinutes);
        next.setSeconds(0);
        next.setMilliseconds(0);
        if (nextMinutes >= 60) {
            next.setHours(next.getHours() + 1);
            next.setMinutes(nextMinutes % 60);
        }
        return next;
    },

    fetchStocks() {
        const options = {
            method: "GET",
            hostname: "growagarden.gg",
            path: "/api/stock",
            headers: {
                accept: "*/*",
                "content-type": "application/json",
                referer: "https://growagarden.gg/stocks",
                "user-agent": "Mozilla/5.0"
            },
            timeout: 5000
        };
        return new Promise((resolve, reject) => {
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
            req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
            req.end();
        });
    },

    async sendStock(channel) {
        try {
            const data = await this.fetchStocks();
            if (!data) return channel.send("⚠️ Failed to fetch GAG stock.");

            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
            const next = this.getNext5Min();

            const gearText = this.formatItems(data.gearStock);
            const eggText = this.formatItems(data.eggStock);
            const seedText = this.formatItems(data.seedsStock);

            const embed = new EmbedBuilder()
                .setTitle("🌱 Grow A Garden Stock Update")
                .setDescription(`🕒 Current PH Time: ${now.toLocaleTimeString("en-PH",{hour12:true})}\n🕒 Next Restock: ${next.toLocaleTimeString("en-PH",{hour12:true})}`)
                .addFields(
                    { name: "🛠️ Gear", value: gearText.slice(0,1024) },
                    { name: "🥚 Eggs", value: eggText.slice(0,1024) },
                    { name: "🌱 Seeds", value: seedText.slice(0,1024) }
                )
                .setColor("Green");

            await channel.send({ embeds: [embed] });

            // Special items ping
            const allItems = [...(data.gearStock || []), ...(data.eggStock || []), ...(data.seedsStock || [])];
            const specials = allItems.filter(i => this.SPECIAL_ITEMS.includes(i.name) && (i.quantity ?? 0) > 0);
            if (specials.length > 0) {
                const roleIds = ["1427560078411563059","1427560648673595402","1427560940068536320"];
                const ping = roleIds.map(id => `<@&${id}>`).join(" ");
                await channel.send({ content: ping });
            }

        } catch (err) {
            console.error("Error fetching/sending stock:", err);
            channel.send("⚠️ Failed to fetch GAG stock.");
        }
    },

    scheduleNext(channel, guildId) {
        const next = this.getNext5Min();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay < 0) delay += 5*60*1000;

        if(this.autoStockTimers[guildId]) clearTimeout(this.autoStockTimers[guildId]);

        this.autoStockTimers[guildId] = setTimeout(async () => {
            await this.sendStock(channel);
            this.scheduleNext(channel, guildId);
        }, delay);
    },

    startAutoStock(channel) {
        const guildId = channel.guild.id;
        if(this.autoStockTimers[guildId]) return;
        this.scheduleNext(channel, guildId);
    },

    stopAutoStock(channel) {
        const guildId = channel.guild.id;
        if(this.autoStockTimers[guildId]) {
            clearTimeout(this.autoStockTimers[guildId]);
            delete this.autoStockTimers[guildId];
        }
    },

    async execute(interaction) {
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ content: "🚫 Only Admins can use this command.", ephemeral: true });

        const action = interaction.options.getString("action");
        const channel = interaction.channel;
        const guildId = interaction.guild.id;

        const allData = await getData("gagstock/discord") || {};
        const gcData = allData[guildId] || { enabled: false };

        if(action === "on") {
            if(gcData.enabled) return interaction.reply("✅ Auto-stock already enabled.");

            gcData.enabled = true;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);

            await this.sendStock(channel); // send immediately
            this.startAutoStock(channel);

            return interaction.reply("✅ GAG Auto-stock enabled. Updates every 5 minutes.");
        }

        if(action === "off") {
            gcData.enabled = false;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);

            this.stopAutoStock(channel);
            return interaction.reply("❌ GAG Auto-stock disabled.");
        }

        if(action === "check") {
            const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
            return interaction.reply(`📊 Auto-stock status: ${status}`);
        }
    },

    async onReady(client) {
        const allData = await getData("gagstock/discord") || {};
        for(const [guildId, gcData] of Object.entries(allData)) {
            if(gcData.enabled && gcData.channelId) {
                const guild = client.guilds.cache.get(guildId);
                if(!guild) continue;
                const channel = guild.channels.cache.get(gcData.channelId);
                if(channel) this.startAutoStock(channel);
            }
        }
    }
};