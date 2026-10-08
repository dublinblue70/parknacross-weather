import assert from 'node:assert/strict';
export async function checkPublicSite({fetcher=fetch,now=Date.now(),site='https://parknacrossweather.ie',api='https://parknacross-weather.dave-s-carter.workers.dev'}={}) {
  const results=[];
  const fresh=epoch=>epoch!==null&&epoch!==undefined&&Number.isFinite(Number(epoch))&&Math.abs(now/1000-Number(epoch))<=900;
  const tasks=[
    ['Website',site+'/',async r=>{assert.match(await r.text(),/PARKNACROSS WEATHER/);} ],
    ['Current readings',api+'/current',async r=>{const d=await r.json();assert.ok(!d.error&&fresh(d.epoch),'Latest observation is missing or delayed');}],
    ['Summary observations',api+'/history?hours=48',async r=>{const d=await r.json();assert.ok(Array.isArray(d.readings)&&d.readings.some(row=>fresh(row.epoch)),'Summary archive has no fresh observations');}],
    ['Daily summaries',api+'/daily?days=8',async r=>{const d=await r.json();assert.ok(Array.isArray(d.days)&&d.days.some(row=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.day)&&Math.abs(now-Date.parse(row.day+'T12:00:00Z'))<2*86400000),'Recent daily archive is missing');}],
    ['Statistics',api+'/stats',async r=>{const d=await r.json();assert.ok(Number(d.total_samples)>0&&d.records&&typeof d.records==='object'&&!d.error,'Archive statistics are missing');}],
    ['Export preview',api+'/export-preview?days=1',async r=>{const d=await r.json();assert.ok(Number(d.count)>0&&fresh(d.last_epoch)&&d.columns?.includes('soil_moisture_pct')&&d.columns?.includes('lightning_strikes'),'Export preview is incomplete or delayed');}],
    ['CSV export',api+'/export.csv?days=1',async r=>{const text=await r.text();assert.ok(text.split(/\r?\n/).length>2&&text.split(/\r?\n/)[0].includes('observation_time_ireland'),'CSV export is missing observations or fields');}]
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
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  const results=await checkPublicSite();
  for(const result of results)console.log(`${result.ok?'PASS':'FAIL'}: ${result.name}${result.error?' — '+result.error:''}`);
  if(results.some(result=>!result.ok))process.exitCode=1;
}
