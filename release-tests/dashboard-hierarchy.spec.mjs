import {test,expect} from '@playwright/test';
test('dashboard prioritises actual live readings, then forecast, then planning on phone and desktop',async({page})=>{
  await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await page.route('**/*.workers.dev/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/index.html');
    const order=['.today-section','.metrics-section','#forecast','#planning'];
    const y=[];
    for(const selector of order){
      const box=await page.locator(selector).boundingBox();
      expect(box,selector+' exists').not.toBeNull();
      y.push(box.y);
    }
    for(let i=1;i<y.length;i++)expect(y[i],order[i]+' must appear after '+order[i-1]).toBeGreaterThan(y[i-1]);
    await expect(page.locator('.dashboard-shortcuts a')).toHaveCount(9);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3)).toBe(true);
  }
});
test('rain-gauge changeover audit is transparent and never implies independently verified hardware',async({page})=>{
  await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await page.route('**/*.workers.dev/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.goto('/rain.html');
  const panel=page.locator('#rainGaugeAudit');
  await expect(panel).toBeVisible();
  await panel.locator('summary').click();
  await expect(page.locator('#rainGaugeReconciliation')).toContainText('provisional');
  await expect(panel).toContainText('does not confirm gauge calibration');
});
