const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const axios = require("axios");
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
        "Level-Up Lollipop": "🍭",
        "Great Pumpkin": "🎃",
        "Crimson Thorn": "🌹",
        "Master Sprinkler": "💦",
        "Grand Master": "🌟",
        "Honey Sprinkler": "🍯💧",
        "Watering Can": "💧",
        "Trading Ticket": "🎟️",
        "Trowel": "🪓"
    },

    getEmoji(name) {
        return this.ITEM_EMOJI[name] || "❔";
    },

    async fetchStock() {
        try {
            const { data } = await axios.get("https://growagarden.gg/api/stock", {
                headers: {
                    "accept": "*/*",
                    "content-type": "application/json",
                    "referer": "https://growagarden.gg/stocks",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                timeout: 5000
            });
            return data.items || [];
        } catch (err) {
            console.error("Failed to fetch GAG stock:", err.response?.status, err.response?.data || err.message);
            return [];
        }
    },

    formatItems(items) {
        if (!items?.length) return "❌ No items found.";
        return items.map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "?"})`).join("\n");
    },

    getNextRestock() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const restockMinutes = [1,6,11,16,21,26,31,36,41,46,51,56];
        const next = new Date(now);
        const nextM = restockMinutes.find(min => min > now.getMinutes());
        if(nextM !== undefined) next.setMinutes(nextM);
        else { next.setHours(next.getHours() + 1); next.setMinutes(1); }
        next.setSeconds(20);
        next.setMilliseconds(0);
        return next;
    },

    async sendStock(channel) {
        const stock = await this.fetchStock();
        if (!stock?.length) return channel.send("⚠️ Failed to fetch GAG stock.");

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const next = this.getNextRestock();

        const embed = new EmbedBuilder()
            .setTitle("🌱 Grow A Garden Stock Update 🌱")
            .setDescription(
                `🕒 Current Time: ${now.toLocaleTimeString("en-PH",{hour12:true})}\n` +
                `🔁 Next Restock: ${next.toLocaleTimeString("en-PH",{hour12:true})}`
            )
            .addFields({ name: "Items", value: this.formatItems(stock).slice(0, 1024) })
            .setColor("Green");

        const roleIds = [
            "1427560078411563059",
            "1427560648673595402",
            "1427560940068536320"
        ];
        const ping = roleIds.map(id => `<@&${id}>`).join(" ");

        await channel.send({ content: ping, embeds: [embed] });
    },

    scheduleNext(channel, guildId) {
        const next = this.getNextRestock();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay < 0) delay += 5*60*1000;

        if(this.autoStockTimers[guildId]) clearTimeout(this.autoStockTimers[guildId]);

        this.autoStockTimers[guildId] = setTimeout(async () => {
            const allData = await getData("gagstock/discord") || {};
            const gcData = allData[guildId];
            if(!gcData?.enabled) return this.stopAutoStock(channel, guildId);

            await this.sendStock(channel);
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

    async execute(interaction){
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ content:"🚫 Only Admins can use this command.", ephemeral:true });

        await interaction.deferReply();
        const action = interaction.options.getString("action");
        const channel = interaction.channel;
        const guildId = interaction.guild.id;

        const allData = await getData("gagstock/discord") || {};
        const gcData = allData[guildId] || { enabled:false, channelId:null };

        if(action === "on"){
            gcData.enabled = true;
            gcData.channelId = channel.id;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);
            this.startAutoStock(channel);
            return interaction.followUp("✅ **GAG Auto-stock enabled!** I’ll now send updates automatically.");
        }

        if(action === "off"){
            gcData.enabled = false;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);
            this.stopAutoStock(channel, guildId);
            return interaction.followUp("🛑 **GAG Auto-stock disabled.** I’ll stop sending updates.");
        }

        if(action === "check"){
            const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
            const location = gcData.channelId ? `<#${gcData.channelId}>` : "`None`";
            const next = this.getNextRestock().toLocaleTimeString("en-PH",{hour12:true});

            const embed = new EmbedBuilder()
                .setTitle("📊 GAG Auto-stock Status")
                .addFields(
                    { name:"Status", value:status, inline:true },
                    { name:"Channel", value:location, inline:true },
                    { name:"Next Restock (PH)", value:next, inline:true }
                )
                .setColor(gcData.enabled?"Green":"Red");

            return interaction.followUp({ embeds:[embed] });
        }
    },

    async onReady(client){
        const allData = await getData("gagstock/discord") || {};
        for(const [guildId, gcData] of Object.entries(allData)){
            if(gcData.enabled && gcData.channelId){
                const guild = client.guilds.cache.get(guildId);
                if(!guild) continue;
                const channel = guild.channels.cache.get(gcData.channelId);
                if(channel) this.startAutoStock(channel);
            }
        }
    }
};
