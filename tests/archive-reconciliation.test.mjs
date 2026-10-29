import assert from 'node:assert/strict';
import {archiveDiscrepancies} from '../public-monitor.mjs';

const now=Date.parse('2026-10-29T14:00:00Z');
const stats={
 wettest_day:{day:'2026-10-22',rain_mm:12.8},
 records:{high_temperature:{value:16.2},peak_gust:{value:51}}
};
const daily={days:[
 {day:'2026-10-22',rain_mm:12.8,high_c:16.2,peak_gust_kmh:51},
 {day:'2026-10-28',rain_mm:0,high_c:12,peak_gust_kmh:15},
 {day:'2026-10-29',rain_mm:99,high_c:99,peak_gust_kmh:99}
]};
assert.deepEqual(archiveDiscrepancies(stats,daily,now),[],'Exclude ongoing Irish day');
const stale={...stats,wettest_day:{day:'2026-10-01',rain_mm:6.6},records:{high_temperature:{value:14},peak_gust:{value:38}}};
const issues=archiveDiscrepancies(stale,daily,now);
assert.equal(issues.length,3);
assert.match(issues[0],/12.8.*2026-10-22.*6.6/);
assert.match(issues[1],/16.2/);
assert.match(issues[2],/51/);
assert.deepEqual(archiveDiscrepancies({}, {days:[]},now),[]);
console.log('PASS: completed-day rain, temperature and gust records reconcile; current partial day excluded.');
