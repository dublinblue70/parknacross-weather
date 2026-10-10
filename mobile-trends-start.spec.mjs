import {test,expect} from '@playwright/test';

test('opening mobile weather trends stays at its heading, including after reopening',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/*.workers.dev/**',route=>route.fulfill({contentType:'application/json',body:'{}'}));
 await page.goto('/index.html');
 const toggle=page.locator('#graphs .mobile-detail-toggle');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 // Start with the control toward the bottom of the viewport, where anchoring
 // the following section previously brought the chart footer into view.
 await toggle.evaluate(button=>window.scrollTo({top:window.scrollY+button.getBoundingClientRect().top-650,behavior:'instant'}));
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect.poll(()=>toggle.evaluate(button=>Math.round(button.getBoundingClientRect().top))).toBe(16);
 await expect(page.locator('#trendsHeading')).toBeInViewport();
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();await expect.poll(()=>toggle.evaluate(button=>Math.round(button.getBoundingClientRect().top))).toBe(16);
 await expect(page.locator('#trendsHeading')).toBeInViewport();
});
