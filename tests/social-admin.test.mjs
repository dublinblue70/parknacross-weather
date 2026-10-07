import fs from 'node:fs';import vm from 'node:vm';import a from 'node:assert/strict';
const src=fs.readFileSync(new URL('../social-admin.js',import.meta.url),'utf8');
function makeEl(){return {hidden:true,textContent:'',dataset:{},children:[],events:{},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},addEventListener(n,f){this.events[n]=f},removeAttribute(n){delete this[n]}};}
const els=new Map();const el=id=>{if(!els.has(id))els.set(id,makeEl());return els.get(id)};
const document={hidden:false,getElementById:el,createElement:makeEl,addEventListener(){}};
const values=new Map([['parknacrossAdminKey','test-only']]);const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
let requests=[];
const status={day:'2026-10-07',checked_at:new Date().toISOString(),networks:{facebook:{state:'published',label:'Published',text:'Saved Facebook copy',public_url:'https://www.facebook.com/post/1'},x:{state:'missed',label:'Not confirmed',public_url:'javascript:alert(1)'}},notice:{key:'day:x',message:'X needs attention'}};
const preview={facebookText:'New preview',xText:'X preview',observation:{epoch:Date.now()/1000},observation_age_minutes:1,photo:null};
const ctx={document,window:{addEventListener(){},prompt:()=>{throw Error('Should reuse existing key')}},location:{search:'?admin=1'},URLSearchParams,URL,Date,AbortSignal,sessionStorage:storage,localStorage:storage,setInterval(){},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.endsWith('/social-dashboard')?status:preview}}};
vm.runInNewContext(src,ctx);
(async()=>{await new Promise(r=>setImmediate(r));a.equal(el('socialAdminPanel').hidden,false);a.equal(el('socialAdminNotice').hidden,false);a.equal(el('socialAdminNotice').textContent,'X needs attention');a.equal(el('socialAdminNetworks').children[0].children.at(-1).href,'https://www.facebook.com/post/1');a.equal(el('socialAdminNetworks').children[1].children.length,2,'invalid post link is omitted');
 a.equal(el('socialAdminXText').textContent,'X preview','preview loads automatically with stored key');
 const count=requests.length;el('socialAdminPreview').open=true;await el('socialAdminPreview').events.toggle();await new Promise(r=>setImmediate(r));a.ok(requests.length>count,'opening preview fetches its content');
 await el('socialAdminRefresh').events.click();a.equal(el('socialAdminPreview').open,true);a.equal(el('socialAdminFacebookText').textContent,'Saved Facebook copy');a.equal(el('socialAdminXText').textContent,'X preview');a.equal(el('socialAdminPhoto').hidden,true);a.match(el('socialAdminPhotoNote').textContent,/text only/);a.ok(requests.every(x=>!x.options.method&&!x.options.body),'preview/status do not publish');
 let normalCalls=0;vm.runInNewContext(src,{...ctx,location:{search:''},fetch:()=>{normalCalls++;throw Error('Public visitor must not fetch private details')}});a.equal(normalCalls,0);
 console.log('PASS: private admin panel, confirmed post links, rejected unsafe links, saved-vs-preview text, photo absence, read-only requests, no private fetches for ordinary visitors.');
})().catch(e=>{console.error(e);process.exitCode=1});
