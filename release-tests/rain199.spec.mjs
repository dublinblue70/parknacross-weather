import {test,expect} from '@playwright/test';
const now=Math.floor(Date.now()/1000),day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'});
let current,fail;
test.beforeEach(async({page})=>{
 current={epoch:now,received_at:new Date(now*1000).toISOString(),rain_daily_mm:1.2,rain_rate_mm_h:0};fail=false;
 await page.route('**/*.workers.dev/**',r=>{const path=new URL(r.request().url()).pathname;if(fail)return r.fulfill({status:503,body:'{}'});let data={};if(path==='/current')data=current;if(path==='/rain-summary')data={today_mm:1.2,yesterday_mm:2,last_7_days_mm:3,month_mm:4,year_mm:5,consecutive_dry_days:0,current_event:{total_mm:1.2,started_at:new Date(now*1000-3600000).toISOString()}};if(path==='/daily')data={days:[{day,rain_mm:1.2}]};if(path==='/history')data={readings:[]};if(path==='/rain-events')data={event_count:0,events:[]};return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
});
test('live condition, update time and accessible daily totals are clear',async({page})=>{
 await page.goto('/rain.html');await expect(page.locator('#rainCondition')).toHaveText('No rain detected');await expect(page.locator('#rainEventText')).toContainText('Rain paused');await expect(page.locator('#rainUpdated')).toContainText('Irish time');await expect(page.locator('#rainToday')).toHaveText('1.2 mm');await expect(page.locator('.rain-details').first()).not.toHaveAttribute('open','');
 await page.getByText('View daily totals as a table',{exact:true}).click();await expect(page.locator('#rainDailyTable')).toContainText('1.2 mm');await expect(page.locator('#rainDailyTable')).toContainText('so far');
 current={...current,rain_rate_mm_h:2};await page.getByRole('button',{name:'Refresh rain data'}).click();await expect(page.locator('#rainCondition')).toHaveText('Rain detected');await expect(page.locator('#rainNow')).toHaveText('2.0 mm/h');
});
test('failed refresh clears previous results and retry recovers',async({page})=>{
 await page.goto('/rain.html');await expect(page.locator('#rainToday')).toHaveText('1.2 mm');fail=true;await page.getByRole('button',{name:'Refresh rain data'}).click();await expect(page.locator('#rainCondition')).toHaveText('Live rain unavailable');await expect(page.locator('#rainToday')).toHaveText('--');await expect(page.locator('#rainChartNote')).toContainText('temporarily unavailable');await expect(page.locator('#rainLoadStatus')).toContainText('unavailable');await expect(page.getByRole('button',{name:'Refresh rain data'})).toBeEnabled();fail=false;await page.getByRole('button',{name:'Refresh rain data'}).click();await expect(page.locator('#rainToday')).toHaveText('1.2 mm');
});
test('mobile overview stays compact without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/rain.html');await expect(page.locator('#rainCondition')).toHaveText('No rain detected');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const button=await page.locator('#rainRefresh').boundingBox();expect(button.height).toBeGreaterThanOrEqual(44);await page.getByText('Rainfall statistics & dry spells',{exact:true}).click();await expect(page.locator('#rainMonth')).toBeVisible();
});
