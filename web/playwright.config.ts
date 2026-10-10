import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    channel: process.env.PW_CHANNEL || undefined,
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    env: { PMW_DB: path.resolve('..', 'db', 'pmw-smoke-run.sqlite'),
      VERCEL: '', PMW_USE_REMOTE: '0', TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '' },
  },
});
