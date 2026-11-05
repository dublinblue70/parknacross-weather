import assert from 'node:assert/strict';
import {checkArchiveConsistency,checkPublicSite} from '../public-monitor.mjs';
const now=Date.parse('2026-11-05T10:00:00Z');
const stats={wettest_day:{rain_mm:12},records:{high_temperature:{value:18},peak_gust:{value:60}}};
const daily={days:[{day:'2026-11-03',rain_mm:3.5,high_c:13,peak_gust_kmh:35}]};
const fake=(s,d)=>async url=>({ok:true,status:200,json:async()=>url.includes('/stats')?s:d});
assert.equal((await checkArchiveConsistency({fetcher:fake(stats,daily),now})).ok,true);
assert.equal((await checkArchiveConsistency({fetcher:fake({...stats,wettest_day:{rain_mm:1}},daily),now})).ok,false,'Rain discrepancies must fail monitoring');
assert.equal((await checkArchiveConsistency({fetcher:async()=>({ok:false,status:503}),now})).ok,false,'Unavailable reconciliation must not pass');
const current=async url=>({ok:true,status:200,json:async()=>({epoch:now/1000,rain_rate_mm_h:0,rain_daily_mm:0})});
const checks=await checkPublicSite({now,fetcher:async url=>{
 if(url.endsWith('/site-capabilities'))return {ok:true,json:async()=>({features:{wh40h_primary_rain:false}})};
 if(url.endsWith('/current'))return current(url);
 return {ok:false,status:503};
}});
assert.equal(checks.find(c=>c.name==='WH40H primary-source mapping')?.ok,false,'A missing WH40H capability must fail');
assert.equal(checks.find(c=>c.name==='Current readings')?.ok,true,'Measured zero rain is valid');
console.log('PASS: WH40H checks and archive reconciliation fail accurately without rejecting measured zero.');
