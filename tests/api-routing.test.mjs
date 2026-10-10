import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../site-request.js',import.meta.url),'utf8');
const original='https://parknacross-weather.dave-s-carter.workers.dev',custom='https://api.parknacrossweather.ie';
let requests=[],mode='ok';
const window={PARKNACROSS_API_ROUTING:{customBase:custom,fallbackBase:original},fetch:async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url);requests.push({url,method:init.method||input.method||'GET'});
 if(url.origin===custom){if(mode==='network')throw Error('Unavailable');if(mode==='server')return new Response('{}',{status:503});if(mode==='auth')return new Response('{}',{status:401});}
 return new Response('{}',{headers:{'Content-Type':'application/json'}});
}};
vm.runInNewContext(source,{window,location:{href:'https://parknacrossweather.ie/'},URL,Request,Response,AbortController,setTimeout,clearTimeout});
await window.fetch(original+'/current');assert.equal(requests.at(-1).url.origin,custom);
mode='network';requests=[];await window.fetch(original+'/history?hours=24');assert.equal(requests.length,2);assert.equal(requests[1].url.origin,original);assert.equal(requests[0].url.searchParams.get('_window'),requests[1].url.searchParams.get('_window'));
mode='server';requests=[];await window.fetch(new Request(custom+'/current'));assert.equal(requests.length,2);
mode='auth';requests=[];assert.equal((await window.fetch(custom+'/admin/capabilities')).status,401);assert.equal(requests.length,1);
mode='network';requests=[];await assert.rejects(window.fetch(custom+'/weather-window/sky',{method:'POST',body:'{}'}));assert.equal(requests.length,1,'never duplicate a write');
mode='ok';requests=[];await window.fetch('https://example.test/current');assert.equal(requests[0].url.origin,'https://example.test');
console.log('PASS: custom API routing, read fallback, rolling archive cache keys, Request inputs, auth errors and write protection.');
