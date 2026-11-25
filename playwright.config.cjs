const { defineConfig } = require(process.env.VB_PLAYWRIGHT_MODULE);
const { tmpdir } = require('node:os');
const { join } = require('node:path');
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.cjs',
  outputDir: join(tmpdir(), 'veilbench-e2e-results'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:4186', locale: 'en-US', serviceWorkers: 'block' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/vite.config.mjs --host 127.0.0.1 --port 4186 --strictPort',
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
  },
});
