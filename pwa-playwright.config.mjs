import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./pwa-tests',timeout:60000,workers:1,retries:0,
  use:{baseURL:'http://127.0.0.1:4174',serviceWorkers:'allow'},
  projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer:{command:'python3 pwa-test-server.py',port:4174,reuseExistingServer:!process.env.CI},reporter:'list'
});
