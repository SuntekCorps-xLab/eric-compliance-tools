import { defineConfig, devices } from '@playwright/test';

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '4173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: `http://127.0.0.1:${playwrightPort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${playwrightPort}`,
    url: `http://127.0.0.1:${playwrightPort}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 15'] } },
  ],
});
