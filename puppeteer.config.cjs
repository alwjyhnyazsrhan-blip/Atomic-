const { join } = require('path');

/**
 * Configuration for Puppeteer on Render, Railway, Docker, and cloud hosts.
 * Specifies the cacheDirectory so that Chrome is downloaded into the local project workspace.
 * This ensures Chrome persists across build & runtime containers on Render.
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
