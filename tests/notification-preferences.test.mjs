import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const alerts=fs.readFileSync(new URL('../alert-settings.js',import.meta.url),'utf8'),background=fs.readFileSync(new URL('../background-alerts.js',import.meta.url),'utf8'),key='parknacross.alerts.settings.v1';
class Node{constructor(){this.checked=false;this.value='';this.textContent='';this.events={};this.children=[];}addEventListener(n,f){(this.events[n]??=[]).push(f)}setAttribute(){}append(n){this.children.push(n)}replaceChildren(){this.children=[]}async fire(type){for(const f of this.events[type]||[])await f({target:this});}}
function fixture(store=new Map()){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},events={},docEvents={};let blocked=false,permission='granted',requestPermission=async()=>permission;
 const Notification={get permission(){return permission;},requestPermission:()=>requestPermission()},window={Notification,PushManager:class{},addEventListener(n,f){(events[n]??=[]).push(f)},dispatchEvent(e){for(const f of events[e.type]||[])f(e)}};
 const context={window,Notification,document:{getElementById:get,addEventListener(n,f){(docEvents[n]??=[]).push(f)},createElement:()=>new Node(),createTextNode:text=>({textContent:text})},localStorage:{getItem:k=>{if(blocked)throw Error('storage blocked');return store.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('storage blocked');store.set(k,v);}},navigator:{},Date,Intl,console,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},Number,Math,Object,JSON,Set,String,Promise,AbortSignal,Uint8Array,atob};
 vm.createContext(context);vm.runInContext(alerts,context);
 return {context,window,nodes,get,store,docEvents,setBlocked:v=>blocked=v,setPermission:v=>permission=v,setPermissionRequest:f=>requestPermission=f,async choose(id,value){const n=get(id);if(typeof value==='boolean')n.checked=value;else n.value=String(value);await n.fire('change');}};
}
const a=fixture();for(const id of ['alertRainStart','alertGust','alertFrost','alertHeavyRain'])await a.choose(id,true);await a.choose('alertLightningDistance',25);await a.choose('alertGustThreshold',35);await a.choose('alertQuietEnabled',true);a.window.PWAlerts.saveSettings({enabled:true});
let saved=a.window.PWAlerts.loadSettings();assert.equal(saved.rainStart,true);assert.equal(saved.lightningKm,25);assert.equal(saved.gustKmh,35);assert.equal(saved.quietEnabled,true);
const reload=fixture(a.store);for(const id of ['alertRainStart','alertGust','alertFrost','alertHeavyRain','alertQuietEnabled'])assert.equal(reload.get(id).checked,true,id+' survives a reload');assert.equal(reload.get('alertLightningDistance').value,'25');assert.equal(reload.get('alertGustThreshold').value,'35');
// A permission prompt may finish after selections have changed.
const permission=fixture();permission.setPermission('default');let resolvePermission;permission.setPermissionRequest(()=>new Promise(r=>resolvePermission=r));const enabling=permission.get('alertsEnableButton').fire('click');await permission.choose('alertRainStart',true);await permission.choose('alertLightningDistance',40);permission.setPermission('granted');resolvePermission('granted');await enabling;assert.equal(permission.window.PWAlerts.loadSettings().rainStart,true);assert.equal(permission.get('alertLightningDistance').value,'40');
// Failed storage must retain the current page choices and explain their lifetime.
a.setBlocked(true);await a.choose('alertRainStart',false);a.window.PWAlerts.refreshUI();assert.equal(a.get('alertRainStart').checked,false);assert.match(a.get('alertsSaveStatus').textContent,/could not save.*this page only/);a.setBlocked(false);await a.choose('alertGust',false);assert.equal(JSON.parse(a.store.get(key)).rainStart,false);assert.match(a.get('alertsSaveStatus').textContent,/Saved automatically/i);
// An in-flight background subscription may not overwrite newer device choices.
const b=fixture();let releaseSave,saveStarted;const started=new Promise(r=>saveStarted=r),pendingSave=new Promise(r=>releaseSave=r),requests=[];let first=true;
const sub={toJSON:()=>({endpoint:'https://push.test/fixture',keys:{}}),unsubscribe:async()=>true};b.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>sub,subscribe:async()=>sub}})};
b.context.fetch=async(url,options)=>{if(url.endsWith('/push/public-key'))return {ok:true,json:async()=>({available:true,public_key:'AA'})};const body=JSON.parse(options.body);requests.push(body);if(body.action==='save'&&first){first=false;saveStarted();await pendingSave;}return {ok:true,json:async()=>({management_token:'fixture-token',history:[]})};};
vm.runInContext(background,b.context);for(const f of b.docEvents.DOMContentLoaded||[])f();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
const enablingBackground=b.get('backgroundAlertToggle').fire('click');await started;await b.choose('alertHeavyRain',true);await b.choose('alertLightningDistance',15);await b.choose('alertRainThreshold',7);releaseSave();await enablingBackground;await b.window.PWBackgroundAlerts.sync();
saved=b.window.PWAlerts.loadSettings();assert.equal(saved.enabled,true);assert.equal(saved.heavyRain,true);assert.equal(saved.lightningKm,15);assert.equal(saved.heavyRainRate,7);const last=requests.filter(r=>r.action==='save').at(-1).preferences;assert.equal(last.heavyRain,true);assert.equal(last.lightningKm,15);assert.equal(last.heavyRainRate,7);
console.log('PASS: selections survive reload, partial updates, permission and background-save races; storage failures are explicit and recoverable.');
// Expired browser subscriptions reconnect without clearing choices or the opt-in.
const c=fixture(new Map([[key,JSON.stringify({enabled:true,rainStart:true,gust:true,gustKmh:35})],['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'old-token'})]]));
let currentSub=null,reconnections=0;const recoveredRequests=[];
c.context.setTimeout=(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;};
c.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>currentSub,subscribe:async()=>{reconnections++;currentSub=sub;return sub;}}})};
c.context.fetch=async(url,options)=>{if(url.endsWith('/push/public-key'))return {ok:true,json:async()=>({available:true,public_key:'AA'})};recoveredRequests.push(JSON.parse(options.body));return {ok:true,json:async()=>({active:true,management_token:'renewed-token',history:[]})};};
vm.runInContext(background,c.context);assert.equal(await c.window.PWBackgroundAlerts.reconcile(),true);assert.equal(reconnections,1);assert.equal(c.window.PWBackgroundAlerts.isActive(),true);assert.equal(c.window.PWAlerts.loadSettings().gustKmh,35);assert.equal(recoveredRequests[0].preferences.rainStart,true);assert.equal(JSON.parse(c.store.get('parknacross:background-alerts:v1')).token,'renewed-token');
// A failed renewal keeps the opt-in and settings; it must not reset to disabled.
currentSub=null;c.context.fetch=async()=>{throw Error('offline');};assert.equal(await c.window.PWBackgroundAlerts.reconcile(),false);assert.equal(JSON.parse(c.store.get('parknacross:background-alerts:v1')).active,true);assert.equal(c.window.PWAlerts.loadSettings().enabled,true);assert.equal(c.window.PWAlerts.loadSettings().gustKmh,35);
console.log('PASS: missing subscriptions reconnect automatically; offline renewal preserves opt-in and selected thresholds.');
// Turning alerts off during an automatic renewal must win over its late response.
const d=fixture(new Map([[key,JSON.stringify({enabled:true,rainStart:true})],['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'old-token'})]]));let finishRenewal,renewalStarted;const beganRenewal=new Promise(r=>renewalStarted=r),renewalReply=new Promise(r=>finishRenewal=r),actions=[];d.context.setTimeout=c.context.setTimeout;d.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:async()=>sub}})};d.context.fetch=async(url,options)=>{if(url.endsWith('/push/public-key'))return {ok:true,json:async()=>({available:true,public_key:'AA'})};const action=JSON.parse(options.body).action;actions.push(action);if(action==='save'){renewalStarted();await renewalReply;}return {ok:true,json:async()=>({active:true,management_token:'new-token'})};};vm.runInContext(background,d.context);const renewing=d.window.PWBackgroundAlerts.reconcile();await beganRenewal;d.window.PWAlerts.saveSettings({enabled:false});finishRenewal();await renewing;assert.equal(d.window.PWBackgroundAlerts.isActive(),false);assert.equal(d.window.PWAlerts.loadSettings().enabled,false);assert.ok(actions.includes('remove'),'late renewed server subscription is removed after explicit disable');
console.log('PASS: explicit disable wins over an automatic renewal in flight.');
// When only device choices are missing, recover the authenticated subscription's
// saved preferences; an explicit disabled settings record is never overwritten.
const e=fixture(new Map([['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'owned-token'})]]));e.context.setTimeout=c.context.setTimeout;e.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})};e.context.fetch=async()=>({ok:true,json:async()=>({active:true,preferences:{rainStart:true,gust:true,gustKmh:45,lightningKm:25}})});vm.runInContext(background,e.context);await e.window.PWBackgroundAlerts.reconcile();assert.equal(e.window.PWAlerts.loadSettings().enabled,true);assert.equal(e.window.PWAlerts.loadSettings().gustKmh,45);assert.equal(e.get('alertRainStart').checked,true);e.window.PWAlerts.saveSettings({enabled:false,gustKmh:55});await e.window.PWBackgroundAlerts.reconcile();assert.equal(e.window.PWAlerts.loadSettings().enabled,false);assert.equal(e.window.PWAlerts.loadSettings().gustKmh,55);
console.log('PASS: missing device choices recover from an owned server subscription; explicit off settings are preserved.');


// A routine update may expose an expired server management token. It must not
// unsubscribe the still-valid browser endpoint without an explicit repair.
const f=fixture(new Map([[key,JSON.stringify({enabled:true,rainStart:true})],['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'previous-token'})]]));
let removedOnVerification=0;
const subscribed={toJSON:sub.toJSON,unsubscribe:async()=>{removedOnVerification++;return true;}};
f.context.setTimeout=c.context.setTimeout;
f.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>subscribed}})};
f.context.fetch=async()=>({ok:false,status:401,json:async()=>({error:'Subscription ownership could not be verified'})});
vm.runInContext(background,f.context);
assert.equal(await f.window.PWBackgroundAlerts.reconcile(),false);
assert.equal(removedOnVerification,0,'reconciliation must not unsubscribe on a 401 response');
assert.equal(JSON.parse(f.store.get('parknacross:background-alerts:v1')).active,true);
assert.equal(f.window.PWAlerts.loadSettings().enabled,true);
console.log('PASS: a server verification failure leaves the browser subscription and opt-in intact.');

// Changing a threshold must never implicitly turn off an existing subscription
// just because the device-level switch is currently off or being restored.
const g=fixture(new Map([[key,JSON.stringify({enabled:false,gust:true,gustKmh:35})],['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'owned-token'})]]));
let accidentalStops=0;const activity=[];
const existing={toJSON:sub.toJSON,unsubscribe:async()=>{accidentalStops++;return true;}};
g.context.setTimeout=c.context.setTimeout;
g.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>existing}})};
g.context.fetch=async(url,options)=>{
 if(url.endsWith('/push/public-key'))return {ok:true,json:async()=>({available:true,public_key:'AA'})};
 const action=JSON.parse(options.body).action;activity.push(action);
 return {ok:true,json:async()=>({active:true,management_token:'owned-token',history:[]})};
};
vm.runInContext(background,g.context);
for(const callback of g.docEvents.DOMContentLoaded||[])callback();
await g.window.PWBackgroundAlerts.reconcile();
g.window.PWAlerts.saveSettings({gustKmh:47});
await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
assert.equal(accidentalStops,0,'ordinary settings changes must never unsubscribe');
assert.equal(activity.includes('remove'),false,'ordinary settings changes must never remove a server subscription');
assert.equal(JSON.parse(g.store.get('parknacross:background-alerts:v1')).active,true);
console.log('PASS: ordinary preference edits cannot disable background notifications.');

 
// Regression: a legacy/default false record must not override a saved active
// background subscription. Actual explicit off remains authoritative.
const h=fixture(new Map([[key,JSON.stringify({enabled:false,explicitlyDisabled:false,gust:true,gustKmh:42})],['parknacross:background-alerts:v1',JSON.stringify({active:true,token:'owned-token'})]]));
h.context.setTimeout=c.context.setTimeout;
h.context.navigator.serviceWorker={ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})};
h.context.fetch=async()=>({ok:true,json:async()=>({active:true,preferences:{rainStart:true,gustKmh:50}})});
assert.equal(h.window.PWAlerts.loadSettings().enabled,true,'saved background consent restores legacy false before network verification');
vm.runInContext(background,h.context);
await h.window.PWBackgroundAlerts.reconcile();
assert.equal(JSON.parse(h.store.get(key)).enabled,true,'verified consent is repaired in persistent settings');
assert.equal(h.window.PWAlerts.loadSettings().gustKmh,42,'locally selected thresholds are preserved');
assert.equal(h.window.PWAlerts.loadSettings().rainStart,true,'missing preferences are recovered from the subscription');
h.window.PWAlerts.saveSettings({enabled:false});
await h.window.PWBackgroundAlerts.reconcile();
assert.equal(h.window.PWAlerts.loadSettings().enabled,false,'explicit off is not silently overridden');
assert.equal(h.window.PWAlerts.loadSettings().explicitlyDisabled,true);
console.log('PASS: stale false records recover from active background consent; explicit off remains durable.');
