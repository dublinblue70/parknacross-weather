import {test,expect} from '@playwright/test';
let tideOK=false,age=0,samples=288,firstAge=86400*30,requests=[];
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'});
test.beforeEach(async({page})=>{
 tideOK=false;age=0;samples=288;firstAge=86400*30;requests=[];
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/*.workers.dev/**',r=>{
 const url=new URL(r.request().url()),path=url.pathname,now=Math.floor(Date.now()/1000);requests.push(url.href);
 const current={epoch:now-age,received_at:new Date((now-age)*1000).toISOString(),temperature_c:12,soil_moisture_pct:40};
 const data={
 '/health':{status:'ok',database:'connected',archive_ingest:{latest_age_seconds:30}},'/current':current,
 '/quality':{samples_last_24h:samples,median_interval_minutes:5,largest_recent_gap_minutes:5,gust_spikes_excluded_24h:0,gust_spikes_excluded_total:0,battery_voltage_v:3.28,battery_first_seen_at:new Date().toISOString(),battery_last_reported_at:new Date().toISOString()},
 '/history':{readings:[current]},'/reliability':{archive_reliability_percent:100,actual_samples:288,expected_samples:288},
 '/backup-status':{configured:true,last_success:new Date().toISOString(),last_backup_day:day()},'/social-status':{facebook_verified_day:day(),x_verified_day:day()},
 '/marine/tides':{events:[{type:'high',time:new Date(Date.now()+3600000).toISOString()}]},'/marine/sea-temperature':{m2_observation_available:true,m2_buoy:{sea_surface_temperature_c:14,observation_age_minutes:10}},
 '/met/warnings':{warnings:[]},'/met/marine':{local_warning_relevant:false},'/daily':{days:[{day:day()}]},'/stats':{first_epoch:now-firstAge,total_samples:1000,records:{}},
 '/rain-events':{events:[],event_count:0},'/coverage':{days:[{day:day()}],summary:{coverage_percent:100}},'/export-preview':{count:10,columns:['epoch'],last_epoch:now}
 }[path]||{};
 if(path==='/marine/tides'&&!tideOK)return r.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'});
 return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
});
const complete=async page=>{await expect(page.locator('#healthProgress')).toContainText('18 of 18');await expect(page.locator('#refreshButton')).toBeEnabled();};
test('supporting failures have actionable guidance without marking the core weather service down',async({page})=>{
 await page.goto('/status.html');await complete(page);await expect(page.locator('#overallTitle')).toHaveText('Core weather services are healthy');await expect(page.locator('#healthAttentionList')).toContainText('Arklow tide feed');await expect(page.locator('#healthAttentionList')).toContainText('Local weather readings are independent');
 await expect(page.locator('#healthCounts')).toContainText('1 need attention');await expect(page.locator('#monitoringHealth')).toContainText('does not verify the latest independent monitoring run');await expect(page.locator('#monitoringHealth .badge')).toHaveText('CONFIGURED');
 await page.locator('#healthIssuesOnly').check();await expect(page.locator('#health-tide')).toBeVisible();await expect(page.locator('#health-feed')).toBeHidden();await expect(page.locator('#coreHealth')).toBeHidden();
});
test('individual retry keeps other timestamps and records recovery in this browser session',async({page})=>{
 await page.goto('/status.html');await complete(page);const stamp=await page.locator('#feedCheckedAt').innerText(),before=requests.length;
 tideOK=true;await page.getByRole('button',{name:'Retry Arklow tide feed',exact:true}).click();await complete(page);await expect(page.locator('#tideBadge')).toHaveText('Healthy');await expect(page.locator('#feedCheckedAt')).toHaveText(stamp);await expect(page.locator('#healthChanges')).toContainText('Recovered · Arklow tide feed');
 expect(requests.slice(before).map(url=>new URL(url).pathname)).toEqual(['/marine/tides']);
 const exports=requests.filter(url=>new URL(url).pathname==='/export-preview');expect(exports.length).toBe(1);const q=new URL(exports[0]).searchParams;expect(q.get('from')).not.toBe(q.get('to'));
 await page.reload();await complete(page);await expect(page.locator('#healthChanges')).toContainText('Recovered · Arklow tide feed');
});
test('low archive counts and future observations are flagged with commissioning-aware expectations',async({page})=>{
 samples=100;age=-900;await page.goto('/status.html');await complete(page);await expect(page.locator('#feedValue')).toHaveText('Check timestamp');await expect(page.locator('#feedBadge')).toHaveText('Not verified');await expect(page.locator('#samplesBadge')).toHaveText('Needs attention');await page.locator('#health-samples summary').click();await expect(page.locator('#samplesDetail')).toContainText('100 of 288 expected');
 age=0;samples=5;firstAge=1200;await page.locator('#refreshButton').click();await complete(page);await expect(page.locator('#samplesBadge')).toHaveText('Healthy');await expect(page.locator('#samplesDetail')).toContainText('5 of 5 expected');await expect(page.locator('#samplesDetail')).toContainText('since archiving began');
});
test('observation ages advance between checks without changing the check timestamp',async({page})=>{
 tideOK=true;age=595;await page.clock.install({time:new Date()});await page.goto('/status.html');await complete(page);await expect(page.locator('#feedBadge')).toHaveText('Healthy');const stamp=await page.locator('#feedCheckedAt').innerText(),before=requests.length;
 await page.clock.fastForward(16000);await expect(page.locator('#feedBadge')).toHaveText('Delayed');await expect(page.locator('#feedCheckedAt')).toHaveText(stamp);expect(requests.length).toBe(before);await expect(page.locator('#healthChanges')).toContainText('New issue · Latest observation');
});
test.describe('mobile health checks',()=>{test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});test('issues filter, retry and disclosures remain usable without horizontal overflow',async({page})=>{
 await page.goto('/status.html');await complete(page);await page.locator('#healthIssuesOnly').check();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const button=page.getByRole('button',{name:'Retry Arklow tide feed',exact:true});const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);await page.locator('#health-tide summary').click();await expect(page.locator('#tideDetail')).toBeVisible();await expect(page.locator('#health-tide .health-response-time')).toContainText('seconds');
 tideOK=true;await button.tap();await complete(page);await expect(page.locator('#healthFilteredEmpty')).toBeVisible();await page.locator('#healthIssuesOnly').uncheck();await expect(page.locator('#health-feed')).toBeVisible();
});});
