import { test, expect } from "@playwright/test";

const current={epoch:1790427000,received_at:"2026-09-26T12:50:00.000Z",temperature_c:18.8,feels_like_c:18.5,humidity:66,dew_point_c:12.3,wind_speed_kmh:5.4,wind_gust_kmh:12.2,wind_direction_deg:158,pressure_hpa:1016.9,rain_rate_mm_h:0,rain_daily_mm:0,solar_w_m2:133.6,uv_index:1,battery_v:3.28,lightning_strikes:0,soil_channel:1,soil_moisture_pct:41,soil_temperature_c:16.7,soil_ec_us_cm:70};

async function mockDashboardApi(page){
  await page.route("https://parknacross-weather.dave-s-carter.workers.dev/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path==="/current"?current:path==="/soil-status"?{gateway_upload_received:true,received_epoch:current.epoch-30,wh52_detected:true,channel:1,fields_received:{moisture:true,temperature:true,conductivity:true}}:path==="/history"?{readings:[current]}:path==="/daily"?{days:[]}:path==="/rain-summary"?{today_mm:0}:path==="/lightning"?{available:true,sensor_status:"active",strikes_today:0,distance_km:null,nearest_24h_km:null,last_strike_epoch:null}:path==="/sky-photo/meta"?{available:false}:{};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  });
}

test("WH52 early-data state and freshness are clear",async({page})=>{
  await mockDashboardApi(page);await page.goto("/index.html");
  await expect(page.getByRole("heading",{name:"Garden soil"})).toBeVisible();
  await expect(page.getByText(/Early data · day 1 of 14/)).toBeVisible();
  await expect(page.getByText(/still building its local baseline/)).toBeVisible();
  await expect(page.getByText(/Sensor upload received/)).toBeVisible();
});

test("weather card downloads when native file sharing is unavailable",async({page})=>{
  await mockDashboardApi(page);await page.goto("/index.html");
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Create weather card"}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^parknacross-weather-.*\.png$/);
  await expect(page.getByText(/Weather card downloaded/)).toBeVisible();
});

test("native share failure falls back to a download without a false creation error",async({page})=>{
  await page.addInitScript(()=>{navigator.canShare=()=>true;navigator.share=async()=>{const error=new Error("Share unavailable");error.name="NotAllowedError";throw error;};});
  await mockDashboardApi(page);await page.goto("/index.html");
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Create weather card"}).click();await downloadPromise;
  await expect(page.getByText(/downloaded instead/)).toBeVisible();
  await expect(page.getByText(/could not be created/)).toHaveCount(0);
});

test("new panels do not create horizontal mobile overflow",async({page})=>{
  await mockDashboardApi(page);await page.goto("/index.html");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
