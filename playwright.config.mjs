import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    port: 4173,
    reuseExistingServer: true
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } }
  ]
});
