const { setData, getData } = require("../../database.js");
const LOG_CHANNEL_ID = "1426904103534985317"; // Warning & mute logs channel

// Time in milliseconds
const MUTE_TIMES = [10*60*1000, 30*60*1000, 60*60*1000, 12*60*60*1000, 24*60*60*1000]; // 10m,30m,1h,12h,24h

async function addWarning(guildId, userId, type, note, channel) {
    const dataPath = `warnings/${guildId}/${userId}`;
    let warnings = (await getData(dataPath)) || { count: 0, reasons: [] };

    warnings.count = (warnings.count || 0) + 1;
    warnings.reasons.push({ type, note, time: Date.now() });
    await setData(dataPath, warnings);

    const logChannel = channel.guild.channels.cache.get(LOG_CHANNEL_ID);

    const msg = `⚠️ <@${userId}> has been warned for **${type}**.\nReason: ${note}\nWarnings: ${warnings.count}/5`;
    await channel.send({ content: msg });
    if (logChannel) await logChannel.send({ content: `📌 [LOG] ${msg}` });

    // Determine mute/kick action
    const member = await channel.guild.members.fetch(userId);
    if (!member) return;

    if (warnings.count <= 5) {
        const muteDuration = MUTE_TIMES[warnings.count - 1]; // 1st warning => 10m, etc.
        if (muteDuration) {
            await member.timeout(muteDuration, `Warning ${warnings.count}: ${note}`);
            const muteMsg = `🔇 <@${userId}> muted for ${muteDuration/60000} minutes (Warning ${warnings.count})`;
            await channel.send({ content: muteMsg });
            if (logChannel) await logChannel.send({ content: `📌 [LOG] ${muteMsg}` });

            // Schedule unmute log
            setTimeout(async () => {
                const unmuteMsg = `🔊 <@${userId}> has been automatically unmuted (Warning ${warnings.count})`;
                if (channel) await channel.send({ content: unmuteMsg });
                if (logChannel) await logChannel.send({ content: `📌 [LOG] ${unmuteMsg}` });
            }, muteDuration);
        }
    }

    // Reset warnings after 5th warning
    if (warnings.count >= 5) {
        await setData(dataPath, { count: 0, reasons: [] });
        const resetMsg = `♻️ <@${userId}>'s warnings have been reset after reaching 5 warnings.`;
        if (channel) await channel.send({ content: resetMsg });
        if (logChannel) await logChannel.send({ content: `📌 [LOG] ${resetMsg}` });
    }
}