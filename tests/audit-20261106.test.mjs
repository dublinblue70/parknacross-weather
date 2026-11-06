import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=name=>fs.readFileSync(new URL("../"+name,import.meta.url),"utf8");
const packageVersion=JSON.parse(read("package.json")).version;
const admin=read("admin.html"),sw=read("service-worker.js"),app=read("app.js");
const status=read("status.js"),index=read("index.html"),downloads=read("downloads.js");
assert.equal(packageVersion,"38.4.250");
assert.match(admin,new RegExp("Admin interface "+packageVersion.replaceAll(".","\\.")));
assert.match(sw,/parknacross-v38-4-250-soil-baseline/);
assert.match(app,/2026-09-28T00:00:00\+01:00/);
assert.match(app,/A normal gateway packet without soil fields is not evidence/);
assert.match(status,/A recent successful WH52 receipt remains valid/);
assert.match(index,/Jump to weather information/);
assert.match(index,/href="#soilPanel"/);
assert.match(downloads,/five-minute readings \(estimate; use Preview/);
for(const path of ["app.js","status.js","downloads.js","service-worker.js"]){
  assert.doesNotThrow(()=>new vm.Script(read(path),{filename:path}),path+" must parse");
}
console.log("PASS: v"+packageVersion+" audit fixes, version parity, and JavaScript syntax");
