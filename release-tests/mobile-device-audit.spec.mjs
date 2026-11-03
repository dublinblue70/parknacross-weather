import {test,expect} from '@playwright/test';

// Browser emulation checks touch-size layouts in Chromium and WebKit.
// It does not substitute for testing the Android/iOS operating systems.
test.use({hasTouch:true,isMobile:true});
const noTelemetry=async page=>{
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
};
const mockWeather=async page=>{
 await noTelemetry(page);
 await page.route('**/*.workers.dev/**',route=>{
  const url=new URL(route.request().url()),now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  let data={};
  if(url.pathname==='/current')data={epoch:Math.floor(now/1000),received_at:new Date(now).toISOString(),temperature_c:12,rain_daily_mm:0,rain_rate_mm_h:0};
  if(url.pathname==='/daily')data={days:Array.from({length:150},(_,i)=>{
   const stamp=new Date(Date.UTC(new Date().getUTCFullYear(),0,1+i,12));
   return {day:stamp.toISOString().slice(0,10),high_c:5+i%22,low_c:1+i%10,rain_mm:i%6===0?3.5:0,peak_gust_kmh:15+i%60,solar_peak_w_m2:180+i%600};
  })};
  if(url.pathname==='/history')data={readings:Array.from({length:36},(_,i)=>({epoch:Math.floor(now/1000)-(35-i)*300,temperature_c:10+i%9,rain_rate_mm_h:0,wind_speed_kmh:6,wind_gust_kmh:11}))};
  if(url.pathname==='/sky-photo/history/dates')data={month:'2026-10',days:[{day:'2026-10-26',count:2}]};
  if(url.pathname==='/sky-photo/history')data={day:'2026-10-26',photo:{photo_id:'later',caption:'Later view'},photos:[{photo_id:'earlier',caption:'Earlier view',captured_at:'2026-10-26T10:00:00Z'},{photo_id:'later',caption:'Later view',captured_at:'2026-10-26T11:00:00Z'}]};
  if(url.pathname==='/sky-photo/history/image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="skyblue"/></svg>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
};
test('collapsed mobile forecast shows three compact periods before expanded details',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockWeather(page);
 await page.goto('/index.html');
 const forecast=page.locator('#forecast'),toggle=forecast.locator('.mobile-detail-toggle');
 await expect(toggle).toBeVisible();
 if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
 const preview=forecast.locator('.forecast-mobile-preview');
 await expect(preview).toBeVisible();
 await expect(preview.locator('p')).toHaveCount(3);
 for(const label of ['Today','Tonight','Tomorrow'])await expect(preview).toContainText(label);
 await toggle.click();
 await expect(preview).toBeHidden();
 await expect(forecast.locator('.forecast-grid article').first()).toBeVisible();
 await noOverflow(page,'mobile forecast');
});

const setScaledFont=async page=>page.addStyleTag({content:'html{font-size:20px!important}'}); // representative 125% rem scaling
const noOverflow=async(page,label)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),label).toBe(true);

for(const width of [320,390]){
 test('sun, moon and season markers remain readable at 125% text and '+width+'px',async({page},info)=>{
  await page.setViewportSize({width,height:900});await mockWeather(page);
  await page.goto('/index.html');
  const section=page.locator('.astronomy-strip');await expect(section).toHaveCount(1);
  const toggle=section.locator('.mobile-detail-toggle').first();
  await expect(toggle).toBeVisible();
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  await expect(section.locator('.moon-phase-track li').first()).toBeVisible();
  await setScaledFont(page);
  const metrics=await section.evaluate(el=>{
   const moon=el.querySelector('.moon-phase-track'),items=[...moon.querySelectorAll('li')],season=el.querySelector('.season-markers');
   const cols=getComputedStyle(moon).gridTemplateColumns.split(' ').length;
   return {cols,font:parseFloat(getComputedStyle(items[0]).fontSize),
    seasonCols:season?getComputedStyle(season).gridTemplateColumns.split(' ').length:0,
    moonRowHeights:items.map(x=>Math.round(x.getBoundingClientRect().height))};
  });
  expect(metrics.cols).toBe(4);
  expect(metrics.font).toBeGreaterThanOrEqual(14);
  expect(metrics.seasonCols).toBe(2);
  await noOverflow(page,'astronomy '+width);
  await section.screenshot({path:info.outputPath('astronomy-'+width+'-scaled.png')});
 });
}

test('Climate fingerprint stays contained and explorable at 125% phone text',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await mockWeather(page);
 await page.goto('/climate.html#weatherFingerprint');
 await expect(page.locator('.fingerprint-day').first()).toBeVisible();
 await setScaledFont(page);
 const region=page.locator('.fingerprint-scroll');
 const metrics=await region.evaluate(el=>{
  const row=el.querySelector('.fingerprint-row'),month=el.querySelector('.fingerprint-month');
  return {scrollable:el.scrollWidth>el.clientWidth,gridMin:el.querySelector('.fingerprint-grid').getBoundingClientRect().width,
   labelSize:parseFloat(getComputedStyle(month).fontSize),rowHeight:row.getBoundingClientRect().height};
 });
 expect(metrics.scrollable).toBe(true);
 expect(metrics.labelSize).toBeGreaterThanOrEqual(15);
 expect(metrics.rowHeight).toBeGreaterThanOrEqual(30);
 await noOverflow(page,'fingerprint scaled');
 await page.locator('#weatherFingerprint').screenshot({path:info.outputPath('fingerprint-phone-scaled.png')});
});

test('dense history chart fits phone text scaling without page overflow',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await mockWeather(page);
 await page.goto('/history.html');await expect(page.locator('#dailyTempChart')).toBeVisible();
 await setScaledFont(page);
 await noOverflow(page,'history charts at 125%');
 const canvas=page.locator('#dailyTempChart');
 const size=await canvas.boundingBox();expect(size.width).toBeGreaterThan(250);
 await canvas.screenshot({path:info.outputPath('history-temperature-phone-scaled.png')});
});

test('photo archive changes captions and remains usable on touch-sized screens',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await mockWeather(page);
 await page.goto('/sky.html?day=2026-10-26');
 await expect(page.locator('#publicPhotoCaption')).toContainText('Later view');
 await page.getByRole('button',{name:'← Previous photo',exact:true}).click();
 await expect(page.locator('#publicPhotoCaption')).toContainText('Earlier view');
 await expect(page.locator('#publicPhotoStatus')).toContainText('Photograph 1 of 2');
 await noOverflow(page,'photo viewer');
 await page.locator('.public-photo-viewer').screenshot({path:info.outputPath('photo-viewer-touch.png')});
});

test('device notification choices survive a mobile page reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockWeather(page);
 await page.goto('/station.html');
 const rain=page.locator('#alertRainStart'),gust=page.locator('#alertGust');
 await expect(rain).toBeVisible();
 await rain.check();await gust.check();
 await expect(rain).toBeChecked();await expect(gust).toBeChecked();
 await page.reload();
 await expect(page.locator('#alertRainStart')).toBeChecked();
 await expect(page.locator('#alertGust')).toBeChecked();
 await noOverflow(page,'notification settings');
});

test('radar frame controls and satellite fallback behave in touch browser',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await noTelemetry(page);
 await page.route('**/leaflet.js',r=>r.fulfill({contentType:'application/javascript',body:`window.L={map:()=>({setView(){return this},getZoom(){return 7},removeLayer(){return this}}),tileLayer:()=>({addTo(){return this}}),circleMarker:()=>({addTo(){return this},bindTooltip(){return this}})};`}));
 await page.route('**/leaflet.css',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.route('**/api.rainviewer.com/public/weather-maps.json',r=>{
  const n=Math.floor(Date.now()/1000);
  return r.fulfill({contentType:'application/json',body:JSON.stringify({host:'https://tiles.example.invalid',radar:{past:[{time:n-600,path:'/radar-first'},{time:n-300,path:'/radar-last'}]}})});
 });
 await page.route('**/*.workers.dev/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await page.route('**/www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Embedded stream test</title><p>Player fixture</p>'}));
 await page.goto('/radar.html');
 const player=page.locator('#radarPlay');
 await expect(player).toBeEnabled();
 await player.click();await expect(player).toHaveText('Pause');
 await page.locator('#radarSlider').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(player).toHaveText('Play');
 await expect(page.locator('#radarTime')).not.toContainText('Loading');
 const frame=page.locator('[data-satellite-stream]');
 await frame.scrollIntoViewIfNeeded();await expect(frame).toHaveAttribute('src',/nigtvuOspmM/);
 await expect(page.locator('[data-satellite-direct]')).toHaveAttribute('href',/youtube\.com\/watch\?v=nigtvuOspmM/);
 await noOverflow(page,'radar and satellite');
 await page.screenshot({path:info.outputPath('radar-and-satellite-phone.png'),fullPage:true});
});
