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

    getEmoji(name) {
        return this.ITEM_EMOJI[name] || "❔";
    },

    getNext5Min(date = null) {
        const now = date || new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        let minutes = now.getMinutes();
        let nextMinutes = Math.floor(minutes / 5) * 5 + 1;
        if (nextMinutes <= minutes) nextMinutes += 5;
        const next = new Date(now);
        next.setMinutes(nextMinutes);
        next.setSeconds(0, 0);
        if (nextMinutes >= 60) {
            next.setHours(now.getHours() + 1);
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

    formatItems(items) {
        if (!items || items.length === 0) return "❌ Empty";
        return items.map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`).join("\n");
    },

    async sendStock(channel) {
        const gcData = await getData(`stock/${channel.id}`);
        if (!gcData?.enabled) return;

        const data = await this.fetchStocks();
        if (!data) return;

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const next = this.getNext5Min();

        const embed = new EmbedBuilder()
            .setTitle("🌱 Grow A Garden Stock Update")
            .setDescription(`🕒 Current PH Time: ${now.toLocaleTimeString("en-PH", { hour12: false })}\n🔄 Next Restock: ${next.toLocaleTimeString("en-PH", { hour12: false })}`)
            .addFields(
                { name: "🛠️ Gear", value: this.formatItems(data.gearStock).slice(0, 1024) },
                { name: "🥚 Eggs", value: this.formatItems(data.eggStock).slice(0, 1024) },
                { name: "🌱 Seeds", value: this.formatItems(data.seedsStock).slice(0, 1024) }
            )
            .setColor("Green");

        await channel.send({ embeds: [embed] });
    },

    scheduleNext(channel) {
        const next = this.getNext5Min();
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        let delay = next.getTime() - now.getTime();
        if (delay < 0) delay += 5 * 60 * 1000;

        if (this.autoStockTimers[channel.id]) clearTimeout(this.autoStockTimers[channel.id]);

        this.autoStockTimers[channel.id] = setTimeout(async () => {
            await this.sendStock(channel);
            this.scheduleNext(channel);
        }, delay);
    },

    startAutoStock(channel) {
        if (this.autoStockTimers[channel.id]) return;
        this.scheduleNext(channel);
    },

    stopAutoStock(channel) {
        if (this.autoStockTimers[channel.id]) {
            clearTimeout(this.autoStockTimers[channel.id]);
            delete this.autoStockTimers[channel.id];
        }
    },

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "🚫 Only admins can use this command.", ephemeral: true });
        }

        await interaction.deferReply();
        const action = interaction.options.getString("action");
        const channel = interaction.channel;

        let gcData = (await getData(`stock/${channel.id}`)) || { enabled: false };

        if (action === "on") {
            if (gcData.enabled) return interaction.followUp("⚠️ Auto-stock already enabled.");
            gcData.enabled = true;
            await setData(`stock/${channel.id}`, gcData);
            this.startAutoStock(channel);
            return interaction.followUp("✅ Auto-stock enabled. Updates every 5 minutes.");
        }

        if (action === "off") {
            gcData.enabled = false;
            await setData(`stock/${channel.id}`, gcData);
            this.stopAutoStock(channel);
            return interaction.followUp("❌ Auto-stock disabled.");
        }

        if (action === "check") {
            const status = gcData.enabled ? "ON ✅" : "OFF ❌";
            return interaction.followUp(`📊 Auto-stock status: ${status}`);
        }
    },

    async onReady(client) {
        const allGCs = await getData("stock") || {};
        for (const channelId in allGCs) {
            if (allGCs[channelId].enabled) {
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) this.startAutoStock(channel);
            }
        }
    }
};