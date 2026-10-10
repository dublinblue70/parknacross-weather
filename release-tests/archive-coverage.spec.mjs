import {test,expect} from '@playwright/test';
const now=Math.floor(Date.now()/1000),day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'});
const shift=n=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
test.beforeEach(async({page})=>{
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('**/*.workers.dev/**',r=>{const p=new URL(r.request().url()).pathname;let data={};
  if(p==='/daily')data={days:[{day:shift(-2),high_c:12,low_c:8,rain_mm:0},{day,high_c:14,low_c:9,rain_mm:0}]};
  if(p==='/stats')data={first_epoch:now-2*86400,total_samples:300};
  if(p==='/coverage')data={days:[{day:shift(-2),actual_slots:100,expected_slots:100,coverage_percent:100,coverage_scope:'since_first_observation'},{day:shift(-1),actual_slots:0,expected_slots:288,coverage_percent:0},{day,actual_slots:72,expected_slots:72,coverage_percent:100,day_in_progress:true}],summary:{coverage_percent:70}};
  if(p==='/day')data={available:true,summary:{day,high_c:14,low_c:9,rain_mm:0},readings:[]};
  return r.fulfill({body:JSON.stringify(data),contentType:'application/json'});
 });
});
test('archive date labels, missing readings and pre-archive days remain distinct',async({page})=>{
 await page.goto('/history.html');await expect(page.locator('.heatmap-month').last()).toContainText(day.slice(0,4));
 await expect(page.locator('#heatmapDateRange')).toContainText('Irish local dates');
 await expect(page.locator('#heatmapDayDetail')).toContainText('72 of 72');await expect(page.locator('#heatmapDayDetail')).toContainText('so far today');
 const before=page.locator(`[data-day="${shift(-3)}"]`);await expect(before).toHaveClass(/before-archive/);await before.click();await expect(page.locator('#heatmapDayDetail')).toContainText('Before archiving began');await expect(page.locator('#heatmapOpenDay')).toBeHidden();
 const gap=page.locator(`[data-day="${shift(-1)}"]`);await expect(gap).toHaveClass(/no-readings/);await gap.click();await expect(page.locator('#heatmapDayDetail')).toContainText('0 of 288');await expect(page.locator('#heatmapDayDetail')).toContainText('No readings saved');await expect(page.locator('#heatmapOpenDay')).toBeHidden();
});
test('arrow navigation inspects dates and Open day retains the existing archive navigation',async({page})=>{
 await page.goto('/history.html');const today=page.locator(`[data-day="${day}"]`);await today.click();await today.press('ArrowUp');await expect(page.locator('#heatmapDayDetail')).toContainText('No readings saved');await page.locator(`[data-day="${shift(-1)}"]`).press('ArrowDown');await expect(today).toBeFocused();await expect(page.locator('#heatmapOpenDay')).toBeVisible();await page.locator('#heatmapOpenDay').click();await expect(page.locator('#dayHigh')).toHaveText('14.0 °C');await expect(page).toHaveURL(new RegExp('day='+day));
});
test.describe('touch archive inspection',()=>{test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});test('dates are inspectable with large tap targets and no page overflow',async({page})=>{
 await page.goto('/history.html');const today=page.locator(`[data-day="${day}"]`);await today.click();const box=await today.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);await expect(page.locator('#heatmapOpenDay')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const labels=await page.locator('.heatmap-weekdays span').allTextContents();expect(labels).toContain('Mon');expect(labels).toContain('Wed');expect(labels).toContain('Fri');
});});
