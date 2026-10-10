import {test,expect} from '@playwright/test';
const instant=new Date('2026-10-10T18:00:00Z'), epoch=instant.getTime()/1000;
const current={epoch,received_at:instant.toISOString(),temperature_c:10.5,feels_like_c:9,humidity:80,dew_point_c:7.2,wind_speed_kmh:4,wind_gust_kmh:7,wind_direction_deg:90,pressure_hpa:1011,rain_daily_mm:1.2,rain_rate_mm_h:0,solar_w_m2:0,uv_index:0};
const rows=[{...current,epoch:epoch-3600,temperature_c:16.4,solar_w_m2:575},{...current,epoch:epoch-300,temperature_c:8.1},{...current}];
async function prepare(page,{delayHistory,forecastFailure=false,installClock=true}={}) {
 if(installClock)await page.clock.install({time:instant});
 await page.route('**/static.cloudflareinsights.com/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
 await page.route('**/*.workers.dev/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data={};
  if(path==='/current')data=current;
  if(path==='/history'){if(delayHistory)await delayHistory;data={readings:rows};}
  if(path==='/daily')data={days:[]};
  if(path==='/rain-summary')data={today_mm:1.2};
  if(path==='/met/forecast'){if(forecastFailure)return route.fulfill({status:503,contentType:'application/json',body:'{}'});data={tonight:'Mainly dry tonight.',tomorrow:'Cloudy tomorrow.'};}
  if(path==='/met/warnings')data={warnings:[]};
  if(path==='/met/johnstown')data={temperature_c:12,report_time:'2026-10-10T17:00:00Z'};
  if(path==='/sky-photo/meta')data={available:false};
  if(path==='/stats')data={first_epoch:Date.parse('2026-09-11T12:00:00Z')/1000};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
}
test('daily extremes wait for archive data while live readings appear immediately',async({page})=>{
 let release;const delayHistory=new Promise(resolve=>release=resolve);await prepare(page,{delayHistory});
 await page.goto('/index.html');await expect(page.locator('#heroTemp')).toHaveText('10.5');
 await expect(page.locator('#todayHigh')).toHaveText('Loading');await expect(page.locator('#solarPeak')).toHaveText('Loading');
 release();await expect(page.locator('#todayHigh')).toHaveText('16.4');await expect(page.locator('#todayLow')).toHaveText('8.1');await expect(page.locator('#solarPeak')).toHaveText('575');
});
test('evening forecast explains a missing daytime section and clears failed forecast sections',async({page})=>{
 await prepare(page);await page.goto('/index.html');await expect(page.locator('#forecastToday')).toContainText('No separate daytime forecast');await expect(page.locator('#forecastTonight')).toHaveText('Mainly dry tonight.');
 await page.unroute('**/*.workers.dev/**');await prepare(page,{forecastFailure:true,installClock:false});await page.reload();
 await expect(page.locator('#forecastTonight')).toContainText('temporarily unavailable');await expect(page.locator('#forecastTomorrow')).toContainText('temporarily unavailable');
});
test('comparison uses the archived report-time temperature rather than the latest reading',async({page})=>{
 await prepare(page);await page.goto('/climate.html');await expect(page.locator('#climateDelta')).toHaveText('+4.4°C');await expect(page.locator('#climateComparisonTime')).toContainText('matched within five minutes');
});
test('advanced zoom starts collapsed and downloads retain common navigation and range validation',async({page})=>{
 await prepare(page);await page.setViewportSize({width:390,height:844});await page.goto('/graphs.html');
 await expect(page.locator('.chart-advanced')).toBeVisible();await expect(page.getByRole('button',{name:'Zoom to selected interval'})).toBeHidden();
 await page.getByText('Advanced zoom options',{exact:true}).click();await expect(page.getByRole('button',{name:'Zoom to selected interval'})).toBeVisible();
 await page.goto('/downloads.html');await expect(page.getByRole('link',{name:'Parknacross Weather home'})).toBeVisible();
 await page.locator('#exportFrom').fill('2026-10-09');await page.locator('#exportTo').fill('2026-10-08');await page.locator('#customExportButton').click();await expect(page.locator('#downloadStatus')).toContainText('start date');
});

test('daily rainfall stays consistent across the dashboard, summary and Rain Centre',async({page})=>{
 await prepare(page);await page.goto('/index.html');await expect(page.locator('#heroRain')).toHaveText('1.2 mm');
 await page.goto('/summary.html');await expect(page.locator('#todayRain')).toHaveText('1.2 mm');
 await page.goto('/rain.html');await expect(page.locator('#rainToday')).toHaveText('1.2 mm');
});
