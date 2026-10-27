import {test,expect} from '@playwright/test';
test('an official NI-only bulletin recovers the Wexford warning check after API failure',async({page})=>{
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
 await page.route('**/*.workers.dev/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.route('https://www.met.ie/warnings-today.html',r=>r.fulfill({contentType:'text/html',headers:{'Access-Control-Allow-Origin':'*'},body:'<nav>Weather Warnings &amp; Advisories</nav><h2>Weather Warnings</h2><h3>Yellow - Wind Warning for Antrim, Derry</h3><p>Wind.</p><p>Valid: 03:00 Tuesday 27/10/2026 to 21:00 Tuesday 27/10/2026</p><h2>Marine Warnings</h2>'}));
 await page.goto('/status.html');await expect(page.locator('#landWarningValue')).toHaveText('0 relevant warnings');await expect(page.locator('#landWarningBadge')).not.toContainText('Unavailable');
});
