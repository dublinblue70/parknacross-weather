import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=read('_worker/worker.mjs'),backend=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {parseWeatherWarningFallback};').toString('base64'));
const before='<nav>Weather Warnings &amp; Advisories</nav><h2>Weather Warnings</h2>',after='<h2>Marine Warnings</h2><h3>Status Yellow - Marine gale</h3><h2>Environmental Advisories</h2><h3>Currently no warnings in operation.</h3>',ni='<p>Northern Ireland Warnings</p><h3>Yellow - Wind Warning for Antrim, Derry</h3><p>Strong wind.</p><p>Valid: 03:00 Tuesday 27/10/2026 to 21:00 Tuesday 27/10/2026</p>',local='<h3>Status Yellow - Rain warning for Wexford</h3><p>Heavy rain.</p><p>Valid: 16:00 Thursday 08/10/2099 to 04:00 Friday 09/10/2099</p>';
assert.deepEqual(backend.parseWeatherWarningFallback(before+ni+after),[]);
assert.equal(backend.parseWeatherWarningFallback(before+ni+local+after).length,1);
assert.equal(backend.parseWeatherWarningFallback(before+ni+local+after)[0].onset,'2099-10-08T15:00:00.000Z');
assert.deepEqual(backend.parseWeatherWarningFallback(before+'<h3>Currently no warnings in operation.</h3>'+after),[]);
assert.throws(()=>backend.parseWeatherWarningFallback('<nav>Weather Warnings</nav>'+ni+after),/section missing/);
assert.throws(()=>backend.parseWeatherWarningFallback(before+'<p>Service unavailable.</p>'+after),/could not be verified/);
// Exercise the real browser parser and request fallback with a detached-template fixture.
const document={createElement(){let html='';return {set innerHTML(v){html=v;},get content(){return {textContent:html.replace(/<[^>]+>/g,''),querySelectorAll:()=>[]};}};}};
const window={fetch:async url=>String(url).includes('.workers.dev')?new Response('{}',{status:503}):new Response(before+ni+after,{headers:{'Content-Type':'text/html'}})};
const context={window,document,Date,Intl,URL,Request,Response,AbortController,setTimeout,clearTimeout,location:{href:'https://parknacrossweather.ie/status.html'}};vm.createContext(context);vm.runInContext(read('weather-warnings.js'),context);assert.equal(window.ParknacrossWarnings.parseBulletin(before+ni+after).length,0);assert.equal(window.ParknacrossWarnings.parseBulletin(before+ni+local+after).length,1);
vm.runInContext(read('site-request.js'),context);const response=await window.fetch('https://parknacross-weather.dave-s-carter.workers.dev/met/warnings');assert.equal(response.status,200);const data=await response.json();assert.equal(data.county,'Wexford');assert.equal(data.warnings.length,0);assert.equal(data.source,'https://www.met.ie/warnings-today.html');
console.log('PASS: Northern Ireland-only bulletins, navigation isolation, mixed-county warnings, validity times, explicit empty bulletins, malformed pages and browser recovery after API 503.');
