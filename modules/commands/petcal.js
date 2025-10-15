const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("petcal")
        .setDescription("Calculate pet weights for your pet")
        .addIntegerOption(option =>
            option.setName("age")
                .setDescription("Age level of your pet (1-100)")
                .setRequired(true)
        )
        .addNumberOption(option =>
            option.setName("weight")
                .setDescription("Weight of your pet at that age (kg)")
                .setRequired(true)
        ),

    async execute(interaction) {
        const givenAge = interaction.options.getInteger("age");
        const givenWeight = interaction.options.getNumber("weight");

        if (givenAge < 1 || givenAge > 100) {
            return interaction.reply({ content: "⚠️ Age must be between 1 and 100.", ephemeral: true });
        }

        if (givenWeight <= 0) {
            return interaction.reply({ content: "⚠️ Weight must be greater than 0.", ephemeral: true });
        }

        // Scale factor at the given age (1.0 at Age 1 → 10.0 at Age 100)
        const scaleAtAge = 1 + (givenAge - 1) * (9 / 99);
        const baseWeight = givenWeight / scaleAtAge;
        const maxWeight = baseWeight * 10;
        const growthPerAge = (maxWeight - baseWeight) / 99;

        // Size category at Age 1
        let sizeCategory = "Unknown";
        if (baseWeight >= 0.1 && baseWeight <= 0.9) sizeCategory = "🟢 Small";
        else if (baseWeight >= 1.0 && baseWeight <= 2.9) sizeCategory = "🔵 Normal";
        else if (baseWeight >= 3.0 && baseWeight <= 3.9) sizeCategory = "🟡 Good Size";
        else if (baseWeight >= 4.0 && baseWeight <= 4.9) sizeCategory = "🟤 Semi Huge";
        else if (baseWeight >= 5.0 && baseWeight <= 6.9) sizeCategory = "🟠 Huge";
        else if (baseWeight >= 7.0 && baseWeight <= 9.9) sizeCategory = "🔴 Titanic";
        else if (baseWeight >= 10.0 && baseWeight <= 100) sizeCategory = "🟣 Godly";

        // Build result string
        let result =
            `🐾 Pet Calculator 🐾\n\n` +
            `Input: ${givenWeight} kg (Age ${givenAge})\n` +
            `Calculated Base Weight (Age 1): ${baseWeight.toFixed(2)} kg\n` +
            `Size Category (at Age 1): ${sizeCategory}\n\nEstimated weights:\n`;

        for (let i = 1; i <= 100; i++) {
            if (i === 1 || i % 10 === 0 || i === givenAge || i === 100) {
                let est = baseWeight + growthPerAge * (i - 1);
                result += `Age ${i}: ${est.toFixed(2)} kg\n`;
            }
        }

        const requested = baseWeight + growthPerAge * (givenAge - 1);
        result += `\n➡️ At Age ${givenAge}, your pet weighs: ${requested.toFixed(2)} kg`;

        // Split into chunks if too long
        const chunks = result.match(/[\s\S]{1,2000}/g);
        for (const chunk of chunks) {
            await interaction.reply({ content: chunk });
        }
    }
};