import {test,expect} from '@playwright/test';

for(const width of [390,768,1366,1720]){
  test('Station notifications fit '+width+'px without duplicate controls',async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/station.html',{waitUntil:'domcontentloaded'});
    const panel=page.locator('.alert-settings-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('#alertsTestButton')).toHaveCount(1);
    await expect(panel.locator('.alert-setup-item')).toHaveCount(3);
    await expect(panel.getByRole('button',{name:'Test notification on this device'})).toHaveCount(0);
    const cards=await panel.locator('.alert-setup-item').evaluateAll(els=>els.map(e=>({
      width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,
      note:e.querySelector('p')?.getBoundingClientRect().width||0
    })));
    for(const c of cards){
      expect(c.width).toBeGreaterThan(120);
      expect(c.note).toBeLessThanOrEqual(c.width);
      expect(c.height,'Notification status card should not be artificially tall').toBeLessThan(260);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(12);
    await panel.screenshot({path:'test-results/station-notifications-'+testInfo.project.name+'-'+width+'.png',animations:'disabled'});
  });
}
