const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const LOG_CHANNEL_ID = "1426904103534985317"; // Admin Log
const IGNORE_ROLE_ID = "1427447542475657278"; // Role to ignore

function parseTime(str) {
    const regex = /^(\d+)([mhd])$/i;
    const match = str.match(regex);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "m") return value * 60 * 1000;
    if (unit === "h") return value * 60 * 60 * 1000;
    if (unit === "d") return value * 24 * 60 * 60 * 1000;
    return null;
}

module.exports = {
    config: {
        name: "moderation",
        description: "Kick, ban, or mute a user",
        usage: "moderation kick|ban|mute <@user> [duration for mute] [reason]",
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
            return message.reply("⚠️ Usage: moderation kick|ban|mute <@user> [duration for mute] [reason]");
        }

        const targetMention = message.mentions.users.first();
        if (!targetMention) return message.reply("⚠️ Please mention a user to moderate.");

        const targetMember = await message.guild.members.fetch(targetMention.id).catch(() => null);
        if (!targetMember) return message.reply("❌ Cannot find that user in this server.");

        // IGNORE ROLE CHECK
        if (targetMember.roles.cache.has(IGNORE_ROLE_ID)) {
            return message.reply(`⚠️ User <@${targetMention.id}> is ignored from moderation.`);
        }

        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

        if (sub === "kick") {
            const reason = args.slice(1).join(" ") || "No reason provided";
            if (!targetMember.kickable) return message.reply("⚠️ I cannot kick this user.");
            await targetMember.kick(reason);
            const msg = `✅ **${targetMention.tag}** has been kicked. Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [KICK] ${msg}`);
        }

        if (sub === "ban") {
            const reason = args.slice(1).join(" ") || "No reason provided";
            if (!targetMember.bannable) return message.reply("⚠️ I cannot ban this user.");
            await targetMember.ban({ reason });
            const msg = `✅ **${targetMention.tag}** has been banned. Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [BAN] ${msg}`);
        }

        if (sub === "mute") {
            const durationArg = args[1]; // 1m, 1h, 1d
            const muteDuration = parseTime(durationArg);
            if (!muteDuration) return message.reply("⚠️ Please provide a valid mute duration (e.g., 1m, 1h, 1d).");

            const reason = args.slice(2).join(" ") || "No reason provided";

            const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase().trim() === "muted");
            if (!muteRole) return message.reply("⚠️ No role named 'Muted' found. Please create one.");

            await targetMember.roles.add(muteRole, reason);
            const msg = `✅ **${targetMention.tag}** has been muted for ${durationArg}. Reason: ${reason}`;
            message.reply(msg);
            if (logChannel) logChannel.send(`📌 [MUTE] ${msg}`);

            setTimeout(async () => {
                if (targetMember.roles.cache.has(muteRole.id)) {
                    await targetMember.roles.remove(muteRole, "Mute duration expired").catch(() => {});
                    const unmuteMsg = `🔈 **${targetMention.tag}** has been automatically unmuted after ${durationArg}.`;
                    if (logChannel) logChannel.send(`📌 [UNMUTE] ${unmuteMsg}`);
                    try { await targetMention.send(`🔈 You have been unmuted in **${message.guild.name}**.`); } catch {}
                }
            }, muteDuration);
        }
    }
};