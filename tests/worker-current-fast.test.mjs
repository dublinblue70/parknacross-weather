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
// The GW3001 can supply zero WH52 EC while Ecowitt's official API v3
// supplies a positive calibrated EC at soil_moisture_ec_ch1.ec.
async function currentWithCloudEc({cloudEc=35,cloudAgeSeconds=80,cloudChannel=1,directEc=0}={}) {
  const now=Math.floor(Date.now()/1000);
  const weather={...reading,epoch:now-100,received_at:new Date((now-100)*1000).toISOString(),
    soil_channel:1,soil_moisture_pct:50,soil_temperature_c:12.2,soil_ec_us_cm:directEc};
  const direct={channel:1,moisture_pct:50,temperature_c:12.2,ec_us_cm:directEc,received_epoch:now-30};
  const cloudPayload={data:{[`soil_moisture_ec_ch${cloudChannel}`]:{
    ec:{value:String(cloudEc),unit:"µS/cm",time:String(now-cloudAgeSeconds)},
    soilmoisture:{value:"50",time:String(now-cloudAgeSeconds)}
  }}};
  const DB={prepare(sql){let params=[];return {
    bind(...a){params=a;return this;},
    async all(){return {results:[]}},
    async first(){
      if(sql.includes('SELECT epoch, received_at'))return weather;
      if(sql.includes('SELECT value FROM')&&params[0]==='wh52_gateway_latest_v1')return {value:JSON.stringify(direct)};
      if(sql.includes('SELECT epoch, raw_json FROM latest_payload_v1'))return {epoch:now-cloudAgeSeconds,raw_json:JSON.stringify(cloudPayload)};
      return null;
    }, async run(){return {success:true}}
  }}};
  const response=await worker.fetch(new Request('https://worker.test/current'),{DB},{waitUntil(){}});
  assert.equal(response.status,200);
  return await response.json();
}
const recoveredCloud=await currentWithCloudEc();
assert.equal(recoveredCloud.soil_ec_us_cm,35,'cloud EC must correct a gateway zero');
assert.equal(recoveredCloud.soil_ec_reading_source,'ecowitt_cloud_ch1');
assert.equal(recoveredCloud.soil_moisture_pct,50,'do not replace valid gateway soil moisture');
const staleCloud=await currentWithCloudEc({cloudAgeSeconds:900});
assert.equal(staleCloud.soil_ec_us_cm,0,'stale cloud EC must not override gateway');
const unrelatedChannel=await currentWithCloudEc({cloudChannel:2});
assert.equal(unrelatedChannel.soil_ec_us_cm,0,'wrong channel must not provide conductivity');
const actualZero=await currentWithCloudEc({cloudEc:0});
assert.equal(actualZero.soil_ec_us_cm,0,'two real zero measurements must remain zero');
const directPositive=await currentWithCloudEc({cloudEc:35,directEc:45});
assert.equal(directPositive.soil_ec_us_cm,45,'real positive gateway reading takes priority');

// Regression for the production fault: a gateway packet overwrites the shared
// latest_payload_v1 JSON, but MUST NOT erase saved, timestamped cloud-only EC.
async function savedCloudEcCase({cloudEc=20,cloudAge=90,gatewayEc=0}={}) {
  const now=Math.floor(Date.now()/1000);
  const weather={...reading,epoch:now-120,soil_channel:1,soil_ec_us_cm:gatewayEc,
    soil_moisture_pct:51,soil_temperature_c:12.2};
  const gateway={channel:1,ec_us_cm:gatewayEc,moisture_pct:51,
    temperature_c:12.2,received_epoch:now-55};
  const cloud={ec_us_cm:cloudEc,observed_epoch:now-cloudAge,source:'ecowitt_cloud_api_ch1'};
  const status={received_epoch:now-55,wh52_detected:true,channel:1,
    fields_received:{moisture:true,temperature:true,conductivity:true}};
  const DB={prepare(sql){let args=[];return {
    bind(...a){args=a;return this;},
    async all(){return {results:[]};},
    async first(){
      if(sql.includes('SELECT epoch, received_at'))return weather;
      if(sql.includes('SELECT value FROM')&&args[0]==='wh52_gateway_latest_v1')return {value:JSON.stringify(gateway)};
      if(sql.includes('SELECT value FROM')&&args[0]==='wh52_cloud_ec_latest_v1')return {value:JSON.stringify(cloud)};
      if(sql.includes('SELECT value FROM')&&args[0]==='wh52_gateway_status_v1')return {value:JSON.stringify(status)};
      // Shared gateway payload contains no cloud-specific branch.
      if(sql.includes('SELECT epoch, raw_json FROM latest_payload_v1'))return {epoch:now-5,raw_json:JSON.stringify({soil_ec1:0})};
      return null;
    },async run(){return {success:true}}
  }}};
  let response=await worker.fetch(new Request('https://worker.test/current'),{DB},{waitUntil(){}});
  assert.equal(response.status,200);
  const current=await response.json();
  response=await worker.fetch(new Request('https://worker.test/soil-status'),{DB},{waitUntil(){}});
  assert.equal(response.status,200);
  return {current,status:await response.json()};
}
const cloudSeparate=await savedCloudEcCase();
assert.equal(cloudSeparate.current.soil_ec_us_cm,20,'dedicated cloud record must survive a gateway overwrite');
assert.equal(cloudSeparate.current.soil_ec_reading_source,'ecowitt_cloud_ch1');
assert.equal(cloudSeparate.status.gateway_conductivity_us_cm,0);
assert.equal(cloudSeparate.status.cloud_conductivity_us_cm,20);
assert.equal(cloudSeparate.status.conductivity_comparison,'gateway_zero_cloud_positive');
const cloudExpired=await savedCloudEcCase({cloudAge:900});
assert.equal(cloudExpired.current.soil_ec_us_cm,0,'old dedicated cloud metadata is not a current measurement');
assert.equal(cloudExpired.status.cloud_conductivity_us_cm,null);
const gatewayWins=await savedCloudEcCase({gatewayEc:30});
assert.equal(gatewayWins.current.soil_ec_us_cm,30,'fresh gateway EC remains preferred');

console.log('PASS: admin authentication, current readings and WH52 cloud EC recovery bypass migrations; invalid keys fail and timestamps remain current.');
