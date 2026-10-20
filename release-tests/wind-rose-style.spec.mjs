import {test,expect} from '@playwright/test';
const end=Math.floor(Date.now()/1000/300)*300;
const rows=Array.from({length:100},(_,i)=>({epoch:end-(100-i)*300,received_at:new Date((end-(100-i)*300)*1000).toISOString(),wind_speed_kmh:i<69?0:i<84?8:30,wind_direction_deg:i<84?45:225,wind_gust_kmh:35,temperature_c:12,dew_point_c:8,humidity_pct:75,pressure_hpa:1010,solar_w_m2:20,uv_index:0,rain_rate_mm_h:0,rain_daily_mm:0}));
test.beforeEach(async({page})=>{
 await page.route('**/*.workers.dev/**',r=>{const p=new URL(r.request().url()).pathname;let data={};if(p==='/history')data={readings:rows};if(p==='/current')data={...rows.at(-1),epoch:Math.floor(Date.now()/1000),received_at:new Date().toISOString()};if(p==='/daily')data={days:[]};if(p==='/met/warnings')data={warnings:[]};return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
});
for(const [file,id,width] of [['graphs.html','gWindRose',390],['index.html','windRose',1280]])test(`${file} has speed spokes and a calm centre at ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/'+file);
 await expect.poll(()=>page.evaluate(id=>Boolean(window.Chart?.getChart(document.getElementById(id))),id)).toBe(true);
 const result=await page.evaluate(({id,rows,end})=>{
  const c=Chart.getChart(document.getElementById(id));const result=ParknacrossWindRose.update(c,rows,null,{endEpoch:end,hours:24});
  const arcs=c.getDatasetMeta(0).data;return {calm:result.calm,total:result.intervalCount,means:result.meanSpeeds,colours:c.data.datasets[0].backgroundColor,angles:arcs.map(a=>[a.startAngle,a.endAngle,a.innerRadius,a.outerRadius]),counts:result.bins};
 },{id,rows,end});
 expect(result.calm).toBe(69);expect(result.total).toBe(100);expect(result.means[2]).toBe(8);expect(result.means[10]).toBe(30);expect(result.colours[2]).toBe('#3f8cff');expect(result.colours[10]).toBe('#ffd052');
 expect((result.angles[2][0]+result.angles[2][1])/2).toBeCloseTo(-Math.PI/4);expect(result.angles[2][3]).toBeGreaterThan(result.angles[2][2]);
 await expect(page.locator('#'+id)).toHaveAttribute('aria-label',/69.0% calm/);await expect(page.locator('.wind-rose-legend')).toContainText('km/h');await expect(page.locator('.wind-rose-explanation')).toContainText('average speed');
 const card=page.locator('#'+id).locator('xpath=ancestor::article[1]');await card.screenshot({path:testInfo.outputPath('wind-rose.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(errors).toEqual([]);
});
test('all calm and missing observations have separate states; duplicate slots do not inflate counts',async({page})=>{
 await page.goto('/graphs.html');await expect.poll(()=>page.evaluate(()=>Boolean(window.Chart?.getChart(document.getElementById('gWindRose'))))).toBe(true);
 const result=await page.evaluate(({rows,end})=>{
  const c=Chart.getChart(document.getElementById('gWindRose')),calmRows=rows.map(r=>({...r,wind_speed_kmh:0}));
  const calm=ParknacrossWindRose.update(c,calmRows,null,{endEpoch:end,hours:24}),calmLabel=c.canvas.getAttribute('aria-label');
  const empty=ParknacrossWindRose.update(c,[],null,{endEpoch:end,hours:24}),emptyLabel=c.canvas.getAttribute('aria-label');
  const duplicate=ParknacrossWindRose.distribution([...rows,...rows.slice().reverse()],{endEpoch:end,hours:24});
  return {calm,calmLabel,empty,emptyLabel,duplicate};
 },{rows,end});
 expect(result.calm.calm).toBe(100);expect(result.calm.directional).toBe(0);expect(result.calmLabel).toContain('100.0% calm');expect(result.emptyLabel).toContain('no usable observations');expect(result.empty.intervalCount).toBe(0);expect(result.duplicate.intervalCount).toBe(100);
});
