import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const statusCtx={window:{},document:{addEventListener(){}},Date,Intl,Number,Math};
vm.createContext(statusCtx);vm.runInContext(source('status.js'),statusCtx);
const nowArchive=Math.floor(Date.now()/1000);
const archiveSlots=[
  Math.floor((nowArchive-20*60)/300)*300,
  Math.floor((nowArchive-15*60)/300)*300,
  Math.floor((nowArchive-15*60)/300)*300+10,
  Math.floor(nowArchive/300)*300
];
const archiveStatus=statusCtx.summarizeRecentArchive({
  readings:archiveSlots.map(epoch=>({epoch}))
},nowArchive);
assert.equal(archiveStatus.samples_last_24h,3,'duplicate five-minute slots cannot inflate archive count');
assert.equal(archiveStatus.largest_recent_gap_minutes,15,'missing five-minute slots must still be identified');
assert.equal(statusCtx.summarizeRecentArchive({__error:new Error('offline')}),null,
  'failed source is not evidence of lost archive readings');
assert.equal(statusCtx.summarizeRecentArchive({readings:[]}).samples_last_24h,0,
  'a verified empty archive must not be mistaken for an unknown source');
const statusSource=source('status.js');
assert.match(statusSource,/historyArchive\|\|\(!quality\.__error\?quality:null\)/,
  'quality timeout must fall back to independent saved history');
assert.match(statusSource,/setBadge\("cahoreBadge",current\?"good":"info"/,
  'external OPW delays are informational, not a station fault');
assert.equal(statusCtx.describeWs90Battery({}).state,'info','missing battery telemetry is not a low-battery fault');
const now=new Date().toISOString(),old=new Date(Date.now()-3600000).toISOString();
assert.equal(statusCtx.describeWs90Battery({battery_voltage_v:3.12,battery_first_seen_at:old,battery_last_reported_at:old}).state,'info','stale voltage is information only');
assert.equal(statusCtx.describeWs90Battery({battery_voltage_v:3.12,battery_first_seen_at:old,battery_last_reported_at:now}).state,'good');
assert.equal(statusCtx.describeWs90Battery({battery_voltage_v:2.65,battery_first_seen_at:old,battery_last_reported_at:now}).state,'warn','verified low voltage still needs attention');
const scripts=source('status-ui.js');
assert.match(scripts,/classList\.contains\('info'\)/);
assert.match(scripts,/informational\.push\(card\)/);
assert.doesNotMatch(scripts,/for\(const card of issues[\s\S]*guidanceText\[1\]/,'the attention list should not duplicate large guidance paragraphs');
const storage=new Map(),events=new Map(),nodes=new Map();
const node=id=>{
 if(!nodes.has(id))nodes.set(id,{textContent:'',checked:false,value:'',setAttribute(key,value){this[key]=value;},addEventListener(event,fn){this[event]=fn;}});
 return nodes.get(id);
};
const window={Notification:{permission:'denied'},addEventListener() {},dispatchEvent(){}};
const alertCtx={window,document:{getElementById:node,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Notification:window.Notification,Date,Intl,Number,Math,Set,console};
vm.createContext(alertCtx);vm.runInContext(source('alert-settings.js'),alertCtx);
window.PWAlerts.saveSettings({enabled:true,explicitlyDisabled:false,rainStart:true});
window.PWAlerts.refreshUI();
assert.equal(node('alertsEnableButton').textContent,'Check notification permission','permission loss must not appear as a saved opt-out');
assert.equal(node('alertsEnableButton')['aria-pressed'],'true');
assert.equal(window.PWAlerts.loadSettings().enabled,true);
await node('alertsEnableButton').click();
assert.equal(window.PWAlerts.loadSettings().enabled,true,'blocked permission must not reset the saved preference');
window.Notification.permission='granted';
window.PWAlerts.refreshUI();
assert.equal(node('alertsEnableButton').textContent,'Turn off notifications');
await node('alertsEnableButton').click();
assert.equal(window.PWAlerts.loadSettings().enabled,false);
assert.equal(window.PWAlerts.loadSettings().explicitlyDisabled,true,'only an explicit user choice should mark an opt-out');
console.log('PASS: stale/missing telemetry is informational, low-battery checks remain actionable, and notification opt-in survives permission interruption.');
