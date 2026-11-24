import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 7000 },
  use: {
    baseURL: process.env.APP_ORIGIN || 'http://localhost:3000',
    browserName: 'chromium',
    viewport: { width: 1360, height: 920 },
    launchOptions: {
      executablePath: process.env.SBG_CHROMIUM_PATH || undefined,
      args: process.env.SBG_CHROMIUM_ARGS?.split(' ').filter(Boolean) || [],
    },
    trace: 'retain-on-failure',
  },
});
