import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const expectedSiteVersion=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
export function publishedVersion(html) {
  const match=String(html).match(/<meta\s+name=["']parknacross-site-version["']\s+content=["']([^"']+)["']/i);
  return match?.[1] || null;
}
export function assertPublishedRelease(html,expected=expectedSiteVersion) {
  assert.equal(publishedVersion(html),expected,`Published HTML version differs from GitHub release ${expected}`);
}

// Compare WH40H daily totals at the latest archived and live observation.
// Compare only the same Irish calendar day to avoid a false midnight rollover alarm.
export function compareRainPipeline(current,history,now=Date.now()) {
  const valid=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
  const day=epoch=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(epoch)*1000));
  const epoch=Number(current?.epoch),rain=Number(current?.rain_daily_mm);
  if(!valid(current?.epoch)||epoch<=0||!valid(current?.rain_daily_mm)||rain<0)
    return {ok:false,reason:'Current rainfall reading or timestamp is invalid'};
  const readings=Array.isArray(history?.readings)?history.readings:[];
  const candidates=readings.filter(row=>valid(row?.epoch)&&valid(row?.rain_daily_mm)&&Number(row.epoch)>0&&day(row.epoch)===day(epoch))
    .sort((a,b)=>Number(b.epoch)-Number(a.epoch));
  const archived=candidates[0];
  if(!archived)return {ok:false,reason:'No same-day archived rainfall reading was available'};
  const gapSeconds=epoch-Number(archived.epoch);
  if(gapSeconds< -120)return {ok:false,reason:'The latest archive is newer than the reported current reading'};
  if(gapSeconds>20*60)return {ok:false,reason:'Archived rainfall is more than 20 minutes behind the current feed'};
  const archiveRain=Number(archived.rain_daily_mm);
  if(archiveRain<0)return {ok:false,reason:'Archived rain total is negative'};
  if(archiveRain-rain>0.25)return {ok:false,reason:`Same-day rainfall dropped from archived ${archiveRain} mm to live ${rain} mm`};
  if(Math.abs(gapSeconds)<=60&&Math.abs(archiveRain-rain)>0.25)
    return {ok:false,reason:`Matching observation rainfall differs (archive ${archiveRain} mm; current ${rain} mm)`};
  return {ok:true,latestArchivedEpoch:Number(archived.epoch),archiveRainMm:archiveRain,currentRainMm:rain};
}

export function validMarineForecast(data,now=Date.now()){
  const issued=Date.parse(data?.issued_at||data?.issued||'');
  return Boolean(!data?.error&&data?.forecast_available===true&&Number.isFinite(issued)&&now-issued>=-90000&&now-issued<=24*3600000&&['wind','weather','visibility'].every(field=>typeof data.local_area?.[field]==='string'&&data.local_area[field].trim().length>0));
}
export async function checkPublicSite({fetcher=fetch,now=Date.now(),site='https://parknacrossweather.ie',api='https://parknacross-weather.dave-s-carter.workers.dev'}={}) {
  const results=[];
  const exportDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const previousDate=new Date(exportDay+'T12:00:00Z');previousDate.setUTCDate(previousDate.getUTCDate()-1);
  const exportFrom=previousDate.toISOString().slice(0,10);
  const fresh=epoch=>epoch!==null&&epoch!==undefined&&Number.isFinite(Number(epoch))&&now/1000-Number(epoch)>=-120&&now/1000-Number(epoch)<=900;
  const tasks=[
    ['Website',site+'/',async r=>{const html=await r.text();assert.match(html,/PARKNACROSS WEATHER/);assertPublishedRelease(html);} ],
    ['System status release',site+'/status.html',async r=>assertPublishedRelease(await r.text())],
    ['Admin interface release',site+'/admin.html',async r=>assertPublishedRelease(await r.text())],
    ['Current readings',api+'/current',async r=>{const d=await r.json();assert.ok(!d.error&&fresh(d.epoch),'Latest observation is missing or delayed');assert.ok(d.rain_rate_mm_h!==null&&d.rain_rate_mm_h!==undefined&&d.rain_daily_mm!==null&&d.rain_daily_mm!==undefined&&Number.isFinite(Number(d.rain_rate_mm_h))&&Number.isFinite(Number(d.rain_daily_mm)),'WH40H rainfall fields are missing or invalid; a valid zero is fine');}],
    ['WH40H primary-source mapping',api+'/site-capabilities',async r=>{const d=await r.json();assert.equal(d?.features?.wh40h_primary_rain,true,'Deployed Worker does not confirm WH40H primary rain source');}],
    ['Rainfall pipeline reconciliation',api+'/current',async r=>{
      const current=await r.json();
      const historyResponse=await fetcher(api+'/history?hours=2',{cache:'no-store',signal:AbortSignal.timeout(25000)});
      assert.ok(historyResponse.ok,'Recent archive cannot be checked for rainfall');
      const result=compareRainPipeline(current,await historyResponse.json(),now);
      assert.ok(result.ok,result.reason||'Rainfall feeds disagree');
    }],
    ['Summary observations',api+`/history?hours=48&_window=${Math.floor(now/300000)}`,async r=>{const d=await r.json();assert.ok(Array.isArray(d.readings)&&d.readings.some(row=>fresh(row.epoch)),'Summary archive has no fresh observations');}],
    ['Daily summaries',api+'/daily?days=8',async r=>{const d=await r.json();assert.ok(Array.isArray(d.days)&&d.days.some(row=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.day)&&Math.abs(now-Date.parse(row.day+'T12:00:00Z'))<2*86400000),'Recent daily archive is missing');}],
    ['Rain events',api+'/rain-events?days=30',async r=>{const d=await r.json();assert.ok(Array.isArray(d.events)&&Number.isFinite(d.event_count)&&!d.error,'Rain-event history unavailable');}],
    ['Archive coverage',api+'/coverage?days=371',async r=>{const d=await r.json();assert.ok(Array.isArray(d.days)&&d.days.length&&d.summary&&Number.isFinite(d.summary.coverage_percent)&&!d.error,'Archive coverage unavailable');}],
    ['Statistics',api+'/stats',async r=>{const d=await r.json();assert.ok(Number(d.total_samples)>0&&d.records&&typeof d.records==='object'&&!d.error,'Archive statistics are missing');}],
    ['Export preview',api+`/export-preview?from=${exportFrom}&to=${exportDay}`,async r=>{const d=await r.json();assert.ok(Number(d.count)>0&&fresh(d.last_epoch)&&d.columns?.includes('soil_moisture_pct')&&d.columns?.includes('lightning_strikes'),'Export preview is incomplete or delayed');}],
    ['Local hourly forecast',api+'/outdoor-outlook',async r=>{const d=await r.json();assert.ok(Array.isArray(d.points)&&d.points.some(p=>Number(p.epoch)*1000>=now)&&now-Date.parse(d.fetched_at)<5400000&&Date.parse(d.fetched_at)<=now+90000,'Local forecast is missing or delayed');}],
    ['Public photo calendar',api+'/sky-photo/history/dates?month='+exportDay.slice(0,7),async r=>{const d=await r.json();assert.ok(d.month===exportDay.slice(0,7)&&Array.isArray(d.days),'Photo calendar data is invalid');}],
    ['Background push configuration',api+'/push/public-key',async r=>{const d=await r.json();assert.ok(d.available===true&&typeof d.public_key==='string','Push configuration is unavailable');}],
    ['Marine forecast',api+'/met/marine',async r=>{const d=await r.json();assert.ok(validMarineForecast(d,now),'Marine forecast is missing or delayed');}],
    ['CSV export',api+`/export.csv?from=${exportFrom}&to=${exportDay}`,async r=>{const text=await r.text();assert.ok(text.split(/\r?\n/).length>2&&text.split(/\r?\n/)[0].includes('observation_time_ireland'),'CSV export is missing observations or fields');}]
  ];
  // Limit concurrency and use a short retry to distinguish a transient failure.
  for(let offset=0;offset<tasks.length;offset+=3) await Promise.all(tasks.slice(offset,offset+3).map(async([name,url,validate])=>{
    let error;
    for(let attempt=0;attempt<2;attempt++){
      try{const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(25000)});assert.ok(r.ok,`HTTP ${r.status}`);await validate(r);results.push({name,ok:true});return;}catch(e){error=e;}
    }
    results.push({name,ok:false,error:error.message});
  }));
  return results;
}

/* Read-only consistency check: distinguish completed Irish dates from today's
   partial observations and compare recorded daily maxima with all-time stats.
   This reports discrepancies; it never edits archived readings. */
export function archiveDiscrepancies(stats, daily, now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const rows = (Array.isArray(daily?.days) ? daily.days : []).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row?.day || '') && row.day < today);
  const max = key => rows.reduce((best,row) => {
    const v = row[key];
    return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && (!best || Number(v) > Number(best[key])) ? row : best;
  },null);
  const issues = [];
  const check = (label, row, field, record, recordField='value', tolerance=0.15) => {
    if (!row || !record || !Number.isFinite(Number(record[recordField]))) return;
    if (Number(row[field]) > Number(record[recordField]) + tolerance) {
      issues.push(`${label}: daily archive shows ${row[field]} on ${row.day} but /stats reports ${record[recordField]}`);
    }
  };
  check('Wettest day',max('rain_mm'),'rain_mm',stats?.wettest_day,'rain_mm',0.15);
  check('Highest temperature',max('high_c'),'high_c',stats?.records?.high_temperature,'value',0.15);
  check('Peak gust',max('peak_gust_kmh'),'peak_gust_kmh',stats?.records?.peak_gust,'value',0.3);
  return issues;
}

export async function checkArchiveConsistency({fetcher=fetch,api='https://parknacross-weather.dave-s-carter.workers.dev',now=Date.now()}={}) {
  try {
    const [statsRes,dailyRes] = await Promise.all(['/stats','/daily?days=3660'].map(path=>fetcher(api+path,{cache:'no-store',signal:AbortSignal.timeout(25000)})));
    if (!statsRes.ok || !dailyRes.ok) throw Error(`HTTP ${statsRes.status}/${dailyRes.status}`);
    const [stats,daily] = await Promise.all([statsRes.json(),dailyRes.json()]);
    if (!Array.isArray(daily.days) || !stats.records) throw Error('Archive comparison data unavailable');
    const issues = archiveDiscrepancies(stats,daily,now);
    return {name:'Historical records reconciliation',ok:issues.length===0,warning:issues.length?issues.join(' | '):null};
  } catch(e) {
    return {name:'Historical records reconciliation',ok:false,warning:'Unable to verify archive consistency: '+e.message};
  }
}

if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  const results=await checkPublicSite();
  results.push(await checkArchiveConsistency());
  for(const result of results)console.log(`${result.ok?'PASS':'FAIL'}: ${result.name}${result.error?' — '+result.error:''}${result.warning?' — '+result.warning:''}`);
  if(results.some(result=>!result.ok))process.exitCode=1;
}
