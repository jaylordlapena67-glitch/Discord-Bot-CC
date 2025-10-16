const fs = require('fs');
const path = require('path');
const gradient = require('gradient-string');
const chalk = require('chalk');

const boldText = (text) => chalk.bold(text);

const loadEvents = (client) => {
    console.log(boldText(gradient.fruit("━━━━━[ STARTING EVENT DEPLOYMENT ]━━━━━━━")));

    const eventsPath = path.join(__dirname, '../modules/events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    // Ensure client.events exists
    if (!client.events) client.events = new Map();

    eventFiles.forEach((file) => {
        try {
            const event = require(path.join(eventsPath, file));

            if (!event.config || !event.events) {
                console.warn(boldText(gradient.cristal(`⚠️ Skipped loading ${file}: Missing config or events property`)));
                return;
            }

            client.events.set(event.config.name, event);

            // Initialize the event
            event.events({ discord: { client } });

            console.log(boldText(gradient.pastel(`[ ${event.config.name} ] > Event loaded`)));
        } catch (error) {
            console.error(boldText(gradient.cristal(`Failed to load event ${file}: ${error.message}`)));
        }
    });

    console.log(boldText(gradient.instagram("━━━━━[ DONE DEPLOYED EVENT COMMANDS ]━━━━━━━")));
};

module.exports = loadEvents;