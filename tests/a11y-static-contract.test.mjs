import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
for(const id of ['archiveHeatmap','archiveCalendar']){
 const tag=read('history.html').match(new RegExp('<div\\s+id="'+id+'"[\\s\\S]*?>'))?.[0];
 assert.ok(tag&&tag.includes('role="group"'),id+' must expose an accessible named group');
}
assert.match(read('sky.html'),/id="publicPhotoCalendar"[^>]*role="group"/);
assert.doesNotMatch(read('station.html'),/<g class="station-drawing-rain"[^>]*aria-label/);
assert.doesNotMatch(read('install.html'),/class="pwa-diagnostic" role="listitem"/);
assert.match(read('audit/axe-browser-audit.mjs'),/ACCESSIBILITY_AUDIT_FAILED/);
console.log('PASS: accessible calendar groups, SVG semantics and enforceable audit gate.');
