import {test,expect} from '@playwright/test';
const now=Date.parse('2026-10-24T09:00:00Z'),days=Array.from({length:30},(_,i)=>({day:new Date(now-(29-i)*86400000).toISOString().slice(0,10),high_c:i===0?0:14+i%6,low_c:i===0?-2:5+i%4,rain_mm:i%3}));
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date(now));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
 await page.route('**/*.workers.dev/**',r=>{const p=new URL(r.request().url()).pathname;const current={epoch:now/1000,received_at:new Date(now).toISOString(),temperature_c:10.5,wind_speed_kmh:3.6,wind_gust_kmh:9.4,rain_daily_mm:3,rain_rate_mm_h:1.8,pressure_hpa:996.5};let data={};
 if(p==='/daily')data={days};if(p==='/current')data=current;if(p==='/history')data={readings:[current]};if(p==='/stats')data={first_epoch:now/1000-30*86400,total_samples:5000};
 if(p==='/coverage')data={days:days.map((d,i)=>({...d,actual_slots:i===0?72:288,expected_slots:288,coverage_percent:i===0?25:100,coverage_scope:i===0?'since_first_observation':'full_day'})),summary:{coverage_percent:98}};
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
});
for(const width of [320,390,768,1280])test(`history tooltips fit and overview values align at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/history.html');
 await expect.poll(()=>page.evaluate(()=>window.Chart?.getChart('dailyTempChart')?.data.labels.length)).toBe(30);
 for(const id of ['dailyTempChart','dailyRainChart'])for(const index of [0,29]){
 const result=await page.evaluate(({id,index})=>{const c=Chart.getChart(id),active=c.data.datasets.map((_,datasetIndex)=>({datasetIndex,index}));c.setActiveElements(active);c.tooltip.setActiveElements(active,{x:c.scales.x.getPixelForValue(index),y:c.chartArea.top+30});c.update('none');return {left:c.tooltip.x,right:c.tooltip.x+c.tooltip.width,width:c.width,lines:c.tooltip.afterBody,rotation:c.scales.x.labelRotation,zero:c.data.datasets[0].data[0]};},{id,index});
 expect(result.left).toBeGreaterThanOrEqual(0);expect(result.right).toBeLessThanOrEqual(result.width);expect(result.lines.length).toBeGreaterThan(2);expect(result.rotation).toBe(0);
 if(index===0){expect(result.lines.join(' ')).toContain('incomplete');if(id==='dailyTempChart')expect(result.zero).toBe(0);}else expect(result.lines.join(' ')).toContain('not sensor accuracy');
 }
 await page.locator('#dailyTempChart').screenshot({path:info.outputPath('temperature-tooltip.png')});
 await page.goto('/index.html');await expect(page.locator('#heroRain')).toContainText('3.0');
 const cards=page.locator('.hero-stat');const windLabel=await cards.nth(0).locator('span').boundingBox(),rainLabel=await cards.nth(1).locator('span').boundingBox(),windValue=await cards.nth(0).locator('strong').boundingBox(),rainValue=await cards.nth(1).locator('strong').boundingBox();
 expect(Math.abs(windLabel.y-rainLabel.y)).toBeLessThan(1);expect(Math.abs(windValue.y-rainValue.y)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.hero-side').screenshot({path:info.outputPath('aligned-weather-cards.png')});
});
