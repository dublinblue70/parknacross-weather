import {test,expect} from '@playwright/test';

const publicPages = [
 'index.html','summary.html','radar.html','graphs.html','rain.html',
 'history.html','climate.html','coast.html','sky.html','records.html',
 'monthly.html','annual.html','downloads.html','station.html',
 'status.html','maintenance.html','install.html','privacy.html',
 'ardamine-weather.html','courtown-weather.html',
 'north-wexford-weather.html','north-wexford-coastal-weather.html'
];

test.beforeEach(async({page})=>{
 await page.route('**/*.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
 await page.route('**/static.cloudflareinsights.com/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
 await page.route('**/api.rainviewer.com/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
});

test('22 public pages have readable headings and no viewport overflow on mobile',async({page})=>{
 test.setTimeout(150000);
 await page.setViewportSize({width:390,height:844});
 for(const path of publicPages){
  await page.goto('/'+path,{waitUntil:'domcontentloaded'});
  const heading=page.locator('h1').first();
  await expect(heading,path+' includes its primary heading').not.toBeEmpty();
  if(path!=='index.html')await expect(heading,path+' shows its primary heading').toBeVisible();
  const state=await page.evaluate(()=>{
   const hero=document.querySelector('.page-hero h1');
   const bodyFont=Number.parseFloat(getComputedStyle(document.body).fontSize);
   return {scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,bodyFont,
    heroSize:hero?Number.parseFloat(getComputedStyle(hero).fontSize):null};
  });
  expect(state.scrollWidth,path+' must not force horizontal scrolling').toBeLessThanOrEqual(state.viewport+2);
  expect(state.bodyFont,path+' has readable body type').toBeGreaterThanOrEqual(15);
  if(state.heroSize!==null)expect(state.heroSize,path+' has a legible page title').toBeGreaterThanOrEqual(27);
 }
});

test('major pages stay within the viewport on desktop',async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:1280,height:900});
 for(const path of ['index.html','graphs.html','rain.html','history.html','station.html','status.html','sky.html','downloads.html']){
  await page.goto('/'+path,{waitUntil:'domcontentloaded'});
  const state=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(state.scrollWidth,path+' must not overflow at laptop widths').toBeLessThanOrEqual(state.viewport+2);
 }
});
