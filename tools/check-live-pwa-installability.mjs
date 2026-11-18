import { chromium } from "@playwright/test";
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({
 viewport:{width:390,height:844},isMobile:true,hasTouch:true, deviceScaleFactor:2.75,
 userAgent:"Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36"
});
const page=await context.newPage();
const issues=[];
page.on("pageerror",e=>issues.push("pageerror: "+e.message));
page.on("console",m=>{if(m.type()==="error"&&/service.?worker|manifest|icon|install/i.test(m.text()))issues.push("console: "+m.text())});
await page.addInitScript(()=>{
 window.__installablePromptSeen=false;
 window.addEventListener("beforeinstallprompt",()=>{window.__installablePromptSeen=true});
});
const url="https://parknacrossweather.ie/index.html";
const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
console.log("PAGE",JSON.stringify({url:page.url(),status:response?.status(),contentType:response?.headers()["content-type"]}));
const cdp=await context.newCDPSession(page);
await cdp.send("Page.enable");
await page.waitForTimeout(18000);
const manifest=await cdp.send("Page.getAppManifest").catch(e=>({error:String(e)}));
console.log("MANIFEST",JSON.stringify({url:manifest.url,errors:manifest.errors,parsed:manifest.parsed,rawLength:manifest.data?.length}));
const errs=await cdp.send("Page.getInstallabilityErrors").catch(e=>({error:String(e)}));
console.log("INSTALLABILITY",JSON.stringify(errs));
const appId=await cdp.send("Page.getAppId").catch(e=>({error:String(e)}));
console.log("APP_ID",JSON.stringify(appId));
const metadata=await page.evaluate(async()=>{
 const link=document.querySelector('link[rel="manifest"]');
 const direct={link:link?.href||null,secure:isSecureContext,serviceWorkerSupported: "serviceWorker" in navigator,beforeinstallpromptSeen:window.__installablePromptSeen};
 try{const r=await fetch(link.href,{cache:"no-store"});const j=await r.json();direct.manifest={status:r.status,mime:r.headers.get("content-type"),id:j.id,name:j.name,start_url:j.start_url,scope:j.scope,display:j.display,icons:j.icons};
 const iconChecks=[];for(const icon of j.icons||[]){const u=new URL(icon.src,link.href);
  const resp=await fetch(u);const blob=await resp.blob();
  const bitmap=await createImageBitmap(blob).catch(e=>null);
  iconChecks.push({src:icon.src,status:resp.status,mime:resp.headers.get("content-type"),bytes:blob.size,dimensions:bitmap?[bitmap.width,bitmap.height]:null});
  bitmap?.close();
 }
 direct.iconChecks=iconChecks;
 }catch(e){direct.manifestError=String(e)}
 if("serviceWorker" in navigator){
  const registration=await navigator.serviceWorker.getRegistration().catch(e=>null);
  direct.sw={controller:!!navigator.serviceWorker.controller,scope:registration?.scope,active:registration?.active?.state,waiting:registration?.waiting?.state,installing:registration?.installing?.state};
 }
 return direct;
});
console.log("DOM_CHECK",JSON.stringify(metadata));
console.log("PAGE_ERRORS",JSON.stringify(issues.slice(0,20)));
await browser.close();
