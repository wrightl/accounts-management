import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so local e2e does not collide with `next dev` (3000) or other apps. */
const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // CI already ran `npm run build`. Locally rebuild so e2e never hits a
    // stale `.next` from an older brand or marketing copy.
    command: process.env.CI ? "npm run start" : "npx next build && npx next start",
    url: baseURL,
    // Always start our own server so we never accidentally hit another app
    // that happens to be listening on the same port.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
  },
});
