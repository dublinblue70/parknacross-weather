import {test,expect} from '@playwright/test';
import fs from 'node:fs';

for(const path of ['index.html','summary.html','status.html','rain.html','coast.html','downloads.html']){
 test('Accessibility and lab performance evidence: '+path,async({page},testInfo)=>{
   await page.setViewportSize({width:1366,height:900});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('/'+path,{waitUntil:'domcontentloaded'});
   await expect(page.locator('main')).toBeVisible();
   const audit=await page.evaluate(async()=>{
     const nav=performance.getEntriesByType('navigation')[0];
     const paint=performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint');
     const visible=element=>element.getClientRects().length>0;
     const noNames=[...document.querySelectorAll('button')].filter(visible)
       .filter(e=>!(e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent||'').trim()).length;
     const imgs=[...document.querySelectorAll('img')];
     const missingAlt=imgs.filter(img=>!img.hasAttribute('alt')).length;
     const focusable=[...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(visible).length;
     return {
       page:location.pathname,
       navigationResponseMs:nav?Math.round(nav.responseEnd-nav.startTime):null,
       domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd-nav.startTime):null,
       firstContentfulPaintMs:paint?Math.round(paint.startTime):null,
       resourceCount:performance.getEntriesByType('resource').length,
       missingAlt,unnamedVisibleButtons:noNames,focusableElements:focusable,
       documentWidth:document.documentElement.scrollWidth,
       viewportWidth:window.innerWidth
     };
   });
   expect(audit.missingAlt).toBe(0);
   expect(audit.unnamedVisibleButtons).toBe(0);
   expect(audit.focusableElements).toBeGreaterThan(1);
   expect(audit.documentWidth).toBeLessThanOrEqual(audit.viewportWidth+12);
   fs.mkdirSync('test-results',{recursive:true});
   fs.writeFileSync('test-results/lab-'+testInfo.project.name+'-'+path.replace('.html','')+'.json',JSON.stringify({ ...audit,pageErrors:errors},null,2));
   // Local test-server timings are lab diagnostics, NOT real-user Core Web Vitals.
 });
}
