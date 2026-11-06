import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const pages=['index.html','summary.html','status.html','rain.html','coast.html','downloads.html'];
for(const width of [390,1366]){
  test('Final visual audit at '+width+'px',async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    fs.mkdirSync('test-results',{recursive:true});
    for(const filename of pages){
      await page.goto('/'+filename,{waitUntil:'domcontentloaded'});
      await expect(page.locator('main')).toBeVisible();
      const viewport=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:window.innerWidth}));
      expect(viewport.scroll,filename+' horizontal overflow at '+width+'px').toBeLessThanOrEqual(viewport.inner+12);
      if(filename==='summary.html'&&width>1000){
        const ratio=await page.locator('#dayStory').evaluate(el=>{
          const parent=el.closest('.info-card');return el.getBoundingClientRect().width/parent.getBoundingClientRect().width;
        });
        expect(ratio,'Today in brief should use available laptop width').toBeGreaterThan(.72);
      }
      if(filename==='status.html')await expect(page.locator('#m2ObservationInfo')).toHaveCount(1);
      await page.screenshot({path:'test-results/audit-'+testInfo.project.name+'-'+width+'-'+filename.replace('.html','')+'.png',fullPage:false,animations:'disabled'});
    }
  });
}
