const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");
const https = require("https");
const { getData, setData } = require("../../../database.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gagstock")
        .setDescription("GAG auto-stock updates every restock time (Admin only)")
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

    // Emoji mapping
    ITEM_EMOJI: {
        "Level-Up Lollipop": "🍭", "Great Pumpkin": "🎃", "Crimson Thorn": "🌹",
        "Watering Can": "💧", "Trowel": "🔨", "Trading Ticket": "🎟️",
        "Recall Wrench": "🔧", "Basic Sprinkler": "🌊", "Advanced Sprinkler": "💦",
        "Medium Treat": "🍪", "Medium Toy": "🧸", "Night Staff": "🌙",
        "Star Caller": "⭐", "Garden Guide": "📖", "Godly Sprinkler": "🌪️",
        "Chocolate Sprinkler": "🍫", "Magnifying Glass": "🔍",
        "Master Sprinkler": "🌟💦", "Grandmaster Sprinkler": "🌊🔥",
        "Honey Sprinkler": "🍯💦", "Favorite Tool": "🛠️",
        "Silver Fertilizer": "⚪"
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
                headers: { accept: "*/*", "content-type": "application/json", referer: "https://growagarden.gg/stocks" }
            };
            const req = https.request(options, res => {
                const chunks = [];
                res.on("data", chunk => chunks.push(chunk));
                res.on("end", () => {
                    try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                    catch(e) { reject(e); }
                });
            });
            req.on("error", e => reject(e));
            req.end();
        });
    },

    formatItems(items) {
        if(!items || !items.length) return "❌ Empty";
        return items.map(i => `• ${this.getEmoji(i.name)} ${i.name} (${i.quantity ?? i.value ?? "N/A"})`).join("\n");
    },

    getNextRestock() {
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
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
        const data = await this.fetchStock().catch(()=>null);
        if(!data) return channel.send("⚠️ Failed to fetch GAG stock.");

        const embed = new EmbedBuilder()
            .setTitle("🌱 GAG Auto-Stock Update")
            .setDescription(
                `🕒 Current PH Time: ${new Date().toLocaleTimeString("en-PH",{hour12:true})}\n` +
                `🔄 Next Restock: ${this.getNextRestock().toLocaleTimeString("en-PH",{hour12:true})}`
            )
            .addFields(
                { name: "Items", value: this.formatItems(data.items), inline: false }
            )
            .setColor("Green");

        // Ping roles
        const roleIds = ["1427517229129404477","1427517104780869713"];
        const ping = roleIds.map(id=>`<@&${id}>`).join(" ");
        await channel.send({ content: ping, embeds: [embed] });
    },

    scheduleNext(channel, guildId) {
        const next = this.getNextRestock();
        const now = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        let delay = next.getTime() - now.getTime();
        if(delay<0) delay += 5*60*1000;

        if(this.autoStockTimers[guildId]) clearTimeout(this.autoStockTimers[guildId]);

        this.autoStockTimers[guildId] = setTimeout(async ()=>{
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

    stopAutoStock(channel, guildId=null) {
        if(!guildId && channel) guildId = channel.guild.id;
        if(this.autoStockTimers[guildId]) {
            clearTimeout(this.autoStockTimers[guildId]);
            delete this.autoStockTimers[guildId];
        }
    },

    async execute(interaction) {
        if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ content: "🚫 Only Admins can use this.", ephemeral:true });

        await interaction.deferReply(); // important!

        const action = interaction.options.getString("action");
        const channel = interaction.channel;
        const guildId = interaction.guild.id;

        const allData = await getData("gagstock/discord") || {};
        const gcData = allData[guildId] || { enabled:false, channelId:null };

        if(action==="on"){
            gcData.enabled=true;
            gcData.channelId = channel.id;
            allData[guildId]=gcData;
            await setData("gagstock/discord", allData);
            this.startAutoStock(channel);
            return interaction.editReply("✅ GAG Auto-stock **enabled**! Updates will now be sent every restock.");
        }

        if(action==="off"){
            gcData.enabled=false;
            allData[guildId]=gcData;
            await setData("gagstock/discord", allData);
            this.stopAutoStock(channel, guildId);
            return interaction.editReply("🛑 GAG Auto-stock **disabled**.");
        }

        if(action==="check"){
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
                .setColor(gcData.enabled ? "Green":"Red");
            return interaction.editReply({ embeds:[embed] });
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