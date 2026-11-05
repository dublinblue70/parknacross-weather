import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const require=createRequire(import.meta.url);
const axe=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const pages=fs.readdirSync('.').filter(x=>x.endsWith('.html')).sort();
const report={pages:pages.length,checked:[],staticIssues:[],violations:[],overflows:[],pageErrors:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{
 let name=decodeURIComponent(req.url.split('?')[0]);if(name==='/')name='/index.html';
 const file=path.resolve('.'+name);if(!file.startsWith(process.cwd()+'/')){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);});
});
await new Promise(done=>server.listen(43881,'127.0.0.1',done));
for(const p of pages){
 const html=fs.readFileSync(p,'utf8'),ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
 for(const id of new Set(ids.filter((v,i)=>ids.indexOf(v)<i)))report.staticIssues.push({p,type:'duplicate-id',id});
 for(const m of html.matchAll(/<(?:a|script|link|img|source)\b[^>]*(?:href|src)=["']([^"']+)["']/gi)){
  const url=m[1];if(/^(https?:|#|mailto:|tel:|data:)/.test(url))continue;
  const file=url.split(/[?#]/)[0].replace(/^\.\//,'');
  if(file&&!file.startsWith('/')&&!fs.existsSync(file))report.staticIssues.push({p,type:'missing-local-file',url});
 }
}
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await ctx.route('https://static.cloudflareinsights.com/**',r=>r.abort());
  await ctx.route('https://www.youtube-nocookie.com/**',r=>r.abort());
  for(const p of pages){
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
   try{
    await page.goto('http://127.0.0.1:43881/'+p,{waitUntil:'domcontentloaded',timeout:18000});
    await page.waitForTimeout(250);
    await page.addScriptTag({content:axe});
    const data=await page.evaluate(async()=>{
     const results=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}});
     return {scrollWidth:document.documentElement.scrollWidth,violations:results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,selectors:v.nodes.slice(0,2).map(n=>n.target)})),fonts:getComputedStyle(document.body).fontFamily,bodySize:getComputedStyle(document.body).fontSize};
    });
    report.checked.push({p,width,fonts:data.fonts,bodySize:data.bodySize});
    if(data.scrollWidth>width+3)report.overflows.push({p,width,actual:data.scrollWidth});
    for(const v of data.violations)report.violations.push({p,width,...v});
   }catch(e){report.pageErrors.push({p,width,error:String(e).slice(0,320)});}
   if(errors.length)report.pageErrors.push({p,width,js:errors.slice(0,4)});
   await page.close();
  }
  await ctx.close();
 }
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
fs.mkdirSync('audit-results',{recursive:true});
fs.writeFileSync('audit-results/axe-browser-audit.json',JSON.stringify(report,null,2));
const groups={};for(const v of report.violations){const g=groups[v.id]??={impact:v.impact,pages:[],nodes:0,examples:[]};g.pages.push(v.p+'@'+v.width);g.nodes+=v.nodes;if(g.examples.length<5)g.examples.push({p:v.p,width:v.width,selectors:v.selectors});}
console.log('WHOLE_SITE_AXE_AUDIT '+JSON.stringify({scanned:report.checked.length,staticIssues:report.staticIssues.slice(0,40),overflows:report.overflows,violations:Object.entries(groups).map(([id,g])=>({id,...g})),pageErrors:report.pageErrors.slice(0,30)}));
// Fail the workflow on serious WCAG regressions, missing assets or runtime errors.
// Minor notices are still reported for review, but are not blocking.
const blockers=report.staticIssues.length+report.overflows.length+report.pageErrors.length+
  report.violations.filter(issue=>['critical','serious'].includes(issue.impact)).length;
if(blockers){console.error(`ACCESSIBILITY_AUDIT_FAILED: ${blockers} blocking issue(s).`);process.exitCode=1;}
