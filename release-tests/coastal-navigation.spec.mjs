import { test, expect } from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.route("**/*.workers.dev/**", route => route.fulfill({contentType:"application/json",body:"{}"}));
  await page.route("**/static.cloudflareinsights.com/**", route => route.fulfill({contentType:"application/javascript",body:""}));
});

test("mobile weather navigation is one tap away, readable and keyboard accessible", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/index.html",{waitUntil:"domcontentloaded"});
  const nav = page.getByRole("navigation",{name:"Quick weather navigation"});
  await expect(nav).toBeVisible();
  for (const [path,label] of [["index.html","Today"],["rain.html","Rain"],["radar.html","Radar"],["coast.html","Sea and swim conditions"]]) {
    const link=nav.getByRole("link",{name:label,exact:true});
    await expect(link).toHaveAttribute("href",path);
    await expect(link).toBeVisible();
    const bounds=await link.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await expect(nav.getByRole("link",{name:"Today"})).toHaveAttribute("aria-current","page");
  await expect(page.locator("header .nav")).toBeHidden();
  const skip=page.getByRole("link",{name:"Skip to weather content"});
  await skip.focus();
  await expect(skip).toBeVisible();
  await expect(skip).toHaveAttribute("href","#dashboard");
  const more=nav.getByRole("button",{name:"More weather pages"});
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded","true");
  const menu=page.locator(".nav-more-menu:visible");
  await expect(menu.getByRole("menuitem",{name:"Summary",exact:true})).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:"History",exact:true})).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:"Other Networks",exact:true})).toBeVisible();
  const bounds=await menu.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(391);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(845);
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded","false");
  await expect(menu).toBeHidden();
  await nav.getByRole("link",{name:"Sea and swim conditions"}).click();
  await expect(page).toHaveURL(/coast\.html$/);
  await expect(page.getByRole("navigation",{name:"Quick weather navigation"}).getByRole("link",{name:"Sea and swim conditions"})).toHaveAttribute("aria-current","page");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test("desktop top navigation offers five clear destinations and a grouped More menu",async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await page.goto("/summary.html",{waitUntil:"domcontentloaded"});
  const nav=page.locator("header .nav");
  await expect(nav).toBeVisible();
  await expect(page.locator(".pw-mobile-nav")).toBeHidden();
  for(const target of ["index.html","rain.html","radar.html","coast.html","graphs.html"]) {
    await expect(nav.locator(':scope > a[href="'+target+'"]')).toBeVisible();
  }
  await expect(nav.locator(':scope > a[href="history.html"]')).toHaveCount(0);
  await expect(nav.locator(':scope > a[href="summary.html"]')).toHaveCount(0);
  const more=nav.getByRole("button",{name:/More/});
  await expect(more).toHaveClass(/nav-more-active/);
  await more.click();
  const menu=page.locator(".nav-more-menu:visible");
  await expect(menu.getByRole("menuitem",{name:"Summary",exact:true})).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:"History",exact:true})).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:"Station",exact:true})).toBeVisible();
  await expect(menu.getByText("Explore",{exact:true})).toBeVisible();
  await expect(menu.getByText("Reports",{exact:true})).toBeVisible();
});

test("mobile retains primary navigation when enhancement scripts are unavailable",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route("**/navigation.js*",r=>r.abort());
  await page.goto("/rain.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("header .nav")).toBeVisible();
  await expect(page.locator(".pw-mobile-nav")).toHaveCount(0);
});