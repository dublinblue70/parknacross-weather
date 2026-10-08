import {test,expect} from '@playwright/test';
async function install(page){
  await page.goto('/offline.html');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
}
test('real service worker caches the public pages and starts offline',async({page,context})=>{
  await install(page);
  await context.setOffline(true);
  await page.goto('/monthly.html');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto('/privacy.html');await expect(page.locator('h1')).toContainText('Privacy');
  await context.setOffline(false);
});
test('an incomplete update preserves the installed release and its offline pages',async({page,context})=>{
  await install(page);
  const before=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
  const failed=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.register('/service-worker.js?candidate=failed',{scope:'/'});
    const worker=registration.installing;
    if(!worker)return 'settled';
    return new Promise(resolve=>{worker.addEventListener('statechange',()=>{if(worker.state==='redundant'||worker.state==='activated')resolve(worker.state);});if(worker.state==='redundant')resolve('redundant');});
  });
  expect(['redundant','settled']).toContain(failed);
  expect(await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL)).toBe(before);
  await context.setOffline(true);await page.goto('/graphs.html');await expect(page.locator('h1')).toContainText('Graphs');await context.setOffline(false);
});
test('a complete update activates before the site resumes offline',async({page,context})=>{
  await install(page);
  await page.evaluate(()=>navigator.serviceWorker.register('/service-worker.js?candidate=next',{scope:'/'}));
  await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||'')).toContain('candidate=next');
  await context.setOffline(true);await page.goto('/install.html');await expect(page.locator('h1')).toBeVisible();await context.setOffline(false);
});
