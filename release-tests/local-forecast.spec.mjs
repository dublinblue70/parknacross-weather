import {test,expect} from '@playwright/test';
const now=Date.parse('2026-10-21T08:30:00Z');let fail,stale;
test.beforeEach(async({page})=>{
 fail=false;stale=false;await page.clock.setFixedTime(new Date(now));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
 await page.route('**/*.workers.dev/**',r=>{
  const path=new URL(r.request().url()).pathname;if(path==='/outdoor-outlook'&&fail)return r.fulfill({status:503,body:'{}'});
  const current={epoch:now/1000,received_at:new Date(now).toISOString(),temperature_c:8,wind_speed_kmh:4,wind_direction_deg:90,humidity_pct:80,pressure_hpa:1010,rain_rate_mm_h:0,rain_daily_mm:0};
  const feed={fetched_at:new Date(now-(stale?3*3600000:0)).toISOString(),points:Array.from({length:25},(_,i)=>({epoch:Date.parse('2026-10-21T09:00:00Z')/1000+i*3600,temperature_c:i<9?10:6,wind_kmh:i<9?30:8,rain_mm:i<9?0:0.2,daylight:i<9}))};
  const data=path==='/outdoor-outlook'?feed:path==='/current'?current:path==='/history'?{readings:[current]}:path==='/met/forecast'?{region:'Leinster',today:'NATIONAL TEXT MUST STAY OUT OF THE LOCAL PANEL',tonight:'National tonight.',tomorrow:'National tomorrow.'}:path==='/met/warnings'?{warnings:[]}:{};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
});
for(const width of [390,1280])test(`Ardamine forecast replaces broad text at ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await page.goto('/index.html#forecast');
 const toggle=page.locator('#forecast>.mobile-detail-toggle');if(await toggle.count()&&await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
 await expect(page.locator('#forecastToday')).toContainText('Temperature: 10 °C');await expect(page.locator('#forecastToday')).toContainText('Wind: 30 km/h');
 await expect(page.locator('#forecastTomorrowLabel')).toContainText('Tomorrow morning');await expect(page.locator('#forecastTomorrowCoverage')).toContainText('22 Oct');
 await expect(page.locator('#forecast')).not.toContainText('NATIONAL TEXT');await expect(page.locator('#forecast h2')).toHaveText('Ardamine forecast · Co. Wexford');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.locator('#forecast').screenshot({path:testInfo.outputPath('local-forecast.png')});
});
test('local forecast fails clearly instead of substituting national text',async({page})=>{
 fail=true;await page.goto('/index.html');await expect(page.locator('#forecastToday')).toContainText('Local hourly forecast temporarily unavailable');await expect(page.locator('#forecast')).not.toContainText('NATIONAL TEXT');
 fail=false;stale=true;await page.reload();await expect(page.locator('#forecastFreshness')).toContainText('could not be verified');
});
