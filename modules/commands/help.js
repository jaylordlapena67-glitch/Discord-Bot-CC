const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require('fs');
const path = require('path');

module.exports = {
	config: {
		name: 'help',
		description: 'Show the list of available commands',
		aliases: ['commands', 'h'],
		usage: '/help',
		cooldown: 20,
		usePrefix: false,
		permission: 0,
	},

	letStart: async function ({ message, args, client }) {
		const commandsDir = path.join(__dirname);
		const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

		// Read the prefix directly from config.json
		let prefix = '-';
		try {
			const configData = fs.readFileSync('./config.js', 'utf8');
			const config = JSON.parse(configData);
			prefix = config.prefix || '-';
		} catch (err) {
			console.error('Error reading config.json:', err);
		}

		const visibleCommands = commandFiles
			.map(file => {
				const command = require(path.join(commandsDir, file));
				if (command.config && !command.config.hide) {
					return `• **${command.config.name}** — ${command.config.description || 'No description available'}`;
				}
			})
			.filter(Boolean)
			.sort();

		if (visibleCommands.length === 0) {
			return message.reply({ 
				embeds: [new EmbedBuilder()
					.setColor('#E74C3C')
					.setTitle('No Commands Available')
					.setDescription('There are no public commands available right now.')
				] 
			});
		}

		const pageSize = 10;
		const totalPages = Math.ceil(visibleCommands.length / pageSize);
		let currentPage = 0;

		const generateEmbed = (page) => {
			const start = page * pageSize;
			const end = start + pageSize;

			return new EmbedBuilder()
				.setColor('#3498DB')
				.setTitle(`Hello There ${message.author.username}!`)
				.setDescription(
					`Here’s the list of my public commands:\n\n${visibleCommands.slice(start, end).join("\n")}\n\nSystem Prefix: \`${prefix}\``
				)
				.setFooter({ text: `Page ${page + 1} of ${totalPages} • ${new Date().toLocaleString()}` });
		};

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('prev')
				.setLabel('⬅️ Previous')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(true),

			new ButtonBuilder()
				.setCustomId('next')
				.setLabel('➡️ Next')
				.setStyle(ButtonStyle.Primary)
				.setDisabled(totalPages <= 1)
		);

		const sentMessage = await message.reply({ 
			content: `👋 **Hey there, ${message.author.username}!** Need help? Here’s what I can do:`, 
			embeds: [generateEmbed(currentPage)], 
			components: [row] 
		});

		const collector = sentMessage.createMessageComponentCollector({ time: 60000 });

		collector.on('collect', async (interaction) => {
			if (interaction.user.id !== message.author.id) {
				return interaction.reply({ content: "❌ You can't interact with this help menu!", ephemeral: true });
			}

			if (interaction.customId === 'prev') {
				currentPage--;
			} else if (interaction.customId === 'next') {
				currentPage++;
			}

			row.components[0].setDisabled(currentPage === 0);
			row.components[1].setDisabled(currentPage === totalPages - 1);

			await interaction.update({ embeds: [generateEmbed(currentPage)], components: [row] });
		});

		collector.on('end', () => {
			sentMessage.edit({ components: [] });
		});
	},
};