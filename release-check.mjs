import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.dirname(new URL(import.meta.url).pathname),manifest=process.argv[2]?new Set(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))):null;
const exists=p=>fs.existsSync(path.join(root,p))||manifest?.has(p);
const html=fs.readdirSync(root).filter(n=>n.endsWith('.html'));
for(const file of html){const text=fs.readFileSync(path.join(root,file),'utf8');const ids=[...text.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate IDs in '+file);
 for(const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)){const url=match[1];if(/^(?:https?:|data:|mailto:|tel:|#|\/\/)/.test(url))continue;const asset=decodeURIComponent(url.split(/[?#]/)[0]);if(!asset)continue;assert.ok(exists(path.normalize(asset)),file+' references missing '+asset);}
}
for(const file of fs.readdirSync(root).filter(n=>n.endsWith('.js')&&!/^(worker|cloudflare|Parknacross)/.test(n)))execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');for(const match of sw.split('self.addEventListener("install"')[0].matchAll(/"\.\/([^"']+)"/g))assert.ok(exists(match[1]),'Offline cache references missing '+match[1]);
for(const file of ['dashboard-preferences.js','chart-explorer.js','history-links.js','public-photo-calendar.js','action-feedback.js','website-usability.css'])assert.ok(sw.includes('./'+file),'Offline cache must include '+file);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;assert.ok(sw.includes('v'+version.replaceAll('.','-')),'Release version differs from offline cache');
console.log('PASS: '+html.length+' pages, local links/assets, unique IDs, JavaScript syntax, offline assets and release version.');

const adminInline=fs.readFileSync(new URL('./admin.html',import.meta.url),'utf8').match(/<script id="adminAppScript">([\s\S]*?)<\/script>/)?.[1];
if(!adminInline||adminInline.trim()!== (fs.readFileSync(new URL('./admin-tools.js',import.meta.url),'utf8')+'\nwindow.ParknacrossAdminStarted=true;').trim())throw Error('Admin inline controller must match admin-tools.js');
