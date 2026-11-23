import assert from 'node:assert/strict';import worker from '../_worker/worker.mjs';
let calls=0;const unavailable={prepare(){calls++;throw Error('Database unavailable');}};
const validRequest=new Request('https://worker.test/admin/capabilities',{headers:{'X-Parknacross-Admin-Key':'test-only'}});
let response=await worker.fetch(validRequest,{ADMIN_KEY:'test-only',DB:unavailable},{});assert.equal(response.status,200);const capabilities=await response.json();assert.match(capabilities.worker_version,/^38\.4\.\d+$/);assert.equal(capabilities.features.wh40h_primary_rain,true);assert.equal(calls,0,'login must not access D1');
response=await worker.fetch(new Request('https://worker.test/admin/capabilities'),{ADMIN_KEY:'test-only',DB:unavailable},{});assert.equal(response.status,401);assert.equal(calls,0);
const reading={epoch:Math.floor(Date.now()/1000),received_at:new Date().toISOString(),temperature_c:12,humidity:70,pressure_hpa:1016,rain_daily_mm:0,rain_rate_mm_h:0};let migrations=0;
const DB={prepare(sql){if(/CREATE|ALTER/i.test(sql)){migrations++;throw Error('No schema changes permitted');}const query={bind(){return query;},first:async()=>/SELECT epoch, received_at/.test(sql)?reading:null,all:async()=>({results:[]}),run:async()=>({success:true})};return query;}};
response=await worker.fetch(new Request('https://worker.test/current'),{DB},{waitUntil(){}});assert.equal(response.status,200);assert.equal((await response.json()).temperature_c,12);assert.equal(migrations,0);assert.match(response.headers.get('Cache-Control'),/no-store/);

// The WH52 channel-one observation arrives independently of the station-wide
// archive. A newer real 20 µS/cm sample must supersede an older 0 in /current.
async function currentWithWh52({ec=20,ageSeconds=25,channel=1,archivedEc=0}={}) {
  const now=Math.floor(Date.now()/1000);
  const weather={...reading,epoch:now-60,received_at:new Date((now-60)*1000).toISOString(),
    soil_channel:1,soil_moisture_pct:44,soil_temperature_c:10.4,soil_ec_us_cm:archivedEc};
  const soilRecord={channel,moisture_pct:61,temperature_c:10.1,ec_us_cm:ec,received_epoch:now-ageSeconds};
  const DB={prepare(sql){
    let params=[];
    return {
      bind(...args){params=args;return this;},
      async all(){return {results:[]};},
      async first(){
        if(sql.includes('SELECT epoch, received_at'))return weather;
        if(sql.includes('SELECT value FROM') && params[0]==='wh52_gateway_latest_v1')return {value:JSON.stringify(soilRecord)};
        return null;
      },
      async run(){return {success:true}}
    };
  }};
  const response=await worker.fetch(new Request('https://worker.test/current'),{DB},{waitUntil(){}});
  assert.equal(response.status,200);
  return await response.json();
}
const freshSoil=await currentWithWh52();
assert.equal(freshSoil.soil_ec_us_cm,20,'prefer the newest actual soil EC over a stale archive zero');
assert.equal(freshSoil.soil_moisture_pct,61);
assert.equal(freshSoil.soil_temperature_c,10.1);
assert.equal(freshSoil.soil_reading_source,'authenticated_wh52_gateway');
assert.ok(Number(freshSoil.soil_observed_epoch)>0);
const sensorNowZero=await currentWithWh52({ec:0});
assert.equal(sensorNowZero.soil_ec_us_cm,0,'a confirmed new EC zero is still a valid sensor value');
const wrongChannel=await currentWithWh52({ec:20,channel:2});
assert.equal(wrongChannel.soil_ec_us_cm,0,'another soil channel must never replace CH1');
const staleSoil=await currentWithWh52({ec:20,ageSeconds:800});
assert.equal(staleSoil.soil_ec_us_cm,0,'older than 12-minute sensor receipts must not be treated as current');
assert.equal(staleSoil.soil_reading_source,undefined);
console.log('PASS: admin authentication and current readings bypass migrations; invalid keys fail and timestamps remain current.');
