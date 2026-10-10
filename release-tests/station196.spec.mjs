import {test,expect} from '@playwright/test';
let currentAge=0;
test.beforeEach(async({page})=>{
 currentAge=0;
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/*.workers.dev/**',r=>{const path=new URL(r.request().url()).pathname;let data={};
 if(path==='/current')data={epoch:Math.floor(Date.now()/1000)-currentAge,received_at:new Date().toISOString(),battery_v:3.28,temperature_c:12};
 if(path==='/stats')data={first_epoch:Date.parse('2026-09-10T23:30:00Z')/1000};
 if(path==='/quality')data={feed_status:'Live',samples_last_24h:288,median_interval_minutes:5};
 if(path==='/reliability')data={archive_reliability_percent:95,actual_samples:2736,expected_samples:2880};
 if(path==='/storage-stats')return r.abort();
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
});
test('freshness uses observation time and remains independent of optional storage failures',async({page})=>{
 currentAge=720;await page.goto('/station.html');await expect(page.locator('#stationFeed')).toHaveText('Delayed');await expect(page.locator('#qualityFeed')).toHaveText('Delayed');await expect(page.locator('#stationStarted')).toHaveText('11 September 2026');
 currentAge=1900;await page.evaluate(()=>loadStationStatus());await expect(page.locator('#stationFeed')).toHaveText('Stale');await expect(page.locator('#qualityFeed')).toHaveText('Stale');
 currentAge=0;await page.evaluate(()=>loadStationStatus());await expect(page.locator('#stationFeed')).toHaveText('Live');await expect(page.locator('#qualityFeed')).toHaveText('Live');
 await page.route('**/current',r=>r.abort());await page.evaluate(()=>loadStationStatus());await expect(page.locator('#stationFeed')).toHaveText('Unavailable');await expect(page.locator('#qualityFeed')).toHaveText('Unavailable');await expect(page.locator('#qualityReliability')).toHaveText('95.0%');
});
test('sensor explanations work with hover, keyboard and tap; dated log previews use recorded entries',async({page})=>{
 await page.goto('/station.html');await page.locator('[data-sensor=lightning]').hover();await expect(page.locator('#stationSensorTitle')).toHaveText('Nearby lightning detector');await expect(page.locator('#stationSensorLink')).toHaveAttribute('href','graphs.html#lightning');
 await page.locator('[data-sensor=soil]').focus();await expect(page.locator('#stationSensorCopy')).toContainText('rather than every pot');await expect(page.locator('[data-sensor=soil]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-sensor=gateway]').click();await expect(page.locator('#stationSensorCopy')).toContainText('barometric-pressure');await expect(page.locator('#stationSensorLink')).toHaveAttribute('href','status.html');
 await expect(page.locator('#stationMaintenancePreview article')).toHaveCount(3);await expect(page.locator('#stationMaintenancePreview time').first()).toHaveAttribute('datetime','2026-10-08');await expect(page.locator('#understandingReadings')).toContainText('not a direct measure of plant nutrition');
 await expect(page.locator('#stationTechnical')).not.toHaveAttribute('open','');await page.locator('#stationTechnical > summary').click();await expect(page.locator('#d1StoragePercent')).toHaveText('Storage status unavailable');
});
test.describe('mobile station page',()=>{test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});test('sensor controls are usable without horizontal overflow and notification links still work',async({page})=>{
 await page.goto('/station.html');await page.locator('[data-sensor=soil]').tap();await expect(page.locator('#stationSensorTitle')).toHaveText('Garden soil sensor');
 for(const button of await page.locator('[data-sensor]').all()){const b=await button.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.station-jumps a[href="#alertsHeading"]').click();await expect(page).toHaveURL(/#alertsHeading$/);await expect(page.locator('#alertsEnableButton')).toBeVisible();await expect(page.locator('#alertsEnableButton')).toBeEnabled();
});});
