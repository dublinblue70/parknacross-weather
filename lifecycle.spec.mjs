import {test,expect} from '@playwright/test';
// WebKit 1.63 offline emulation rejects service-worker responses (Playwright #42775).
// Drop real origin connections instead; no page or SW request is mocked.
test.beforeEach(async({request})=>{await request.get('/__origin-connectivity?mode=on');});
test.afterEach(async({request})=>{await request.get('/__origin-connectivity?mode=on');});
async function install(page){
  await page.goto('/offline.html');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
}
test('real service worker caches the public pages and starts offline',async({page,request})=>{
  await install(page);
  await request.get('/__origin-connectivity?mode=off');
  await page.goto('/monthly.html');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.goto('/privacy.html');await expect(page.locator('h1')).toContainText(/privacy/i);
  await request.get('/__origin-connectivity?mode=on');
});
test('an incomplete update preserves the installed release and its offline pages',async({page,request})=>{
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
  await request.get('/__origin-connectivity?mode=off');await page.goto('/graphs.html');await expect(page.locator('h1')).toContainText('Graphs');await request.get('/__origin-connectivity?mode=on');
});
test('a complete update activates before the site resumes offline',async({page,request})=>{
  await install(page);
  await page.evaluate(()=>navigator.serviceWorker.register('/service-worker.js?candidate=next',{scope:'/'}));
  await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||'')).toContain('candidate=next');
  await request.get('/__origin-connectivity?mode=off');await page.goto('/install.html');await expect(page.locator('h1')).toBeVisible();await request.get('/__origin-connectivity?mode=on');
});
