import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.playwright.ts",
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    colorScheme: "light",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 }
      }
    },
    {
      name: "tablet",
      use: {
        ...devices["iPad Mini"],
        browserName: "chromium",
        viewport: { width: 768, height: 1024 }
      }
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 }
      }
    }
  ],
  webServer: {
    command: "bun run dev:web",
    env: {
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "",
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? ""
    },
    reuseExistingServer: true,
    url: "http://127.0.0.1:5173"
  }
});
