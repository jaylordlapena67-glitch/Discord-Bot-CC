// modules/commands/moderation.js
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
        description: "Kick, ban, or mute multiple users",
        usage: "moderation kick|ban|mute <@user1> <@user2> ... [duration for mute] [reason]",
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
            return message.reply("⚠️ Usage: moderation kick|ban|mute <@user1> <@user2> ... [duration for mute] [reason]");
        }

        const mentions = message.mentions.users;
        if (!mentions.size) return message.reply("⚠️ Please mention at least one user to moderate.");

        const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

        // For mute, parse duration
        let muteDuration = null;
        let durationArg = null;
        if (sub === "mute") {
            durationArg = args.find(arg => parseTime(arg));
            if (!durationArg) return message.reply("⚠️ Please provide a valid mute duration (e.g., 1m, 1h, 1d).");
            muteDuration = parseTime(durationArg);
        }

        // Determine reason: everything after mentions (and duration for mute)
        let firstArgIndexAfterMentions = Math.max(...mentions.map(u => args.findIndex(a => a.includes(u.id)))) + 1;
        if (sub === "mute" && durationArg) firstArgIndexAfterMentions = args.indexOf(durationArg) + 1;
        const reason = args.slice(firstArgIndexAfterMentions).join(" ") || "No reason provided";

        // Process each mentioned user
        for (const [userId, user] of mentions) {
            const targetMember = await message.guild.members.fetch(userId).catch(() => null);
            if (!targetMember) continue;
            if (targetMember.roles.cache.has(IGNORE_ROLE_ID)) continue;

            try {
                if (sub === "kick") {
                    if (!targetMember.kickable) continue;
                    await targetMember.kick(reason);
                    const msg = `✅ **${user.tag}** has been kicked. Reason: ${reason}`;
                    message.reply(msg);
                    if (logChannel) logChannel.send(`📌 [KICK] ${msg}`);
                }

                if (sub === "ban") {
                    if (!targetMember.bannable) continue;
                    await targetMember.ban({ reason });
                    const msg = `✅ **${user.tag}** has been banned. Reason: ${reason}`;
                    message.reply(msg);
                    if (logChannel) logChannel.send(`📌 [BAN] ${msg}`);
                }

                if (sub === "mute") {
                    const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase().trim() === "muted");
                    if (!muteRole) {
                        message.reply("⚠️ No role named 'Muted' found. Please create one.");
                        return;
                    }
                    if (targetMember.roles.cache.has(muteRole.id)) continue;

                    await targetMember.roles.add(muteRole, reason);
                    const msg = `✅ **${user.tag}** has been muted for ${durationArg}. Reason: ${reason}`;
                    message.reply(msg);
                    if (logChannel) logChannel.send(`📌 [MUTE] ${msg}`);

                    setTimeout(async () => {
                        if (targetMember.roles.cache.has(muteRole.id)) {
                            await targetMember.roles.remove(muteRole, "Mute duration expired").catch(() => {});
                            const unmuteMsg = `🔈 **${user.tag}** has been automatically unmuted after ${durationArg}.`;
                            if (logChannel) logChannel.send(`📌 [UNMUTE] ${unmuteMsg}`);
                            try { await user.send(`🔈 You have been unmuted in **${message.guild.name}**.`); } catch {}
                        }
                    }, muteDuration);
                }
            } catch (err) {
                console.error(`❌ Failed to ${sub} ${user.tag}:`, err);
            }
        }
    }
};