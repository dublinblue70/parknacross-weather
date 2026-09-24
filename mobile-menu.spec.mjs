import { test, expect } from "@playwright/test";

for (const pageName of ["index.html", "graphs.html", "privacy.html"]) {
  test(`More menu works on ${pageName}`, async ({ page }) => {
    await page.goto(`/${pageName}`);
    const button = page.getByRole("button", { name: /More/ });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Explore", { exact: true })).toBeVisible();
    await expect(menu.getByText("Reports", { exact: true })).toBeVisible();
    await expect(menu.getByText("Site & app", { exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Station" })).toBeVisible();
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });
}

test("reviewed clarity changes are visible", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.getByRole("heading", { name: "What to wear now" })).toBeVisible();
  await page.goto("/coast.html");
  await expect(page.getByText("Estimated coastal water temperature", { exact: true })).toBeVisible();
  await expect(page.getByText(/not measured at Poulshone/i)).toBeVisible();
  await page.goto("/intelligence.html");
  await expect(page.getByRole("heading", { name: "Significant weather review" })).toBeVisible();
});
