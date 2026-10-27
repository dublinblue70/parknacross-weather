import {test,expect} from '@playwright/test';
const now=Date.now(),start=Math.floor(now/3600000)*3600000;
let fail=false,dir=90,calm=false,missing=false,raining=false,dryForecast=false;
test.beforeEach(async({page})=>{
 fail=false;dir=90;calm=false;missing=false;raining=false;dryForecast=false;
 await page.route('**/*.workers.dev/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(fail&&(p==='/outdoor-outlook'||p==='/current'))return r.fulfill({status:503,body:'{}'});
  const data=p==='/outdoor-outlook'?{fetched_at:new Date(now).toISOString(),points:Array.from({length:6},(_,i)=>({epoch:start/1000+i*3600,rain_mm:missing&&i===0?null:!dryForecast&&i===2?.5:0}))}:p==='/current'?{epoch:now/1000,received_at:new Date(now).toISOString(),wind_speed_kmh:calm?0:12,wind_gust_kmh:18,wind_direction_deg:dir,rain_rate_mm_h:raining?.6:0}:{};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
});
test('rain timeline and coastal compass fit desktop and narrow mobile layouts',async({page})=>{
 test.setTimeout(90000);
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:1000});await page.goto('/index.html');
  await expect(page.locator('[data-rain-summary]')).toContainText('Rain forecast around',{timeout:15000});
  await expect(page.locator('[data-rain-slots] li')).toHaveCount(6);
  await expect(page.locator('[data-wind-summary]')).toHaveText('Onshore wind · from E');
  await expect(page.locator('[data-wind-arrow]')).toHaveAttribute('transform','rotate(270 90 90)');
  if(process.env.LOCAL_PLANNING_QA && [390,1280].includes(width))await page.locator('.local-planning').screenshot({path:`/workspace/scratch/172d7fde9241/planning-${width}.png`});
  for(const selector of ['[data-rain-outlook]','[data-coastal-compass]']){
   const bounds=await page.locator(selector).evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,overflow:e.scrollWidth>e.clientWidth}));
   expect(bounds.left).toBeGreaterThanOrEqual(0);expect(bounds.right).toBeLessThanOrEqual(width);expect(bounds.overflow).toBe(false);
  }
 }
});
test('rain refresh failure removes forecast and retry restores it; gaps stay honest',async({page})=>{
 await page.goto('/rain.html');await expect(page.locator('[data-rain-slots] li')).toHaveCount(6);
 fail=true;await page.getByRole('button',{name:'Refresh hourly rain outlook'}).click();await expect(page.locator('[data-rain-summary]')).toContainText('unavailable');await expect(page.locator('[data-rain-slots] li')).toHaveCount(0);
 fail=false;missing=true;await page.getByRole('button',{name:'Refresh hourly rain outlook'}).click();await expect(page.locator('[data-rain-slots] li').first()).toContainText('Unavailable');await expect(page.locator('[data-rain-context]')).toContainText('5 of 6');
});
test('coastal page shows offshore flow and calm hides the direction arrow',async({page})=>{
 dir=270;await page.goto('/coast.html');await expect(page.locator('[data-wind-summary]')).toHaveText('Offshore wind · from W');await expect(page.locator('[data-wind-arrow]')).toHaveAttribute('transform','rotate(90 90 90)');
 calm=true;await page.reload();await expect(page.locator('[data-wind-summary]')).toHaveText('Calm at the station');await expect(page.locator('[data-wind-arrow]')).toBeHidden();
});

test('current station rain overrides a zero-rain forecast on dashboard and rain page',async({page})=>{
 raining=true;dryForecast=true;
 for(const path of ['/index.html','/rain.html']){
  await page.goto(path);
  await expect(page.locator('[data-rain-summary]')).toHaveText('Rain detected at Parknacross now');
  await expect(page.locator('[data-rain-observed]')).toContainText('0.6 mm/h detected');
  await expect(page.locator('[data-rain-context]')).toContainText('forecast is missing the rain detected locally');
  await expect(page.locator('[data-rain-slots] li')).toHaveCount(6);
  await expect(page.locator('[data-rain-slots]')).toContainText('0.0 mm');
 }
 raining=false;await page.getByRole('button',{name:'Refresh hourly rain outlook'}).click();
 await expect(page.locator('[data-rain-summary]')).toContainText('local showers remain possible');
 await expect(page.locator('[data-rain-observed]')).toContainText('Light rain may not register');
});
