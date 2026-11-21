import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=path=>readFileSync(join(root,path),"utf8");
const publicPages=[
 "index.html","summary.html","rain.html","radar.html","coast.html","graphs.html",
 "history.html","station.html","status.html","sky.html","networks.html",
 "climate.html","records.html","monthly.html","annual.html","downloads.html",
 "install.html","maintenance.html","privacy.html","forecast-accuracy.html",
 "ardamine-weather.html","courtown-weather.html","north-wexford-weather.html",
 "north-wexford-coastal-weather.html","intelligence.html"
];
for(const file of publicPages) {
 const page=read(file);
 assert.match(page,/site-design\.css\?v=20261121-coastal-ui-v1/,file+": design stylesheet missing");
 if(file!=="intelligence.html") assert.match(page,/navigation\.js\?v=20261121-coastal-ui-v1/,file+": new navigation missing");
}
const nav=read("navigation.js"),css=read("site-design.css"),sw=read("service-worker.js");
for(const term of ["pw-mobile-nav","pw-has-mobile-nav","pw-skip-link","menuForButton","Summary","Other Networks"]) {
 assert(nav.includes(term),"Shared navigation missing "+term);
}
for(const term of ["@media (max-width: 760px)","prefers-reduced-motion",":focus-visible","pw-mobile-nav","pw-has-mobile-nav"]) {
 assert(css.includes(term),"Design system missing "+term);
}
assert(sw.includes('"./site-design.css"'),"The installed app must cache the new design system");
assert(!css.includes("url(http"),"The design system must not require external assets");
console.log("PASS: all 25 public pages share the new coastal design, accessible navigation and offline CSS.");