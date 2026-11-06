import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=new URL("../",import.meta.url);
const files=fs.readdirSync(root).filter(name=>name.endsWith(".html"));
const existing=new Set(files);
let links=0;
for(const file of files){
  const html=fs.readFileSync(new URL(file,root),"utf8");
  if(["offline.html","intelligence.html"].includes(file))continue;
  assert.match(html,/<html[^>]*lang="en"/i,file+" language");
  assert.match(html,/<main\b/i,file+" main landmark");
  assert.equal((html.match(/<h1(?:\s[^>]*)?>/gi)||[]).length,1,file+" must have one h1");
  assert.match(html,/<meta\s+name="description"/i,file+" description");
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,file+" duplicate IDs");
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]),file+" missing #"+match[1]);
  for(const match of html.matchAll(/<img\b[^>]*>/gi))assert.match(match[0],/\balt=/i,file+" image missing alt");
  for(const match of html.matchAll(/href="([^"]+)"/g)){
    const href=match[1],destination=href.split(/[?#]/)[0];
    if(!destination.endsWith(".html")||/^https?:\/\//i.test(destination))continue;
    assert.ok(existing.has(path.posix.basename(destination)),file+" references missing page "+destination);
    links++;
  }
}
console.log("PASS: "+files.length+" HTML files inspected; "+links+" internal page references; landmarks, image alternatives, IDs and anchors checked.");
