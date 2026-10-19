import {test,expect} from '@playwright/test';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'}),year=Number(today.slice(0,4))-(Number(today.slice(5,7))<7?1:0);
let rows;
test.beforeEach(async({page})=>{
 rows=[{day:today,low_c:4,temp_count:12}];
 await page.route('**/*.workers.dev/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(new URL(r.request().url()).pathname==='/daily'?{days:rows}:{})}));
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
});
test('current no-frost result appears once without a duplicate history row',async({page})=>{
 await page.goto('/climate.html');await expect(page.locator('#frostCurrentDate')).toHaveText('No frost recorded yet');await expect(page.locator('#frostSeasonCount')).toHaveText('0');await expect(page.locator('#frostSeasonHistory')).toBeHidden();await expect(page.locator('#frostSeasonHistory .event-item')).toHaveCount(0);
});
test('previous seasons remain available and current first frost stays in summary',async({page})=>{
 rows=[{day:today,low_c:-.5,temp_count:12},{day:`${year-1}-12-10`,low_c:-1,temp_count:12}];
 await page.goto('/climate.html');await expect(page.locator('#frostSeasonCount')).toHaveText('1');await expect(page.locator('#frostSeasonHistory')).toBeVisible();await expect(page.locator('#frostSeasonHistory .event-item')).toHaveCount(1);await expect(page.locator('#frostSeasonHistory')).toContainText('Earliest recorded frost');await expect(page.locator('#frostSeasonHistory time')).toHaveText(`${year-1}–${String(year%100).padStart(2,'0')}`);
});
