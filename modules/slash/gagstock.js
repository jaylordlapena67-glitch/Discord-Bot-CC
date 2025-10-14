const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const https = require("https");
const { getData, setData } = require("../../../database.js");

const gagStock = {
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

    fetchStock() {
        return new Promise((resolve, reject) => {
            const options = {
                method: "GET",
                hostname: "growagarden.gg",
                path: "/api/stock",
                headers: {
                    accept: "*/*",
                    "content-type": "application/json",
                    referer: "https://growagarden.gg/stocks"
                }
            };

            const req = https.request(options, res => {
                const chunks = [];
                res.on("data", chunk => chunks.push(chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString()));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on("error", reject);
            req.end();
        });
    },

    formatItems(items) {
        if (!items?.length) return "❌ No items found.";
        return items.map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "?"})`).join("\n");
    },

    getNextRestock() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const m = now.getMinutes();
        const next = new Date(now);
        const restockMinutes = [1,6,11,16,21,26,31,36,41,46,51,56];
        const nextM = restockMinutes.find(min => min > m);
        if (nextM !== undefined) next.setMinutes(nextM);
        else { next.setHours(next.getHours()+1); next.setMinutes(1); }
        next.setSeconds(20); next.setMilliseconds(0);
        return next;
    },

    async sendStock(channel) {
        const self = gagStock;
        const data = await self.fetchStock().catch(() => null);
        if (!data) return channel.send("⚠️ Failed to fetch GAG stock.");

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
        const next = self.getNextRestock();

        const embed = new EmbedBuilder()
            .setTitle("🌱 Grow A Garden Stock Update 🌱")
            .setDescription(
                `🕒 Current Time: ${now.toLocaleTimeString("en-PH", { hour12: true })}\n` +
                `🔁 Next Restock: ${next.toLocaleTimeString("en-PH", { hour12: true })}`
            )
            .addFields({ name: "Items", value: self.formatItems(data.items).slice(0,1024) })
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
        const self = gagStock;
        const next = self.getNextRestock();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay < 0) delay += 5*60*1000;

        if(self.autoStockTimers[guildId]) clearTimeout(self.autoStockTimers[guildId]);

        self.autoStockTimers[guildId] = setTimeout(async () => {
            const allData = await getData("gagstock/discord") || {};
            const gcData = allData[guildId];
            if(!gcData?.enabled) return self.stopAutoStock(channel, guildId);

            await self.sendStock(channel);
            self.scheduleNext(channel, guildId);
        }, delay);
    },

    startAutoStock(channel) {
        const self = gagStock;
        const guildId = channel.guild.id;
        if(self.autoStockTimers[guildId]) return;
        self.scheduleNext(channel, guildId);
    },

    stopAutoStock(channel, guildId=null){
        const self = gagStock;
        if(!guildId && channel) guildId = channel.guild.id;
        if(self.autoStockTimers[guildId]){
            clearTimeout(self.autoStockTimers[guildId]);
            delete self.autoStockTimers[guildId];
        }
    },

    async execute(interaction){
        const self = gagStock;

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
            self.startAutoStock(channel);

            return interaction.followUp("✅ **GAG Auto-stock enabled!** I’ll now send updates automatically.");
        }

        if(action === "off"){
            gcData.enabled = false;
            allData[guildId] = gcData;
            await setData("gagstock/discord", allData);
            self.stopAutoStock(channel, guildId);

            return interaction.followUp("🛑 **GAG Auto-stock disabled.** I’ll stop sending updates.");
        }

        if(action === "check"){
            const status = gcData.enabled ? "✅ Enabled" : "❌ Disabled";
            const location = gcData.channelId ? `<#${gcData.channelId}>` : "`None`";
            const next = self.getNextRestock().toLocaleTimeString("en-PH", { hour12:true });

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
        const self = gagStock;
        const allData = await getData("gagstock/discord") || {};
        for(const [guildId, gcData] of Object.entries(allData)){
            if(gcData.enabled && gcData.channelId){
                const guild = client.guilds.cache.get(guildId);
                if(!guild) continue;
                const channel = guild.channels.cache.get(gcData.channelId);
                if(channel) self.startAutoStock(channel);
            }
        }
    }
};

module.exports = gagStock;