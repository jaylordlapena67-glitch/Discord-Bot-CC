const { EmbedBuilder } = require("discord.js");

module.exports = {
    config: {
        name: 'petcal',
        description: 'Calculate your pet’s weight progression',
        aliases: ['pet', 'petcalculator'],
        usage: 'petcal <age> <weight>',
        cooldown: 5,
        usePrefix: true,
        permission: 0,
    },

    letStart: async function ({ message, args }) {
        if (args.length < 2) {
            return message.reply("⚠️ Usage: petcal <age> <weight>");
        }

        const givenAge = parseInt(args[0]);
        const givenWeight = parseFloat(args[1]);

        if (isNaN(givenAge) || givenAge < 1 || givenAge > 100) {
            return message.reply("⚠️ Age must be between 1 and 100.");
        }

        if (isNaN(givenWeight) || givenWeight <= 0) {
            return message.reply("⚠️ Weight must be greater than 0.");
        }

        const scaleAtAge = 1 + (givenAge - 1) * (9 / 99);
        const baseWeight = givenWeight / scaleAtAge;
        const maxWeight = baseWeight * 10;
        const growthPerAge = (maxWeight - baseWeight) / 99;

        // Determine size category
        let sizeCategory = "Unknown";
        if (baseWeight >= 0.1 && baseWeight <= 0.9) sizeCategory = "Small";
        else if (baseWeight >= 1 && baseWeight <= 2.9) sizeCategory = "Normal";
        else if (baseWeight >= 3 && baseWeight <= 3.9) sizeCategory = "Good Size";
        else if (baseWeight >= 4 && baseWeight <= 4.9) sizeCategory = "Semi Huge";
        else if (baseWeight >= 5 && baseWeight <= 6.9) sizeCategory = "Huge";
        else if (baseWeight >= 7 && baseWeight <= 9.9) sizeCategory = "Titanic";
        else if (baseWeight >= 10) sizeCategory = "Godly";

        // Build estimated weights text
        let estWeights = "";
        for (let i = 1; i <= 100; i++) {
            if (i === 1 || i % 10 === 0 || i === givenAge || i === 100) {
                let est = baseWeight + growthPerAge * (i - 1);
                estWeights += `• Age ${i}: ${est.toFixed(2)} kg\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("🐾 Pet Weight Calculator 🐾")
            .setColor("Green")
            .setDescription(`Input: **${givenWeight} kg** (Age ${givenAge})\nBase Weight (Age 1): **${baseWeight.toFixed(2)} kg**\nSize Category: **${sizeCategory}**`)
            .addFields(
                { name: "📊 Estimated Weights", value: estWeights.slice(0, 1024) }
            )
            .setFooter({
                text: `➡️ At Age ${givenAge}, your pet weighs ${(baseWeight + growthPerAge * (givenAge - 1)).toFixed(2)} kg`
            });

        await message.reply({ embeds: [embed] });
    }
};