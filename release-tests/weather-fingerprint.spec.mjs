import {test,expect} from '@playwright/test';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'}),year=Number(today.slice(0,4));
let rows,fail;
test.beforeEach(async({page})=>{
 fail=false;rows=[{day:`${year-1}-02-28`,high_c:8,rain_mm:12,peak_gust_kmh:50,solar_peak_w_m2:320},{day:today,high_c:15,rain_mm:0,peak_gust_kmh:0,solar_peak_w_m2:null}];
 await page.route('**/*.workers.dev/**',r=>{const daily=new URL(r.request().url()).pathname==='/daily';return r.fulfill({status:daily&&fail?503:200,contentType:'application/json',body:JSON.stringify(daily?{days:rows}:{})});});
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
});
test('mosaic preserves zero, missing and future dates; dates open the matching archive',async({page})=>{
 await page.goto('/climate.html#weatherFingerprint');
 await expect(page.locator('#fingerprintDate')).toContainText('so far');
 await expect(page.locator('#fingerprintValues')).toContainText('0 mm');
 await expect(page.locator('#fingerprintValues')).toContainText('0 km/h');
 await expect(page.locator('#fingerprintValues')).toContainText('Not recorded');
 await expect(page.locator('#fingerprintArchive')).toHaveAttribute('href',`history.html?day=${today}#dayDetailTitle`);
 await expect(page.locator('.fingerprint-row')).toHaveCount(13);
 expect(await page.locator('.fingerprint-day').count()).toBe(Math.round((Date.parse(today+'T12:00Z')-Date.UTC(year,0,1,12))/86400000)+1);
 await page.locator('#fingerprintYear').selectOption(String(year-1));
 await page.locator(`.fingerprint-day[data-day="${year-1}-02-28"]`).click();
 await expect(page.locator('#fingerprintValues')).toContainText('320 W/m²');
 await page.locator(`.fingerprint-day[data-day="${year-1}-02-28"]`).press('ArrowRight');
 await expect(page.locator('#fingerprintDayNote')).toHaveText('No station observations saved for this date.');
 await expect(page.locator('#fingerprintArchive')).toBeHidden();
});
test('year image downloads as a non-empty PNG',async({page})=>{
 await page.goto('/climate.html#weatherFingerprint');await expect(page.locator('#fingerprintDownload')).toBeEnabled();
 const downloadPromise=page.waitForEvent('download');await page.locator('#fingerprintDownload').click();const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe(`parknacross-weather-fingerprint-${year}.png`);
 const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);
 expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.length).toBeGreaterThan(10000);
});
test('mobile contains the mosaic scroll and exposes selected day details',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/climate.html#weatherFingerprint');
 await expect(page.locator('#fingerprintValues')).toContainText('15 °C');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 const region=page.locator('.fingerprint-scroll');expect(await region.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('fingerprint-mobile.png'),fullPage:true});
});
test('empty archive and unavailable archive show honest states',async({page})=>{
 rows=[];await page.goto('/climate.html#weatherFingerprint');await expect(page.locator('#fingerprintStatus')).toContainText('0 days with saved observations');await expect(page.locator('#fingerprintDownload')).toBeDisabled();
 fail=true;await page.reload();await expect(page.locator('#fingerprintStatus')).toContainText('could not be loaded');await expect(page.locator('#fingerprintYear')).toBeDisabled();
});
test('populated archive renders the desktop mosaic',async({page},testInfo)=>{
 rows=Array.from({length:210},(_,i)=>({day:new Date(Date.UTC(year,0,1+i,12)).toISOString().slice(0,10),high_c:5+(i%22),rain_mm:i%7===0?i%35:0,peak_gust_kmh:10+i%85,solar_peak_w_m2:100+i*13%900})).filter(r=>r.day<=today);
 await page.goto('/climate.html#weatherFingerprint');await expect(page.locator('#fingerprintDownload')).toBeEnabled();await page.locator('#weatherFingerprint').screenshot({path:testInfo.outputPath('fingerprint-desktop.png')});
});

for(const width of [390,1280])test(`all month rows keep equal spacing at ${width}px, including future months`,async({page},testInfo)=>{
 await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
 await page.setViewportSize({width,height:900});
 rows=[{day:'2026-10-20',high_c:15,rain_mm:0,peak_gust_kmh:13.3,solar_peak_w_m2:6}];
 await page.goto('/climate.html#weatherFingerprint');
 await expect(page.locator('#fingerprintStatus')).toContainText('2026 · 1 day');
 const boxes=await page.locator('.fingerprint-row:not(.fingerprint-numbers)').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {height:r.height,top:r.top};}));
 expect(boxes).toHaveLength(12);
 const gaps=boxes.slice(1).map((box,i)=>box.top-boxes[i].top);
 expect(Math.max(...gaps)-Math.min(...gaps)).toBeLessThan(1);
 expect(Math.max(...boxes.map(b=>b.height))-Math.min(...boxes.map(b=>b.height))).toBeLessThan(1);
 await page.locator('#weatherFingerprint').screenshot({path:testInfo.outputPath('even-month-spacing.png')});
});
