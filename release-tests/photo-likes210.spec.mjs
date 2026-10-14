import {test,expect} from '@playwright/test';
for(const path of ['/sky.html','/index.html']){
 test(path+' recovers likes after a transient failure with storage blocked',async({page})=>{
  let failures=1,posts=0,reads=0;
  await page.addInitScript(()=>{Storage.prototype.getItem=function(){throw new Error('Blocked')};Storage.prototype.setItem=function(){throw new Error('Blocked')};});
  await page.route('**/static.cloudflareinsights.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await page.route('**/*.workers.dev/**',r=>{
   const u=new URL(r.request().url()),now=new Date().toISOString();
   if(u.pathname==='/sky-photo/likes'){
    if(r.request().method()==='POST'){posts++;return r.fulfill({body:'{"likes":4,"liked":true}',contentType:'application/json'});}
    reads++;if(failures-->0)return r.fulfill({status:503,body:'{}',contentType:'application/json'});
    return r.fulfill({body:'{"likes":3,"liked":false}',contentType:'application/json'});
   }
   if(u.pathname==='/sky-photo/meta')return r.fulfill({body:JSON.stringify({available:true,uploaded_at:now,caption:'Test sky'}),contentType:'application/json'});
   if(u.pathname==='/sky-photo')return r.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="skyblue"/></svg>',contentType:'image/svg+xml'});
   if(u.pathname==='/current')return r.fulfill({body:JSON.stringify({epoch:Math.floor(Date.now()/1000),received_at:now,temperature_c:12,rain_daily_mm:0,rain_rate_mm_h:0}),contentType:'application/json'});
   return r.fulfill({body:'{}',contentType:'application/json'});
  });
  await page.goto(path);
  await expect(page.locator('#skyLikeCount')).toHaveText('3 likes');
  expect(reads).toBeGreaterThanOrEqual(2);expect(posts).toBe(0);
  failures=2;
  await page.reload();
  await expect(page.locator('#skyLikeCount')).toHaveText('Likes unavailable');
  await expect(page.locator('#skyLikeButton')).toHaveText('Retry likes');
  await page.locator('#skyLikeButton').click();
  await expect(page.locator('#skyLikeCount')).toHaveText('3 likes');
  expect(posts).toBe(0);
  await page.locator('#skyLikeButton').click();
  await expect(page.locator('#skyLikeButton')).toHaveText('♥ Liked');
  await expect(page.locator('#skyLikeCount')).toHaveText('4 likes');
  expect(posts).toBe(1);
 });
}
