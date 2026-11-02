import {test,expect} from '@playwright/test';

const now=Date.parse('2026-11-02T18:00:00Z');
const day='2026-11-02';

test('History daily chart retains one accessible table control after chart recreation',async({page})=>{
  await page.clock.setFixedTime(new Date(now));
  await page.route('**/static.cloudflareinsights.com/**',route=>route.fulfill({body:''}));
  await page.route('**/*.workers.dev/**',route=>{
    const path=new URL(route.request().url()).pathname;
    let result={};
    if(path==='/daily')result={days:[{day,high_c:14,low_c:7,rain_mm:0.3}]};
    if(path==='/stats')result={first_epoch:now/1000-86400,total_samples:200};
    if(path==='/coverage')result={days:[{day,coverage_percent:100,actual_slots:216,expected_slots:216,coverage_scope:'full_day'}],summary:{coverage_percent:100}};
    if(path==='/day')result={available:true,summary:{high_c:14,low_c:7,rain_mm:0.3},readings:[{epoch:now/1000-300,temperature_c:13,rain_rate_mm_h:0},{epoch:now/1000,temperature_c:14,rain_rate_mm_h:0}]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto('/history.html');
  await expect.poll(()=>page.evaluate(()=>window.Chart?.getChart('dayDetailChart')?.data.labels.length||0)).toBe(2);
  const details=page.locator('.day-detail-chart + details.review-table-tools');
  await expect(details).toHaveCount(1);

  // Rebuild the same chart repeatedly, as happens when switching archive dates.
  for(let i=0;i<4;i++){
    await page.evaluate(i=>{
      const chart=createDayChart();
      chart.data.labels=['12:00'];
      chart.data.datasets[0].data=[11+i];
      chart.data.datasets[1].data=[0];
      chart.update('none');
    },i);
    await expect(details).toHaveCount(1);
  }
  await details.locator('summary').click();
  await expect(details.locator('tbody tr')).toHaveCount(1);
  await expect(details.locator('tbody')).toContainText('14');

  // A further re-render must refresh the expanded table, not duplicate it.
  await page.evaluate(()=>{
    const chart=createDayChart();
    chart.data.labels=['13:00'];
    chart.data.datasets[0].data=[17];
    chart.data.datasets[1].data=[0];
    chart.update('none');
  });
  await expect(details).toHaveCount(1);
  await expect(details.locator('tbody')).toContainText('17');
});
