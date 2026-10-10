import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const releaseVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const now=Math.floor(Date.now()/1000),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),month=day.slice(0,7);
const current={epoch:now,received_at:new Date(now*1000).toISOString(),temperature_c:12,humidity_pct:70,dew_point_c:7,wind_speed_kmh:8,wind_gust_kmh:13,wind_direction_deg:90,pressure_hpa:1017,daily_rain_mm:0,rain_rate_mm_h:0,solar_w_m2:100,uv_index:1,soil_moisture_pct:36,soil_temperature_c:10.4,soil_ec_us_cm:150};
const readings=Array.from({length:13},(_,i)=>({...current,epoch:now-(12-i)*300,received_at:new Date((now-(12-i)*300)*1000).toISOString(),temperature_c:10+i/6}));const summary={day,high_c:12,low_c:10,rain_mm:0,peak_gust_kmh:13,sample_count:13};
async function fixtures(page){await page.route('**/*.workers.dev/**',async route=>{const url=new URL(route.request().url()),p=url.pathname;let data={};if(p==='/current')data=current;else if(p==='/history')data={readings};else if(p==='/daily')data={days:[summary]};else if(p==='/day')data={available:true,summary,readings};else if(p==='/met/forecast')data={today:'Sunny spells.',tonight:'Dry.',tomorrow:'Cloudy.'};else if(p==='/met/warnings')data={warnings:[]};else if(p==='/sky-photo/history/dates')data={month:url.searchParams.get('month'),days:url.searchParams.get('month')===month?[{day,count:1}]:[]};else if(p==='/sky-photo/history')data={day:url.searchParams.get('day'),photo:{photo_id:'test-photo',caption:'Blue Ardamine sky'}};else if(p.endsWith('/image'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64')});else if(p==='/sky-photo/meta')data={available:false};else if(p==='/admin/capabilities')data={worker_version:'38.4.91',features:{rain_override:true,photo_calendar:true,social_history:true,history_photos:true,export_preview:true,history_range:true,public_photo_calendar:true}};else if(p==='/social-history')data={items:[]};else if(p==='/sky-photo/archive/dates')data={month,days:[]};else if(p==='/sky-photo/archive/admin')data={items:[],total:0};else if(p==='/social-dashboard')data={day,checked_at:new Date().toISOString(),networks:{}};else if(p==='/social-preview-today')data={observation:current,facebookText:'Weather preview',xText:'Weather preview'};else if(p==='/coverage')data={days:[],summary:{}};await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));}
const pageErrors=new WeakMap();test.beforeEach(async({page})=>{pageErrors.set(page,[]);page.on('pageerror',error=>pageErrors.get(page).push(error.message));await fixtures(page);});test.afterEach(async({page})=>{expect(pageErrors.get(page)).toEqual([]);});
test('dashboard preferences persist, reorder and reset without hiding current weather',async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/index.html');await expect(page.locator('#heroTemp')).toHaveText(/12/);await page.getByText('Customise your dashboard',{exact:true}).click();const box=page.locator('.dashboard-preference-list label').filter({hasText:'Clothing guide'}).locator('input');await box.uncheck();await expect(page.locator('.wear-today-section')).toBeHidden();await page.getByRole('button',{name:'Move Clothing guide up',exact:true}).click();await page.reload();await expect(page.locator('.wear-today-section')).toBeHidden();await page.getByText('Customise your dashboard',{exact:true}).click();await page.getByRole('button',{name:'Reset dashboard layout'}).click();await expect(page.locator('.wear-today-section')).toBeVisible();await expect(page.locator('.hero-main-card')).toBeVisible();expect(errors).toEqual([]);});
test('graph cursor, zoom and reset preserve readings and use the same time window',async({page})=>{await page.goto('/graphs.html');await expect(page.locator('#highlightTemp')).not.toHaveText('Loading…');await page.getByRole('slider',{name:'Inspect time across weather graphs'}).fill('800');await expect(page.locator('#chartCursorValues')).toContainText('Temperature');const full=await page.evaluate(()=>{const c=Chart.getChart(document.getElementById('gTemp'));return{min:c.scales.x.min,max:c.scales.x.max};});await page.getByText('Advanced zoom options',{exact:true}).click();await page.getByRole('button',{name:'Select period to zoom'}).click();const canvas=page.locator('#gTemp');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.4,{steps:10});await page.mouse.up();await expect(page.locator('#resetChartZoom')).toBeEnabled();const zoom=await page.evaluate(()=>['gTemp','gWind','gPressure','gRain'].map(id=>{const c=Chart.getChart(document.getElementById(id));return{min:c.scales.x.min,max:c.scales.x.max,count:c.data.datasets[0].data.length};}));expect(zoom[0].max-zoom[0].min).toBeLessThan(full.max-full.min);expect(zoom.every(x=>x.min===zoom[0].min&&x.max===zoom[0].max&&x.count>0)).toBe(true);await page.getByRole('button',{name:'Reset graph zoom'}).click();await expect(page.locator('#resetChartZoom')).toBeDisabled();expect(await page.evaluate(()=>Chart.getChart(document.getElementById('gTemp')).scales.x.max)).toBe(full.max);});
test('historical day URL opens its readings and photo, with a shareable date',async({page})=>{await page.goto('/history.html?day='+day);await expect(page.locator('#dayHigh')).toHaveText('12.0 °C');await expect(page.locator('#historicalSkyCaption')).toHaveText('Blue Ardamine sky');await expect(page.locator('#historicalSkyImage')).toBeVisible();expect(await page.locator('#historicalSkyImage').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);await expect(page.locator('#shareArchiveDay')).toBeEnabled();await expect(page).toHaveURL(new RegExp('day='+day));});
test('visitor photo calendar selects saved photos and links to the same weather date',async({page})=>{await page.goto('/sky.html');const cell=page.locator('#publicPhotoCalendar button[data-day="'+day+'"]');await expect(cell).toBeEnabled();await cell.click();await expect(page.locator('#publicPhotoCaption')).toHaveText('Blue Ardamine sky');await expect(page.locator('#publicPhotoViewer')).toBeVisible();await expect(page.locator('#publicArchivePhoto')).toBeVisible();await expect(page.locator('#publicPhotoWeatherLink')).toHaveAttribute('href','history.html?day='+day+'#dayDetailTitle');await page.getByRole('button',{name:'Close photo',exact:true}).click();await expect(page.locator('#publicPhotoViewer')).toBeHidden();await page.getByRole('button',{name:'← Previous month'}).click();await expect(page.locator('#publicPhotoCalendarNote')).toHaveText('No sky photographs saved this month.');await expect(page.locator('#publicArchivePhoto')).toBeHidden();});
test('offline mode shows actual saved date and values, then recovers when the feed returns',async({page})=>{await page.goto('/index.html');await expect(page.locator('#heroTemp')).toHaveText(/12/);await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await expect(page.locator('#parknacrossOfflineBanner')).toContainText('Saved readings from');await expect(page.locator('#parknacrossOfflineBanner')).toContainText('Temperature 12.0°C');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('#parknacrossOfflineBanner')).toBeHidden();});
test('admin refresh displays progress and restores controls after a failed request',async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('parknacrossAdminKey','test-only'));await page.goto('/admin.html');await expect(page.locator('#adminCompatibility')).toContainText('Checked at');await page.route('**/admin/capabilities',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporarily unavailable"}'});});await page.getByRole('button',{name:'Check compatibility',exact:true}).click();await expect(page.getByRole('button',{name:'Checking…',exact:true})).toBeDisabled();await expect(page.locator('#adminCompatibility')).toContainText('check failed');await expect(page.getByRole('button',{name:'Check compatibility',exact:true})).toBeEnabled();});

test('mobile calendar opens the image in view and recovers from an image failure',async({page})=>{
 await page.setViewportSize({width:390,height:844});let attempts=0;
 await page.route('**/sky-photo/history/image?**',r=>{if(++attempts===1)return r.fulfill({status:503,body:'Unavailable'});return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64')});});
 await page.goto('/sky.html');await page.locator('#publicPhotoCalendar button[data-day="'+day+'"]').click();
 await expect(page.locator('#publicPhotoViewer')).toBeVisible();await expect(page.locator('#publicPhotoStatus')).toContainText('could not be displayed');
 await page.getByRole('button',{name:'Retry this photograph'}).click();await expect(page.locator('#publicArchivePhoto')).toBeVisible();
 const box=await page.locator('#publicArchivePhoto').boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(844);
 await page.keyboard.press('Escape');await expect(page.locator('#publicPhotoViewer')).toBeHidden();
});
test('short pressure graph has spaced mobile labels and a readable pressure range after zoom',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/graphs.html');await expect(page.locator('#highlightTemp')).not.toHaveText('Loading…');
 await page.evaluate(()=>{const c=Chart.getChart(document.getElementById('gPressure'));const start=c.data.datasets[0].data[0].x;c.data.datasets[0].data=[{x:start,y:1016.3},{x:start+60000,y:1016},{x:start+120000,y:1016.3},{x:start+180000,y:1016.2}];ParknacrossChartExplorer.zoom(start,start+30*60000);});
 const axes=await page.evaluate(()=>{const c=Chart.getChart(document.getElementById('gPressure'));return{span:c.scales.y.max-c.scales.y.min,labels:c.scales.x.ticks.map(t=>t.label),positions:c.scales.x.ticks.map(t=>c.scales.x.getPixelForValue(t.value))};});
 expect(axes.span).toBeGreaterThanOrEqual(2);expect(axes.labels.length).toBeLessThanOrEqual(3);expect(axes.labels.every(x=>typeof x==='string'&&/^\d{2}:\d{2}$/.test(x))).toBe(true);
 expect(axes.positions.slice(1).every((x,i)=>x-axes.positions[i]>100)).toBe(true);
});

test('zoom keeps gust segments at the edges inside the vertical scale without bridging missing readings',async({page})=>{
 await page.goto('/graphs.html');await expect(page.locator('#highlightTemp')).not.toHaveText('Loading…');
 const result=await page.evaluate(()=>{
  const c=Chart.getChart(document.getElementById('gWind')),start=c.data.datasets[0].data[0].x,step=300000;
  const gusts=[{x:start,y:18},{x:start+step,y:4},{x:start+2*step,y:8},{x:start+3*step,y:5},{x:start+4*step,y:20}];
  c.data.datasets[0].data=gusts.map(p=>({...p,y:2}));c.data.datasets[1].data=gusts;
  ParknacrossChartExplorer.zoom(start+step*.5,start+step*3.5);
  const maximum=c.scales.y.max;c.data.datasets[1].data[2].y=null;c.update('none');
  return{maximum,min:c.scales.y.min,gap:c.data.datasets[1].data[2].y,spanGaps:c.data.datasets[1].spanGaps,count:c.data.datasets[1].data.length};
 });
 expect(result.maximum).toBeGreaterThan(20);expect(result.min).toBe(0);expect(result.gap).toBeNull();expect(result.spanGaps).toBe(false);expect(result.count).toBe(5);
 await page.getByRole('button',{name:'Reset graph zoom'}).click();await expect(page.locator('#resetChartZoom')).toBeDisabled();
});

test('mobile admin accepts a valid key when browser session storage is blocked',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
 let authenticated=false;await page.route('**/admin/capabilities',async r=>{authenticated=r.request().headers()['x-parknacross-admin-key']==='test-only';return r.fulfill({status:authenticated?200:401,contentType:'application/json',body:JSON.stringify({worker_version:'38.4.91',features:{rain_override:true,photo_calendar:true}})});});
 await page.goto('/admin.html');await page.getByLabel('Admin key',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('#adminWorkspace')).toBeVisible();expect(authenticated).toBe(true);await expect(page.locator('#adminMessage')).toContainText('Signed in.');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#adminLogin')).toBeVisible();
});
test('mobile live readings load even if the graph library cannot be downloaded',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.route('**/chart.umd.min.js*',r=>r.fulfill({status:503,body:''}));
 await page.goto('/index.html');await expect(page.locator('#heroTemp')).toHaveText(/12/);await expect(page.locator('#conditionsTag')).not.toHaveText('Loading…');
});

test('mobile admin login starts even when external admin-controller downloads are blocked',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.route('**/admin-tools.js*',r=>r.abort());
 await page.goto('/admin.html');await expect(page.locator('#adminRelease')).toHaveText('Admin version '+releaseVersion);
 await page.getByLabel('Admin key',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#adminWorkspace')).toBeVisible();await expect(page.locator('#adminMessage')).toContainText('Signed in.');
});

test('history photograph recovers after image failure without changing the selected date',async({page})=>{
 let attempts=0;await page.route('**/sky-photo/history/image?**',route=>++attempts===1?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64')}));
 await page.goto('/history.html?day='+day);await expect(page.locator('#historicalSkyRetry')).toBeVisible();await expect(page.locator('#historicalSkyImage')).toBeHidden();await page.locator('#historicalSkyRetry').click();await expect(page.locator('#historicalSkyImage')).toBeVisible();await expect(page.locator('#historicalSkyRetry')).toBeHidden();await expect(page).toHaveURL(new RegExp('day='+day));
});
test('dashboard warning failure is visible and points to official advice',async({page})=>{await page.route('**/met/warnings',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));await page.goto('/index.html');await expect(page.locator('#warningTitle')).toHaveText('Official weather warnings unavailable');await expect(page.locator('#warningLevel')).toHaveText('Status unavailable');await expect(page.locator('#heroTemp')).toHaveText(/12/);});
test('radar library failure preserves rain readings and satellite section',async({page})=>{await page.route('**/leaflet.js*',r=>r.fulfill({status:503,body:''}));await page.goto('/radar.html');await expect(page.locator('#radarStatus')).toContainText('map library could not load');await expect(page.locator('#radarRainRate')).toHaveText('0.0 mm/h');await expect(page.locator('#satelliteImagery')).toBeVisible();});

test('every website page renders at mobile and desktop widths without script errors',async({page})=>{
 test.setTimeout(120000);const {readdirSync}=await import('node:fs');const pages=readdirSync('.').filter(name=>name.endsWith('.html'));
 await page.route('**/unpkg.com/**',r=>r.fulfill({status:503,body:''}));
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});for(const file of pages){await page.goto('/'+file,{waitUntil:'domcontentloaded'});await page.waitForTimeout(100);await expect(page.locator('h1').first()).toBeVisible();const layout=await page.evaluate(()=>({width:window.innerWidth,content:document.documentElement.scrollWidth}));expect(layout.content,`${file} overflows at ${width}px`).toBeLessThanOrEqual(layout.width+2);}}
});

test('Summary keeps observations when rain history fails',async({page})=>{
 await page.route('**/rain-summary',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));
 await page.goto('/summary.html');await expect(page.locator('#todayHigh')).toHaveText('12.0 °C');await expect(page.locator('#summarySubtitle')).toContainText('rain history');await expect(page.locator('#downloadCsvButton')).toBeEnabled();await expect(page.locator('#lastRainWhen')).toHaveText('Unavailable');
});
test('History finishes loading and retains metadata when daily summaries fail',async({page})=>{
 await page.route('**/daily?**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));
 await page.route('**/stats',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({total_samples:100,month_rain_mm:2,year_rain_mm:3,first_epoch:now,records:{}})}));
 await page.goto('/history.html');await expect(page.locator('#histSamples')).toHaveText('100');await expect(page.locator('#archiveSearchStatus')).toContainText('Daily archive temporarily unavailable');await expect(page.locator('#heatmapSummary')).not.toContainText('Calculating');await expect(page.locator('#historyChartStatus')).toContainText('could not load');
});
test('Invalid download range clears the preceding preview',async({page})=>{
 await page.route('**/export-preview?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({count:13,first_epoch:now-3600,last_epoch:now,coverage_percent:100,columns:['epoch'],sample:[current]})}));
 await page.goto('/downloads.html');await page.getByRole('button',{name:'Preview this download',exact:true}).first().click();await expect(page.locator('#downloadPreview table')).toBeVisible();await page.getByLabel('From',{exact:true}).fill(day);await page.getByLabel('To',{exact:true}).fill('2020-01-01');await page.getByRole('button',{name:'Preview date range',exact:true}).click();await expect(page.locator('#downloadPreviewStatus')).toContainText('valid start and end');await expect(page.locator('#downloadPreview table')).toHaveCount(0);
});
test('Reports explain sparse days and heatmap targets support touch',async({page})=>{
 await page.route('**/coverage?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({days:[{day,actual_slots:104,expected_slots:288,coverage_percent:36.1}],summary:{coverage_percent:36.1}})}));
 await page.goto('/monthly.html');await expect(page.locator('#reportCoverageNote')).toContainText('36.1%');await expect(page.locator('#reportCoverageNote')).toContainText('incomplete coverage');
 await page.goto('/annual.html');await expect(page.locator('#reportCoverageNote')).toContainText('36.1%');
 await page.goto('/history.html');const cell=page.locator('.heatmap-day.has-data').first();await expect(cell).toBeVisible();const box=await cell.boundingBox();expect(box.width).toBeGreaterThanOrEqual(28);expect(box.height).toBeGreaterThanOrEqual(28);
});


test('missing chart library preserves archive and annual figures with clear recovery messages',async({page})=>{
 await page.route('**/chart.umd.min.js*',r=>r.fulfill({status:503,body:''}));
 await page.goto('/history.html?day='+day);await expect(page.locator('#dayHigh')).toHaveText('12.0 °C');await expect(page.locator('#historicalSkyImage')).toBeVisible();await expect(page.locator('#historyChartStatus')).toContainText('chart library could not load');
 await page.goto('/annual.html');await expect(page.locator('#annualHigh')).toHaveText('12.0 °C');await expect(page.locator('#annualChartStatus')).toBeVisible();await expect(page.locator('#annualSubtitle')).not.toContainText('unavailable');
 await page.goto('/graphs.html');await expect(page.locator('#graphUpdated')).toContainText('Graphs could not load');await expect(page.locator('#chartTextSummary')).not.toContainText('are loading');
});
test('empty monthly archive shows an empty report without an invalid date',async({page})=>{
 await page.route('**/daily?**',r=>r.fulfill({contentType:'application/json',body:'{"days":[]}'}));
 await page.goto('/monthly.html');await expect(page.locator('#monthStory')).toHaveText('No archive data is available for this month.');await expect(page.locator('#shareMonthCard')).toBeDisabled();await expect(page.locator('#monthTitle')).not.toContainText('undefined');
});
test('station quality remains available when optional coverage fails',async({page})=>{
 await page.route('**/quality',r=>r.fulfill({contentType:'application/json',body:'{"feed_status":"Live","samples_last_24h":288}'}));
 await page.route('**/reliability',r=>r.abort());await page.goto('/station.html');await expect(page.locator('#qualityFeed')).toHaveText('Live');await expect(page.locator('#quality24')).toHaveText('288');await expect(page.locator('#qualityReliabilityNote')).toContainText('could not be refreshed');
});

test('weather chart peaks have headroom and dashboard pressure keeps a meaningful range',async({page})=>{
 const sample=readings.map((r,i)=>({...r,pressure_hpa:1005+i*.005,rain_rate_mm_h:i===5?1.8:0,uv_index:i===5?3:0,solar_w_m2:i===5?400:20}));
 await page.route('**/current',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({...current,pressure_hpa:1005.035})}));
 await page.route('**/history?**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({readings:sample})}));
 for(const [url,ids] of [['/index.html',['temperatureChart','windChart','solarChart','uvChart','pressureChart']],['/graphs.html',['gTemp','gWind','gSolar','gUv','gPressure','gRain']]]){
  await page.goto(url);if(url==='/index.html')await page.locator('#graphs').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(ids=>ids.every(id=>{const c=Chart.getChart(document.getElementById(id));return c?.data.datasets[0]?.data.length>1;}),ids)).toBe(true);
  const scales=await page.evaluate(ids=>ids.map(id=>{const c=Chart.getChart(document.getElementById(id));const values=c.data.datasets.flatMap((d,i)=>c.isDatasetVisible(i)?d.data.map(p=>p?.y):[]).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);return {id,min:c.scales.y.min,max:c.scales.y.max,peak:Math.max(...values)};}),ids);
  for(const s of scales){if(/Pressure|pressure/.test(s.id))expect(s.max-s.min).toBeGreaterThanOrEqual(2);else expect(s.max,`${s.id} peak needs headroom`).toBeGreaterThan(s.peak);if(/Wind|wind|Solar|solar|Uv|uv|Rain/.test(s.id))expect(s.min).toBe(0);}
 }
});

test('all four flowers stay inside the weather scene and respect reduced motion',async({page})=>{
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});await page.goto('/index.html');await expect(page.locator('#weatherWindowScene')).toHaveAttribute('data-wind','breezy');await expect(page.locator('.ww-flowers .ww-flower')).toHaveCount(4);
  const bounds=await page.evaluate(()=>{const s=document.getElementById('weatherWindowScene').getBoundingClientRect();return [...document.querySelectorAll('.ww-flowers .ww-flower')].map(f=>{const b=f.getBoundingClientRect();return {inside:b.left>=s.left&&b.right<=s.right&&b.top>=s.top&&b.bottom<=s.bottom,animation:getComputedStyle(f).animationName};});});
  expect(bounds.every(f=>f.inside)).toBe(true);expect(bounds.every(f=>f.animation==='weather-window-flower-sway')).toBe(true);
 }
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.ww-flower').first().evaluate(f=>getComputedStyle(f).animationName)).toBe('none');
});

 test('roof station remains fully visible across phone tablet and desktop widths',async({page})=>{
 for(const width of [320,390,768,1024,1120,1280,1281,1366,1920]){
 await page.setViewportSize({width,height:900});await page.goto('/index.html');await expect(page.locator('#weatherWindowScene')).toHaveAttribute('data-wind','breezy');
 if(width<=640){const toggle=page.locator('.weather-window-section .mobile-detail-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
 await page.locator('#weatherWindowScene').scrollIntoViewIfNeeded();await expect(page.locator('.ww-weather-station')).toBeVisible();
 const result=await page.locator('.ww-weather-station').evaluate(e=>{const b=e.getBoundingClientRect(),s=e.closest('.weather-window-scene').getBoundingClientRect();return {inside:b.left>=s.left&&b.right<=s.right&&b.top>=s.top&&b.bottom<=s.bottom,width:b.width,height:b.height};});
 expect(result.inside,`station clipped at ${width}px`).toBe(true);expect(result.width).toBeGreaterThanOrEqual(15);expect(result.height).toBeGreaterThanOrEqual(30);
 }
 });

test('slow external marine check does not label the weather data service slow',async({page})=>{
 await page.route('**/health',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',database:'connected',archive_ingest:{latest_age_seconds:30}})}));
 await page.route('**/met/marine?**',async r=>{await new Promise(resolve=>setTimeout(resolve,8300));await r.fulfill({contentType:'application/json',body:JSON.stringify({local_warning_relevant:false})});});
 await page.goto('/status.html');await expect(page.locator('#apiBadge')).toHaveText('OK',{timeout:3000});await expect(page.locator('#apiDetail')).toHaveText('Weather data service connected');
 await expect(page.locator('#overallText')).toContainText('checks complete');await expect(page.locator('#refreshButton')).toBeEnabled({timeout:20000});
});

for(const file of ['graphs.html','history.html'])test(`${file} compares Irish-time dates, clears changed dates and recovers from failure`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/day?date=**',r=>{const selected=new URL(r.request().url()).searchParams.get('date');return r.fulfill({contentType:'application/json',body:JSON.stringify({available:true,readings:[{epoch:Date.parse(selected+'T08:00:00Z')/1000,temperature_c:12,rain_rate_mm_h:0},{epoch:Date.parse(selected+'T08:05:00Z')/1000,temperature_c:13,rain_rate_mm_h:.1}]})});});
 await page.goto('/'+file);
 await page.locator('#comparisonFirst').fill('2026-10-07');await page.locator('#comparisonSecond').fill('2026-10-08');
 await page.locator('#compareDatesButton').click();await expect(page.locator('#comparisonStatus')).toContainText('Comparing 7 Oct 2026 with 8 Oct 2026');await expect(page.locator('#comparisonSummary')).toContainText('2 temperature readings');await expect(page.locator('#comparisonChart')).toBeVisible();
 const chart=await page.evaluate(()=>{const c=Chart.getChart(document.getElementById('comparisonChart'));return{first:c.data.datasets[0].data[0],second:c.data.datasets[1].data[0],min:c.options.scales.x.min,max:c.options.scales.x.max}});
 expect(chart.first.x).toBe(540);expect(chart.second.x).toBe(540);expect(chart.min).toBe(0);expect(chart.max).toBe(1440);
 if(file==='graphs.html'){
   await page.getByText('Advanced zoom options',{exact:true}).click();
   await page.getByRole('button',{name:'Zoom to selected interval',exact:true}).click();
   expect(await page.evaluate(()=>Chart.getChart(document.getElementById('comparisonChart')).options.scales.x.max)).toBe(1440);
 }
 await page.locator('#comparisonMetric').selectOption('rain_rate_mm_h');await expect(page.locator('#comparisonSummary')).toContainText('0.0–0.1 mm/h');
 await page.locator('#comparisonSecond').fill('2026-10-07');await expect(page.locator('#comparisonChart')).toBeHidden();await page.locator('#compareDatesButton').click();await expect(page.locator('#comparisonStatus')).toContainText('two different dates');
 await page.locator('#comparisonSecond').fill('2026-10-08');await page.route('**/day?date=2026-10-08',r=>r.fulfill({status:503,body:'Unavailable'}));await page.locator('#compareDatesButton').click();await expect(page.locator('#comparisonStatus')).toContainText('could not be loaded');await expect(page.locator('#compareDatesButton')).toBeEnabled();await expect(page.locator('#comparisonChart')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('footer links remain centred, touchable and within narrow screens',async({page})=>{
 for(const width of [320,390,540,768,1280]){
  await page.setViewportSize({width,height:844});await page.goto('/index.html');
  const links=await page.locator('footer > nav.footer-links').evaluate(nav=>({
   links:[...nav.querySelectorAll('a')].map(a=>{const r=a.getBoundingClientRect();return{height:r.height,left:r.left,right:r.right,display:getComputedStyle(a).display,align:getComputedStyle(a).alignItems};}),
   separators:[...nav.querySelectorAll('span')].map(s=>getComputedStyle(s).display)
  }));
  for(const link of links.links){expect(link.height).toBeGreaterThanOrEqual(44);expect(link.left).toBeGreaterThanOrEqual(0);expect(link.right).toBeLessThanOrEqual(width);expect(['flex','inline-flex']).toContain(link.display);expect(link.align).toBe('center');}
  expect(links.separators.every(display=>display==='none')).toBe(true);
 }
});

test.describe('source times for a visitor outside Ireland',()=>{
 test.use({timezoneId:'Asia/Kolkata'});
 test('UTC marine model time is displayed accurately in Irish time',async({page})=>{
 const raw=new Date().toISOString().slice(0,16),stamp=raw+'Z';const expected=new Date(stamp).toLocaleString('en-IE',{timeZone:'Europe/Dublin',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 await page.route('**/marine/sea-temperature',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({local_model:{sea_surface_temperature_c:15,model_time:raw},m2_buoy:{sea_surface_temperature_c:14.8,observation_time:stamp}})}));
 await page.goto('/coast.html');await expect(page.locator('#localSeaTempTime')).toContainText(expected);await expect(page.locator('#localSeaFreshness')).toContainText(expected);
 });
});
