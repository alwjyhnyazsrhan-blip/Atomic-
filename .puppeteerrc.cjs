const { join } = require('path');

/**
 * Configuration for Puppeteer on cloud platforms (Render, Railway, Heroku, Docker)
 * Keeps Chrome inside the local project workspace cache so runtime always finds it.
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
