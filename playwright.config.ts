import { defineConfig, devices } from '@playwright/test'

const phone = { width: 390, height: 844 }
const small = { width: 375, height: 667 }
const desk = { width: 1280, height: 800 }

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'es-ES',
    // El día de la app es el de Madrid: el navegador también vive allí.
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: 'http://127.0.0.1:5173/misa-diaria/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-teléfono', use: { ...devices['Desktop Chrome'], viewport: phone, isMobile: true } },
    { name: 'chromium-escritorio', use: { ...devices['Desktop Chrome'], viewport: desk } },
    { name: 'webkit-teléfono', use: { ...devices['Desktop Safari'], viewport: phone, deviceScaleFactor: 1, isMobile: true } },
    { name: 'webkit-iphone-se', use: { ...devices['Desktop Safari'], viewport: small, deviceScaleFactor: 1, isMobile: true }, grep: /pequeña/ },
    { name: 'webkit-escritorio', use: { ...devices['Desktop Safari'], viewport: desk } },
  ],
})
