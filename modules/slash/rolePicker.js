const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
    client: null,
    roleChannelId: "1426904690343284847", // Ilagay dito yung channel ID kung saan magpipili ng role ang users
    roles: ["Godly", "Secret"], // Available roles

    init(client) {
        this.client = client;
        this.sendRolePicker(); // Automatic send on ready
    },

    async sendRolePicker() {
        if (!this.client) return console.error("RolePicker: Client not set");

        const channel = await this.client.channels.fetch(this.roleChannelId).catch(() => null);
        if (!channel) return console.error("RolePicker: Channel not found");

        const row = new ActionRowBuilder();
        for (const roleName of this.roles) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`chooseRole_${roleName}`)
                    .setLabel(roleName)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        const embed = new EmbedBuilder()
            .setTitle("🎯 Choose Your Role!")
            .setDescription("Click a button below to assign yourself a role.")
            .setColor("Blue");

        await channel.send({ content: `@here Choose your role!`, embeds: [embed], components: [row] });
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;

        const [prefix, roleName] = interaction.customId.split("_");
        if (prefix !== "chooseRole") return;

        const guild = interaction.guild;
        const member = interaction.member;

        const role = guild.roles.cache.find(r => r.name === roleName);
        if (!role) return interaction.reply({ content: `❌ Role "${roleName}" not found!`, ephemeral: true });

        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            await interaction.reply({ content: `✅ Removed role **${roleName}**`, ephemeral: true });
        } else {
            await member.roles.add(role);
            await interaction.reply({ content: `✅ Assigned role **${roleName}**`, ephemeral: true });
        }
    }
};