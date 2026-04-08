// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:49721',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'PORT=49721 npx next dev --port 49721',
    url: 'http://localhost:49721',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
