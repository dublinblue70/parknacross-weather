import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../rain-status.js",import.meta.url),"utf8");
const context={window:{},Intl,Date,Number,Array,Math,Infinity};
vm.runInNewContext(source,context);
const evaluate=context.window.ParknacrossRainStatus.evaluate;
const now=Date.parse("2026-11-16T14:00:00Z");
const reading=(ageSeconds,rate,total=1,extras={})=>({epoch:(now-ageSeconds*1000)/1000,rain_rate_mm_h:rate,rain_daily_mm:total,...extras});
const current=reading(20,3);
assert.equal(evaluate(current,[],{now}).status,"measured");
assert.equal(evaluate(current,[],{now}).isRaining,true);
assert.equal(evaluate(reading(20,0,1),[],{now}).status,"no_current_rain");
assert.equal(evaluate(reading(500,3),[],{now}).status,"unavailable");
assert.equal(evaluate(reading(-180,3),[],{now}).status,"unavailable");
const yesterday=reading(20,0,1,{piezo_rain_rate_mm_h:3,piezo_observed_epoch:(now-20_000)/1000});
assert.equal(evaluate(yesterday,[],{now}).status,"sensor_disagreement");
assert.equal(evaluate(reading(20,0,1,{piezo_rain_rate_mm_h:0.5,piezo_observed_epoch:(now-20_000)/1000}),[],{now}).status,"possible");
const h=[reading(240,0,0.8),reading(140,0,1)];
const recently=evaluate(reading(20,0,1),h,{now});
assert.equal(recently.status,"recent");
assert.equal(recently.isRaining,false,"A recent WH40H bucket tip does NOT confirm rain falling now");
assert.equal(evaluate(reading(20,0,1),[reading(1400,0,1)],{now}).status,"no_current_rain");
assert.equal(evaluate(reading(20,0,1,{piezo_rain_rate_mm_h:5,piezo_observed_epoch:(now-500_000)/1000}),[],{now}).status,"no_current_rain");
// A recorded daily total must never be mistaken for a live rain-rate reading.
const rateMissing=evaluate(reading(20,null,1),[],{now});
assert.equal(rateMissing.status,"rate_unavailable");
assert.equal(rateMissing.reason,"rate_missing");
assert.equal(rateMissing.dailyTotalAvailable,true);
assert.equal(rateMissing.rainAvailable,false);
const delayed=evaluate(reading(360,0,1),[],{now});
assert.equal(delayed.status,"unavailable");
assert.equal(delayed.reason,"stale_observation");
assert.equal(delayed.dailyTotalAvailable,true);
assert.equal(delayed.rainAvailable,false);
// A missing gauge rate is not evidence of disagreement with a fresh piezo signal.
assert.equal(evaluate(reading(20,null,1,{piezo_rain_rate_mm_h:4,piezo_observed_epoch:(now-20_000)/1000}),[],{now}).status,"possible");
// Heavy rain outside but WH40H currently reports 0: a fresh substantial WS90
// rain rate must override the misleading historical "Rain recently" label.
const freshPiezo=reading(20,0,1.1,{piezo_rain_rate_mm_h:7.5,piezo_daily_mm:2.4,piezo_observed_epoch:(now-20_000)/1000});
assert.equal(evaluate(freshPiezo,h,{now}).status,"sensor_disagreement");
assert.equal(evaluate(freshPiezo,h,{now}).rainIndicatedNow,true);
// Fresh weak piezo evidence also takes priority over older bucket tips, but
// it remains an unconfirmed possibility rather than a rain measurement.
const lightPiezo=reading(20,0,1.1,{piezo_rain_rate_mm_h:0.8,piezo_daily_mm:2.4,piezo_observed_epoch:(now-20_000)/1000});
assert.equal(evaluate(lightPiezo,h,{now}).status,"possible");
assert.equal(evaluate(lightPiezo,h,{now}).rainIndicatedNow,false,"Weak WS90-only signals must not trigger a rainy-scene assertion");
// An accumulated 2.4 mm piezo total alone does NOT prove ongoing rain.
const totalOnly=reading(20,0,1.1,{piezo_rain_rate_mm_h:0,piezo_daily_mm:2.4,piezo_observed_epoch:(now-20_000)/1000});
assert.equal(evaluate(totalOnly,[],{now,trackLive:false}).status,"no_current_rain");
// Track successive new observations, without inferring mm/h from totals.
function freshEvaluator(){const sandbox={window:{},Intl,Date,Number,Array,Math,Infinity};vm.runInNewContext(source,sandbox);return sandbox.window.ParknacrossRainStatus.evaluate;}
const trackBucket=freshEvaluator();
trackBucket(reading(110,0,1.0),[],{now});
const tip=trackBucket(reading(20,0,1.1),[],{now});
assert.equal(tip.status,"new_tip");
assert.equal(tip.rainIndicatedNow,true);
const trackPiezo=freshEvaluator();
trackPiezo(reading(110,0,1.1,{piezo_rain_rate_mm_h:0,piezo_daily_mm:2.0,piezo_observed_epoch:(now-110000)/1000}),[],{now});
const piezoIncrease=trackPiezo(reading(20,0,1.1,{piezo_rain_rate_mm_h:0,piezo_daily_mm:2.4,piezo_observed_epoch:(now-20000)/1000}),[],{now});
assert.equal(piezoIncrease.status,"possible");
assert.equal(piezoIncrease.piezoIncreaseRecent,true);
// Observation older than the freshness window is unavailable, even if its
// last rain rate was high and a previous rate would have been positive.
assert.equal(evaluate(reading(280,14,3),[],{now,trackLive:false}).status,"unavailable");
console.log("Shared rain-status regression tests passed.");
