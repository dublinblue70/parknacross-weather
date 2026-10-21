import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../worker.mjs',import.meta.url),'utf8').replace('export default {','const worker = {');
const now=Date.parse('2026-10-21T08:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const active='<h3>Gale warning for the Irish Sea</h3><p>Valid: 04:00 Wednesday 21/10/2026 to 16:00 Wednesday 21/10/2026</p><p>Issued: 05:49 Wednesday 21/10/2026</p>';
const green='<h3>Currently no warnings in operation.</h3>';
function context({today=active,tomorrow=green,day=21,future=true}={}){
 const page=(scope,body)=>`<h1>Warnings and Advisories - ${scope==='today'?'Today':'Tomorrow'} ${scope==='today'?day:22} October 2026</h1><h2>Wicklow Head to Carnsore Point Warnings</h2>${body}<h2>Weather Warnings</h2><h2>Marine Warnings</h2>`;
 const marine=`<div class="sea-area-short-coastal"><h2>Forecast for Irish Sea</h2><p><strong>Wind:</strong> Northwest force 3 or 4.</p><p><strong>Weather:</strong> Showers.</p><p><strong>Visibility:</strong> Good.</p></div><div class="sea-area-outlook"><p>Fair spells.</p>Forecast issued at: ${future?'23:00':'08:00'}, Wednesday 21 October 2026</div><p>Forecast valid from: 06:00, Wednesday 21 October 2026 until 06:00, Thursday 22 October 2026</p>`;
 const ctx={Date:Clock,Intl,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,Uint8Array,atob,btoa,setTimeout,clearTimeout,console:{warn(){},error(){},log(){}},fetch:async url=>{
  const u=String(url);if(u.includes('Met-Sea-area.json'))return{ok:false,status:404};
  if(u.includes('sea-area-forecast'))return{ok:true,text:async()=>marine};
  const scope=u.includes('/today/')?'today':'tomorrow',body=scope==='today'?today:tomorrow;
  if(body===null)throw Error('Warning service unavailable');
  return{ok:true,text:async()=>page(scope,body)};
 }};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
let c=context(),r=await c.getMarineForecast();
assert.equal(r.forecast_available,false);assert.match(r.forecast_error,/future/);assert.equal(r.local_warning_status_available,true);assert.equal(r.local_gale_warning,true);assert.equal(r.local_area,null);assert.equal(r.local_warnings.length,1);
assert.throws(()=>c.validateMarineForecast({issued:'2026-10-21T22:00:00Z',areas:[]},'test'),/future/);
r=await context({today:green}).getMarineForecast();assert.equal(r.local_warning_relevant,false);assert.equal(r.local_warning_status_available,true);
await assert.rejects(context({today:green,tomorrow:null}).getMarineForecast(),/could not be verified/);
await assert.rejects(context({today:'Unrecognised bulletin',tomorrow:null}).getMarineForecast(),/could not be verified/);
await assert.rejects(context({day:13,tomorrow:null}).getMarineForecast(),/could not be verified/);
r=await context({today:green,tomorrow:null,future:false}).getMarineForecast();assert.equal(r.forecast_available,true);assert.equal(r.local_warning_status_available,false);assert.equal(r.local_warning_relevant,null);
const expired=active.replaceAll('21/10/2026','20/10/2026');r=await context({today:expired}).getMarineForecast();assert.equal(r.local_warning_relevant,false);assert.equal(r.local_warnings.length,0);
console.log('PASS: warning checks survive forecast failure; invalid dates, unknown markup, partial checks and expired warnings cannot produce false all-clears.');
