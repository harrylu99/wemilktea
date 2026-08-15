import { expect, test } from "@playwright/test";

test("public home exposes baseline metadata and canonical URL", async ({
  page
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "WeMilktea | Discover Milk Tea & Bubble Tea in Auckland"
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Discover milk tea stores/
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow"
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/$/
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "WeMilktea | Discover Milk Tea & Bubble Tea in Auckland"
  );
});

test("filtered public routes are canonicalized and not indexed", async ({
  page
}) => {
  await page.goto("/stores?q=gong&area=Newmarket");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow"
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/stores$/
  );
});

test("published store detail exposes canonical local-business data", async ({
  page
}) => {
  await page.goto("/stores/gong-cha-newmarket");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow"
  );
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(jsonLd).toContain('"@type":"LocalBusiness"');
  expect(jsonLd).toContain("Gong cha Newmarket");
});

test("public robots and sitemap exclude private routes and draft stores", async ({
  request
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("/stores/gong-cha-newmarket");
  expect(sitemapText).not.toContain("/candidates");
  expect(sitemapText).not.toContain("wucha-ormiston");
});
