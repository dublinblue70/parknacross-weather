import {test,expect} from '@playwright/test';

test.beforeEach(async({request})=>{await request.get('/__origin-connectivity?mode=on');});
test.afterEach(async({request})=>{await request.get('/__origin-connectivity?mode=on');});

// Exercises a real service-worker controller transition, not a mock DOM event.
// Chromium approximates Android and WebKit approximates Safari engine behaviour.
test('a background PWA update does not silently reload an in-use page',async({page},info)=>{
 test.setTimeout(90000);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/install.html');
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
 await page.evaluate(()=>{window.__unsavedPageState={test:'remains-until-user-chooses'};});
 await page.evaluate(()=>navigator.serviceWorker.register('/service-worker.js?candidate=next',{scope:'/'}));
 await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||'')).toContain('candidate=next');
 expect(await page.evaluate(()=>window.__unsavedPageState?.test)).toBe('remains-until-user-chooses');
 await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
 await expect(page.locator('#pwaUpdateBanner button')).toHaveText('Refresh app');
 await page.screenshot({path:info.outputPath('pwa-update-consent.png')});
});
