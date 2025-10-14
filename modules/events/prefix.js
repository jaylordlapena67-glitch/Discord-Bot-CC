const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../../config.js'); // Adjust path if needed

module.exports = {
	config: {
		name: 'prefix',
		description: 'Displays the current command prefix and gives quick buttons for Help and About.',
	},

	events: ({ discord }) => {
		const client = discord.client;
		const prefix = config.prefix || '!';

		client.on('messageCreate', (message) => {
			if (message.author.bot || !message.guild) return;

			const content = message.content.trim().toLowerCase();

			// Accept both "prefix" and "@bot prefix"
			if (content === 'prefix' || content === `${prefix}prefix`) {
				const embed = new EmbedBuilder()
					.setColor('#00BFFF')
					.setTitle('⚙️ Current Bot Prefix')
					.setDescription(`> My current prefix is: **\`${prefix}\`**`)
					.setFooter({ text: 'Use this prefix to run my commands.' });

				const helpButton = new ButtonBuilder()
					.setCustomId('help_button')
					.setLabel('📘 Help')
					.setStyle(ButtonStyle.Primary);

				const aboutButton = new ButtonBuilder()
					.setCustomId('about_button')
					.setLabel('ℹ️ About')
					.setStyle(ButtonStyle.Secondary);

				const row = new ActionRowBuilder().addComponents(helpButton, aboutButton);

				message.reply({ embeds: [embed], components: [row] });
			}
		});

		client.on('interactionCreate', async (interaction) => {
			if (!interaction.isButton()) return;

			if (interaction.customId === 'help_button') {
				await interaction.reply({ content: `📘 You selected **Help** — running \`${prefix}help\`...`, ephemeral: true });

				const helpCommand = client.commands.get('help');
				if (helpCommand) {
					try {
						if (helpCommand.letStart) await helpCommand.letStart({ message: interaction, args: [] });
						else if (helpCommand.execute) await helpCommand.execute(interaction);
					} catch (err) {
						console.error('Help button error:', err);
					}
				}

			} else if (interaction.customId === 'about_button') {
				await interaction.reply({ content: `ℹ️ You selected **About** — running \`${prefix}about\`...`, ephemeral: true });

				const aboutCommand = client.commands.get('about');
				if (aboutCommand) {
					try {
						if (aboutCommand.letStart) await aboutCommand.letStart({ message: interaction, args: [] });
						else if (aboutCommand.execute) await aboutCommand.execute(interaction);
					} catch (err) {
						console.error('About button error:', err);
					}
				}
			}
		});
	},
};