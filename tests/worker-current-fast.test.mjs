import assert from 'node:assert/strict';import worker from '../_worker/worker.mjs';
let calls=0;const unavailable={prepare(){calls++;throw Error('Database unavailable');}};
const validRequest=new Request('https://worker.test/admin/capabilities',{headers:{'X-Parknacross-Admin-Key':'test-only'}});
let response=await worker.fetch(validRequest,{ADMIN_KEY:'test-only',DB:unavailable},{});assert.equal(response.status,200);assert.equal((await response.json()).worker_version,'38.4.94');assert.equal(calls,0,'login must not access D1');
response=await worker.fetch(new Request('https://worker.test/admin/capabilities'),{ADMIN_KEY:'test-only',DB:unavailable},{});assert.equal(response.status,401);assert.equal(calls,0);
const reading={epoch:Math.floor(Date.now()/1000),received_at:new Date().toISOString(),temperature_c:12,humidity:70,pressure_hpa:1016,rain_daily_mm:0,rain_rate_mm_h:0};let migrations=0;
const DB={prepare(sql){if(/CREATE|ALTER/i.test(sql)){migrations++;throw Error('No schema changes permitted');}const query={bind(){return query;},first:async()=>/SELECT epoch, received_at/.test(sql)?reading:null,all:async()=>({results:[]}),run:async()=>({success:true})};return query;}};
response=await worker.fetch(new Request('https://worker.test/current'),{DB},{waitUntil(){}});assert.equal(response.status,200);assert.equal((await response.json()).temperature_c,12);assert.equal(migrations,0);assert.match(response.headers.get('Cache-Control'),/no-store/);
console.log('PASS: admin authentication and current readings bypass migrations; invalid keys fail and timestamps remain current.');
