const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.js'); // adjust if needed

module.exports = {
  config: {
    name: 'prefix',
    description: 'Displays the current command prefix and gives quick buttons for Help and About.',
  },

  events: ({ discord }) => {
    const client = discord.client;
    const prefix = config.prefix || '!';

    client.on('messageCreate', async (message) => {
      if (message.author.bot || !message.guild) return;

      const content = message.content.trim().toLowerCase();

      // 🧠 Accept "prefix", "<prefix>prefix", and "<@bot> prefix"
      const botMention = `<@${client.user.id}> prefix`;
      const botMentionAlt = `<@!${client.user.id}> prefix`;

      if (
        content === 'prefix' ||
        content === `${prefix}prefix` ||
        content === botMention ||
        content === botMentionAlt
      ) {
        try {
          const embed = new EmbedBuilder()
            .setColor('#00BFFF')
            .setTitle('⚙️ Current Bot Prefix')
            .setDescription(`> My current prefix is: **\`${prefix}\`**`)
            .setFooter({ text: 'Use this prefix to run my commands.' })
            .setTimestamp();

          const helpButton = new ButtonBuilder()
            .setCustomId('help_button')
            .setLabel('📘 Help')
            .setStyle(ButtonStyle.Primary);

          const aboutButton = new ButtonBuilder()
            .setCustomId('about_button')
            .setLabel('ℹ️ About')
            .setStyle(ButtonStyle.Secondary);

          const row = new ActionRowBuilder().addComponents(helpButton, aboutButton);

          await message.reply({ embeds: [embed], components: [row] });
        } catch (err) {
          console.error('Prefix command error:', err);
        }
      }
    });

    // 🔘 Handle Help and About button clicks
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      try {
        if (interaction.customId === 'help_button') {
          await interaction.reply({
            content: `📘 You selected **Help** — running \`${prefix}help\`...`,
            ephemeral: true,
          });

          const helpCommand = client.commands.get('help');
          if (helpCommand) {
            try {
              if (helpCommand.run)
                await helpCommand.run({ message: interaction, args: [] });
              else if (helpCommand.execute)
                await helpCommand.execute(interaction);
            } catch (err) {
              console.error('Help button error:', err);
            }
          }
        } else if (interaction.customId === 'about_button') {
          await interaction.reply({
            content: `ℹ️ You selected **About** — running \`${prefix}about\`...`,
            ephemeral: true,
          });

          const aboutCommand = client.commands.get('about');
          if (aboutCommand) {
            try {
              if (aboutCommand.run)
                await aboutCommand.run({ message: interaction, args: [] });
              else if (aboutCommand.execute)
                await aboutCommand.execute(interaction);
            } catch (err) {
              console.error('About button error:', err);
            }
          }
        }
      } catch (err) {
        console.error('Interaction error:', err);
      }
    });
  },
};