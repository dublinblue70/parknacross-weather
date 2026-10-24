import {test,expect} from '@playwright/test';
const now=Math.floor(Date.now()/1000);let old,fail;
test.beforeEach(async({page})=>{
 old=false;fail=false;await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/*.workers.dev/**',r=>{const path=new URL(r.request().url()).pathname;if(fail&&path!=='/met/warnings')return r.fulfill({status:503,body:'{}'});const epoch=now-(old?1200:0),current={epoch,received_at:new Date(epoch*1000).toISOString(),temperature_c:12,humidity:70,wind_speed_kmh:5,wind_gust_kmh:8,rain_daily_mm:0,rain_rate_mm_h:old?4:0,pressure_hpa:1017,uv_index:1,soil_moisture_pct:38};let data={};if(path==='/current')data=current;if(path==='/history')data={readings:[current]};if(path==='/rain-summary')data={today_mm:0,current_rate_mm_h:4,consecutive_dry_days:1};if(path==='/daily')data={days:[]};if(path==='/met/warnings')data={warnings:[]};return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
});
test('mobile summary prioritises figures, keeps warnings visible and opens details',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/summary.html');await expect(page.locator('#todayHigh')).toHaveText('12.0 °C');await expect(page.locator('#summaryDate')).toContainText('Irish time');await expect(page.locator('#summaryDataStatus')).toHaveText('Up to date');await expect(page.locator('#officialWarningBadge')).toBeVisible();
 const order=await page.evaluate(()=>document.getElementById('summaryOverview').compareDocumentPosition(document.getElementById('significantWeatherHeading')));expect(order&4).toBeTruthy();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByText('Rain details & dry spells',{exact:true}).click();await expect(page.locator('#currentRainRate')).toBeVisible();await expect(page.locator('#currentRainRate')).toHaveText('0.0 mm/h');await page.getByText('Garden soil readings',{exact:true}).click();await expect(page.locator('#summarySoilMoisture')).toBeVisible();const box=await page.locator('#summaryRefresh').boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
});
test('stale observations retain daily totals but cannot be shared as current weather',async({page})=>{
 old=true;await page.goto('/summary.html');await expect(page.locator('#summaryDataStatus')).toHaveText('Latest reading delayed');await expect(page.locator('#todayHigh')).toHaveText('12.0 °C');await expect(page.locator('#shareWeatherButton')).toBeDisabled();await expect(page.locator('#downloadCsvButton')).toBeEnabled();await expect(page.locator('#currentRainRate')).toHaveText('--');old=false;await page.getByRole('button',{name:'Refresh summary'}).click();await expect(page.locator('#summaryDataStatus')).toHaveText('Up to date');await expect(page.locator('#shareWeatherButton')).toBeEnabled();
});
test('failed refresh preserves labelled results and recovers on retry',async({page})=>{
 await page.goto('/summary.html');await expect(page.locator('#summaryDataStatus')).toHaveText('Up to date');const stamp=await page.locator('#summaryUpdated').textContent();fail=true;await page.getByRole('button',{name:'Refresh summary'}).click();await expect(page.locator('#summaryDataStatus')).toHaveText('Some data unavailable');await expect(page.locator('#summaryUpdated')).toHaveText(stamp);await expect(page.locator('#todayHigh')).toHaveText('12.0 °C');await expect(page.locator('#summarySubtitle')).toContainText('could not refresh');fail=false;await page.getByRole('button',{name:'Refresh summary'}).click();await expect(page.locator('#summaryDataStatus')).toHaveText('Up to date');
});

test('summary narrative headings and measurement cards share consistent left edges',async({page})=>{
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});await page.goto('/summary.html');await expect(page.locator('#todayHigh')).toHaveText('12.0 °C');
  const edge=(await page.locator('.page-hero').boundingBox()).x;
  for(const heading of await page.locator('main>section .section-heading').all()){
   if(!await heading.isVisible())continue;
   for(const child of await heading.locator('h2,.section-eyebrow').all())expect(Math.abs((await child.boundingBox()).x-edge)).toBeLessThan(1);
  }
  expect(Math.abs((await page.locator('#dayStory').boundingBox()).x-edge)).toBeLessThan(1);
  const cards=page.locator('#summaryOverview .climate-card'),values=[];
  for(const card of await cards.all()){
   const label=await card.locator('span').boundingBox(),value=await card.locator('strong').boundingBox(),note=await card.locator('small').boundingBox(),box=await card.boundingBox();
   expect(Math.abs(label.x-value.x)).toBeLessThan(1);expect(Math.abs(label.x-note.x)).toBeLessThan(1);values.push({row:box.y,y:value.y});
  }
  for(const a of values)for(const b of values)if(Math.abs(a.row-b.row)<1)expect(Math.abs(a.y-b.y)).toBeLessThan(1);
  for(const detail of await page.locator('details.summary-details').all()){
   if(!await detail.isVisible())continue;await detail.locator('summary').first().click();
   const body=await detail.locator('.summary-detail-content').boundingBox();
   for(const heading of await detail.locator('.section-heading').all())expect(Math.abs((await heading.boundingBox()).x-body.x-parseFloat(await detail.locator('.summary-detail-content').evaluate(el=>getComputedStyle(el).paddingLeft)))).toBeLessThan(1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
