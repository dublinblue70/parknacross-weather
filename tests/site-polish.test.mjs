import { readFile, readdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = await readdir(root);
const htmls = files.filter(file => file.endsWith(".html") && !["offline.html","intelligence.html"].includes(file));
for(const file of htmls){
 const html=await readFile(join(root,file),"utf8");
 assert.match(html,/site-polish\.css\?v=/,file+" lacks shared design stylesheet");
 assert.match(html,/site-polish\.js\?v=/,file+" lacks UX enhancements");
 assert.doesNotMatch(html,/<script[^>]+src="exposure-history\.js/,file+" references an absent editor");
}
const sw=await readFile(join(root,"service-worker.js"),"utf8");
const src=sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\]/)?.[1]||"";
for(const match of src.matchAll(/"\.(\/[^"]+)"/g)){
 await access(join(root,match[1]));
}
assert.doesNotMatch(src,/exposure-history\.js/,"missing script should not be pre-cached");
assert.match(sw,/Array\.from\(\{length:Math\.min\(12,orderedAssets\.length\)\}/,
 "cache should use bounded concurrency");
const css=await readFile(join(root,"site-polish.css"),"utf8");
assert.match(css,/--ui-font/);
assert.match(css,/@media\(max-width:700px\)/);
const networks=await readFile(join(root,"networks.html"),"utf8");
assert.match(networks,/aria-label="View on Weather Underground/, "Other Networks link must have a readable accessible name");
const admin=await readFile(join(root,"admin.html"),"utf8");
const release=JSON.parse(await readFile(join(root,"package.json"),"utf8")).version;
assert.ok(admin.includes("Admin interface "+release), "Admin release label must match site version");
const lunar=await readFile(join(root,"site-polish.css"),"utf8");
assert.match(lunar,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/, "moon phases must have 4 mobile tracks");
console.log("Site-wide visual and asset checks passed for "+htmls.length+" pages.");
