import {test,expect} from '@playwright/test';
const now=Math.floor(Date.now()/1000);
const current={epoch:now,received_at:new Date().toISOString(),temperature_c:7.4,humidity_pct:80,dew_point_c:4,wind_speed_kmh:10,wind_gust_kmh:20,wind_direction_deg:315,pressure_hpa:1002,rain_rate_mm_h:0,rain_daily_mm:0,solar_w_m2:0,uv_index:0};
let marine;
test.beforeEach(async({page})=>{
 marine={forecast_available:false,local_warning_status_available:true,local_warning_relevant:true,local_gale_warning:true,local_small_craft_warning:true,local_warning_sector:'Wicklow Head to Carnsore Point',local_warning_valid_text:'04:00 Wednesday 21/10/2026 to 16:00 Wednesday 21/10/2026',local_area:null,outlook:null};
 await page.route('**/*.workers.dev/**',r=>{
  const p=new URL(r.request().url()).pathname;
  const data=p==='/current'?current:p==='/history'?{readings:[current]}:p==='/daily'?{days:[]}:p==='/met/marine'?marine:p==='/met/warnings'?{warnings:[{type:'Rain',level:'yellow',description:'<p>Heavy rain &amp; strong winds.</p><ul><li>Localised flooding possible.</li><li>Difficult travelling conditions.</li></ul>',onset:new Date((now-600)*1000).toISOString(),expires:new Date((now+86400)*1000).toISOString()}]}:{};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:''}));
});
test('dashboard shows verified warnings despite an unavailable forecast and strips warning markup',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/index.html');
 await expect(page.locator('#marineWarningTitle')).toHaveText('Gale and Small Craft Warnings — North Wexford coast');
 await expect(page.locator('#warningText')).toHaveText('Heavy rain & strong winds. Localised flooding possible. Difficult travelling conditions.');
 await expect(page.locator('#warningText')).not.toContainText('<p>');
 const cleaned=await page.evaluate(()=>window.ParknacrossWarnings.plainText('&lt;p&gt;Rain &amp;amp; wind&lt;/p&gt;<script>window.badWarning=true</script>'));
 expect(cleaned).toBe('Rain & wind');expect(await page.evaluate(()=>Boolean(window.badWarning))).toBe(false);
 await page.screenshot({path:testInfo.outputPath('marine-and-rain-warnings-mobile.png')});
});
test('unverified warning status never becomes a hidden banner',async({page})=>{
 marine={forecast_available:true,local_warning_status_available:false,local_warning_relevant:null};await page.goto('/index.html');
 await expect(page.locator('#marineWarningBanner')).toBeVisible();await expect(page.locator('#marineWarningTitle')).toHaveText('Official marine warnings unavailable');
});
test('coast page preserves local warnings while identifying missing forecast details',async({page})=>{
 await page.goto('/coast.html');await expect(page.locator('#coastWarn')).toHaveText('Gale and Small Craft warnings');await expect(page.locator('#marineForecastUpdated')).toHaveText('Marine forecast unavailable · local warnings checked separately');await expect(page.locator('#marineWind')).toHaveText('Marine forecast details unavailable');
 marine={forecast_available:true,local_warning_status_available:false,local_warning_relevant:null};await page.reload();await expect(page.locator('#coastWarn')).toHaveText('Marine warning status unavailable');
});
