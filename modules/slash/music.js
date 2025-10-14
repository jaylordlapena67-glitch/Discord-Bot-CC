const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const ytSearch = require('yt-search');

const cacheFolderPath = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheFolderPath)) {
    fs.mkdirSync(cacheFolderPath);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Play a song from YouTube')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Enter the song name')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const query = interaction.options.getString('query');

        try {
            const browsingMessage = await interaction.followUp('🔍 Browsing Music from YouTube... Please wait.');

            const searchResults = await ytSearch(query);
            const firstResult = searchResults.videos[0];

            if (!firstResult) {
                await browsingMessage.delete();
                return interaction.followUp('No results found.');
            }

            const apiUrl = `https://ccproject.serv00.net/ytdl2.php?url=${firstResult.url}`;
            const response = await axios.get(apiUrl);

            const audioUrl = response.data.download;
            const audioTitle = response.data.title;
            const audioDuration = firstResult.timestamp;
            const youtubeLink = firstResult.url;
            const audioFileName = `${audioTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
            const audioFilePath = path.join(cacheFolderPath, audioFileName);

            const audioStream = await axios.get(audioUrl, { responseType: 'stream' });

            const writer = fs.createWriteStream(audioFilePath);
            audioStream.data.pipe(writer);

            writer.on('finish', async () => {
                const attachment = new AttachmentBuilder(audioFilePath);

                const caption = `Here is your Music!\n\n**RickGDBot Browser Music - YT**\n**Title**: ${audioTitle}\n**Duration**: ${audioDuration}\n**YouTube Link**: ${youtubeLink}\n\nThank you for using RickGDBot 🌟`;

                await browsingMessage.delete();
                await interaction.followUp({ content: caption, files: [attachment] });
                
                // Clean up the file after sending
                fs.unlink(audioFilePath, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            });

            writer.on('error', async (err) => {
                console.error(err);
                await browsingMessage.delete();
                await interaction.followUp('An error occurred while downloading the audio.');
            });

        } catch (error) {
            console.error(error);
            await interaction.followUp('An error occurred while fetching the song.');
        }
    },
};
