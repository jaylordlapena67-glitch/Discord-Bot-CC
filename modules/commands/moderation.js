const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const LOG_CHANNEL_ID = "1426904103534985317"; // Warning & moderation logs channel

module.exports = {
    config: {
        name: "moderation",
        description: "Kick, ban, or mute a user",
        usage: "moderation kick|ban|mute <@user> [reason] [minutes for mute]",
        cooldown: 5,
        permission: 0,
        usePrefix: true,
    },

    letStart: async function({ message, args }) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("🚫 Only admins can use moderation commands.");
        }

        const sub = args[0]?.toLowerCase();
        if (!sub || !["kick","ban","mute"].includes(sub)) {
            return message.reply("⚠️ Usage: moderation kick|ban|mute <@user> [reason] [minutes for mute]");
        }

        const targetMention = message.mentions.users.first();
        if (!targetMention) return message.reply("⚠️ Please mention a user to moderate.");

        const reasonIndex = sub === "mute" ? 2 : 1;
        const reason = args.slice(reasonIndex).join(" ") || "No reason provided";

        const targetMember = await message.guild.members.fetch(targetMention.id).catch(() => null);
        if (!targetMember) return message.reply("❌ Cannot find that user in this server.");

        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

        if (sub === "kick") {
            if (!targetMember.kickable) return message.reply("⚠️ I cannot kick this user.");
            await targetMember.kick(reason);
            const msg = `✅ **${targetMention.tag}** has been kicked. Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [KICK] ${msg}`);
        }

        if (sub === "ban") {
            if (!targetMember.bannable) return message.reply("⚠️ I cannot ban this user.");
            await targetMember.ban({ reason });
            const msg = `✅ **${targetMention.tag}** has been banned. Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [BAN] ${msg}`);
        }

        if (sub === "mute") {
            const minutes = parseInt(args[1]);
            if (isNaN(minutes) || minutes <= 0) return message.reply("⚠️ Please provide a valid mute duration in minutes.");

            const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase().trim() === "muted");
            if (!muteRole) return message.reply("⚠️ No role named 'Muted' found. Please create one.");

            await targetMember.roles.add(muteRole, reason);
            const msg = `✅ **${targetMention.tag}** has been muted for ${minutes} minute(s). Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [MUTE] ${msg}`);

            setTimeout(async () => {
                if (targetMember.roles.cache.has(muteRole.id)) {
                    await targetMember.roles.remove(muteRole, "Mute duration expired").catch(() => {});
                    const unmuteMsg = `🔈 **${targetMention.tag}** has been automatically unmuted after ${minutes} minute(s).`;
                    if (logChannel) logChannel.send(`📌 [UNMUTE] ${unmuteMsg}`);
                    try { await targetMention.send(`🔈 You have been unmuted in **${message.guild.name}**.`); } catch {}
                }
            }, minutes * 60 * 1000);
        }
    }
};
