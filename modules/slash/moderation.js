const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const LOG_CHANNEL_ID = "1426904103534985317"; // Warning & moderation logs channel

module.exports = {
    data: new SlashCommandBuilder()
        .setName("moderation")
        .setDescription("Kick, ban, or mute a user")
        .addSubcommand(sub =>
            sub.setName("kick")
                .setDescription("Kick a user from the server")
                .addUserOption(opt => opt.setName("target").setDescription("User to kick").setRequired(true))
                .addStringOption(opt => opt.setName("reason").setDescription("Reason for kicking").setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName("ban")
                .setDescription("Ban a user from the server")
                .addUserOption(opt => opt.setName("target").setDescription("User to ban").setRequired(true))
                .addStringOption(opt => opt.setName("reason").setDescription("Reason for banning").setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName("mute")
                .setDescription("Mute a user in the server")
                .addUserOption(opt => opt.setName("target").setDescription("User to mute").setRequired(true))
                .addIntegerOption(opt => opt.setName("minutes").setDescription("Duration in minutes").setRequired(true))
                .addStringOption(opt => opt.setName("reason").setDescription("Reason for muting").setRequired(false))
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: "🚫 Only admins can use moderation commands.", ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "No reason provided";

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ Cannot find that user in this server.", ephemeral: true });

        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);

        if (sub === "kick") {
            if (!member.kickable) return interaction.reply({ content: "⚠️ I cannot kick this user.", ephemeral: true });
            await member.kick(reason);
            const msg = `✅ **${target.tag}** has been kicked. Reason: ${reason}`;
            await interaction.reply(msg);
            if (logChannel) logChannel.send(`📌 [KICK] ${msg}`);
        }

        if (sub === "ban") {
            if (!member.bannable) return interaction.reply({ content: "⚠️ I cannot ban this user.", ephemeral: true });
            await member.ban({ reason });
            const msg = `✅ **${target.tag}** has been banned. Reason: ${reason}`;
            await interaction.reply(msg);
            if (logChannel) logChannel.send(`📌 [BAN] ${msg}`);
        }

        if (sub === "mute") {
            const minutes = interaction.options.getInteger("minutes");
            const muteRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase().trim() === "muted");
            if (!muteRole) return interaction.reply({ content: "⚠️ No role named 'Muted' found. Please create one.", ephemeral: true });

            await member.roles.add(muteRole, reason);

            const msg = `✅ **${target.tag}** has been muted for ${minutes} minute(s). Reason: ${reason}`;
            await interaction.reply(msg);
            if (logChannel) logChannel.send(`📌 [MUTE] ${msg}`);

            setTimeout(async () => {
                if (member.roles.cache.has(muteRole.id)) {
                    await member.roles.remove(muteRole, "Mute duration expired").catch(() => {});
                    const unmuteMsg = `🔈 **${target.tag}** has been automatically unmuted after ${minutes} minute(s).`;
                    if (logChannel) logChannel.send(`📌 [UNMUTE] ${unmuteMsg}`);
                    try { await member.send(`🔈 You have been unmuted in **${interaction.guild.name}**.`); } catch {}
                }
            }, minutes * 60 * 1000);
        }
    }
};