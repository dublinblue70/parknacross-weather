import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../wind-rose.js',import.meta.url),'utf8'),context);const {distribution}=context.window.ParknacrossWindRose;
const end=1793116800,rows=Array.from({length:10},(_,i)=>({epoch:end-(10-i)*300,wind_direction_deg:0,wind_speed_kmh:i===9?20:8,wind_gust_kmh:27}));
const result=distribution(rows,{endEpoch:end,hours:24});assert.equal(result.meanSpeeds[0],9.2);assert.equal(result.bandCounts[1][0],9);assert.equal(result.bandCounts[2][0],1,'20 km/h interval remains visible despite a sub-15 direction average');assert.equal(result.bandPercentages[1][0],90);assert.equal(result.bandPercentages[2][0],10);assert.equal(result.maxSpeed,20);assert.equal(result.maxGust,27);assert.equal(result.percentages[0],100);
const speeds=[0,.9,1,4.9,5,14.9,15,24.9,25,39.9,40,50],bands=distribution(speeds.map((speed,i)=>({epoch:end-(speeds.length-i)*300,wind_direction_deg:90,wind_speed_kmh:speed})),{endEpoch:end,hours:24});assert.equal(bands.calm,2);assert.deepEqual(Array.from(bands.bandCounts,b=>b[4]),[2,2,2,2,2]);assert.equal(bands.bandPercentages.reduce((n,b)=>n+b[4],0),100);assert.equal(bands.maxGust,null);
const duplicate=distribution([...rows,...rows],{endEpoch:end,hours:24});assert.equal(duplicate.intervalCount,10);assert.equal(duplicate.bandCounts[2][0],1);
// The five speed bands and unit use all available card width, with responsive columns.
const css=fs.readFileSync(new URL('../wind-rose.css',import.meta.url),'utf8');
for(const page of ['index.html','graphs.html']){
  const html=fs.readFileSync(new URL('../'+page,import.meta.url),'utf8');
  assert.match(html,/wind-rose\\.css\\?v=20261115-full-width-legend/);
}
assert.match(css,/\.wind-rose-info \.wind-rose-legend\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
assert.match(css,/grid-template-columns: repeat\(3, minmax\(0,1fr\)\)/);
assert.match(css,/@media\(max-width:380px\)/);
assert.match(css,/justify-self:end/);
console.log('PASS: stronger intervals survive direction averaging, speed-band boundaries, calm exclusion, percentage totals, gust separation and duplicate slots.');
