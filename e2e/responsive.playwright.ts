import { expect, type Page, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/search",
  "/stores",
  "/stores/does-not-exist",
  "/drinks",
  "/stores/gong-cha-newmarket",
  "/drinks/gong-cha/brown-sugar-pearl-milk-tea",
  "/drinks/does-not-exist/does-not-exist",
  "/picker",
  "/picker/result/gong-cha/brown-sugar-pearl-milk-tea?store=gong-cha-newmarket&craving=milk-tea",
  "/picker/result/does-not-exist/does-not-exist?store=does-not-exist&craving=surprise"
];

async function waitForPublicPage(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("header").first()).toBeVisible();
}

test.describe("public responsive smoke", () => {
  test("public routes do not create page-level horizontal overflow", async ({
    page
  }) => {
    for (const route of publicRoutes) {
      await page.goto(route);
      await waitForPublicPage(page);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }));
      expect(
        dimensions.scrollWidth,
        `${route} overflows horizontally`
      ).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  });

  test("Moments Share composer stays usable across responsive sizes", async ({
    page
  }) => {
    await page.goto("/moments");
    await waitForPublicPage(page);
    const trigger = page.getByRole("button", { name: "Share your moment" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Share your moment" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Share", exact: true })
    ).toBeVisible();
    await expect(dialog.locator('input[type="file"]')).toHaveCount(1);

    if ((await page.evaluate(() => window.innerWidth)) < 768) {
      await dialog
        .getByRole("button", { name: "Add drink or store details" })
        .click();
      await expect(dialog.getByRole("combobox").first()).toBeVisible();
      const geometry = await dialog.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
      expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    } else {
      await expect(dialog.locator("div.sm\\:grid-cols-2")).toHaveCount(1);
    }
  });

  test("header switches between mobile controls and desktop navigation", async ({
    page
  }) => {
    await page.goto("/");
    await waitForPublicPage(page);

    if ((await page.evaluate(() => window.innerWidth)) < 768) {
      await expect(
        page.getByRole("button", { name: "Open menu" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(
        page.getByRole("link", { name: "Pick for me", exact: true })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("navigation", { name: "Main navigation" })
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "Pick for me" })
      ).toBeVisible();
    }
  });

  test("picker options remain visible and touch-sized on narrow screens", async ({
    page
  }) => {
    await page.goto("/picker");
    await waitForPublicPage(page);

    for (const label of [
      "Matcha",
      "Milk Tea",
      "Fruit Tea",
      "Creamy",
      "Refreshing",
      "Surprise Me"
    ]) {
      const option = page.getByRole("radio", { name: label });
      await expect(option).toBeAttached();
      const box = await option.locator("..").boundingBox();
      expect(box, `${label} option is not rendered`).not.toBeNull();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("long drink and store names wrap without card overflow", async ({
    page
  }) => {
    await page.goto("/drinks");
    await waitForPublicPage(page);
    const drinkCard = page.locator('a[aria-label^="View "]').first();
    await drinkCard.locator("h2").evaluate((element) => {
      element.textContent =
        "Very Long Brown Sugar Fresh Milk Tea With Pearl And Cream Foam";
    });
    const drinkHeading = await drinkCard.locator("h2").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height
    }));
    expect(drinkHeading.scrollWidth).toBeLessThanOrEqual(
      drinkHeading.clientWidth
    );
    expect(drinkHeading.height).toBeGreaterThan(28);

    await page.goto("/stores");
    await waitForPublicPage(page);
    const storeCard = page.locator('a[href^="/stores/"]').first();
    await storeCard.locator("h3").evaluate((element) => {
      element.textContent =
        "A very long store branch name that wraps onto multiple lines";
    });
    const storeHeading = await storeCard.locator("h3").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height
    }));
    expect(storeHeading.scrollWidth).toBeLessThanOrEqual(
      storeHeading.clientWidth
    );
    expect(storeHeading.height).toBeGreaterThan(20);
  });

  test("valid detail routes expose mobile sticky actions without covering the page end", async ({
    page
  }) => {
    await page.goto("/stores/gong-cha-newmarket");
    await waitForPublicPage(page);
    await expect(
      page.getByRole("heading", { name: "Gong cha Newmarket" })
    ).toBeVisible();
    if ((await page.evaluate(() => window.innerWidth)) < 768) {
      await expect(page.locator(".detail-sticky-action")).toBeVisible();
    }
    await page.goto("/drinks/gong-cha/brown-sugar-pearl-milk-tea");
    await waitForPublicPage(page);
    await expect(
      page.getByRole("heading", { name: "Brown Sugar Pearl Milk Tea" })
    ).toBeVisible();
    if ((await page.evaluate(() => window.innerWidth)) < 768) {
      await expect(
        page.getByRole("button", { name: "Find this drink" }).last()
      ).toBeVisible();
    }
    await page.goto(
      "/picker/result/gong-cha/brown-sugar-pearl-milk-tea?store=gong-cha-newmarket&craving=milk-tea"
    );
    await waitForPublicPage(page);
    await expect(
      page.getByRole("heading", { name: "The sign has spoken." })
    ).toBeVisible();

    if ((await page.evaluate(() => window.innerWidth)) < 768) {
      const sticky = page.locator(".picker-result-sticky-action");
      await expect(sticky).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight)
      );
      const geometry = await page.evaluate(() => {
        const action = document.querySelector(".picker-result-sticky-action");
        return {
          contentBottom:
            document
              .querySelector(".picker-result-split")
              ?.getBoundingClientRect().bottom ?? 0,
          actionTop: action?.getBoundingClientRect().top ?? 0
        };
      });
      expect(geometry.contentBottom).toBeLessThanOrEqual(geometry.actionTop);
    } else {
      await expect(page.locator(".picker-result-sticky-action")).toBeHidden();
    }
  });

  test("intermediate breakpoint widths stay within the viewport", async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "Run the intermediate-width matrix once."
    );
    for (const width of [375, 430, 600, 767, 769, 1024, 1279, 1281, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/search", "/stores", "/drinks", "/picker"]) {
        await page.goto(route);
        await waitForPublicPage(page);
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth
        }));
        expect(
          dimensions.scrollWidth,
          `${route} overflows at ${width}px`
        ).toBeLessThanOrEqual(dimensions.clientWidth);
      }
    }
  });

  test("URL-backed search and category state survives reload", async ({
    page
  }) => {
    await page.goto("/drinks?q=milk&category=milk-tea");
    await waitForPublicPage(page);
    await expect(
      page.getByLabel("Search drinks, brands or categories")
    ).toHaveValue("milk");
    await expect(
      page.getByRole("button", { name: "Milk Tea" })
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await waitForPublicPage(page);
    await expect(
      page.getByLabel("Search drinks, brands or categories")
    ).toHaveValue("milk");
    await expect(
      page.getByRole("button", { name: "Milk Tea" })
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/search?q=tea");
    await waitForPublicPage(page);
    await expect(page.getByLabel("Search drinks and stores")).toHaveValue(
      "tea"
    );
  });

  test("legacy Explore URLs redirect to the correct public destination", async ({
    page
  }) => {
    await page.goto("/explore");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/explore?q=milk tea");
    await expect(page).toHaveURL(
      /\/search\?q=milk\+tea|\/search\?q=milk%20tea/
    );
    await page.goto("/explore?filter=seasonal");
    await expect(page).toHaveURL(/\/$/);
  });

  test("custom clear controls are scoped to fields that render one", async ({
    page
  }) => {
    for (const [route, , clearLabel] of [
      ["/drinks", "Search drinks, brands or categories", "Clear drink search"],
      ["/stores", "Search stores", "Clear store search"],
      ["/search", "Search drinks and stores", "Clear search"]
    ] as const) {
      await page.goto(route);
      await waitForPublicPage(page);
      const input = page.locator('input[type="search"]').last();
      await input.fill("milk");
      await expect(input).toHaveClass(/search-input-custom-clear/);
      await expect(page.getByRole("button", { name: clearLabel })).toHaveCount(
        1
      );
      await page.getByRole("button", { name: clearLabel }).click();
      await expect(input).toHaveValue("");
    }

    await page.goto("/");
    await waitForPublicPage(page);
    await expect(page.getByLabel("Search stores or drinks")).not.toHaveClass(
      /search-input-custom-clear/
    );
  });

  test("representative routes have no browser console errors or uncaught page errors", async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const route of [
      "/",
      "/search",
      "/stores",
      "/stores/gong-cha-newmarket",
      "/drinks",
      "/drinks/gong-cha/brown-sugar-pearl-milk-tea",
      "/picker",
      "/picker/result/gong-cha/brown-sugar-pearl-milk-tea?store=gong-cha-newmarket&craving=milk-tea"
    ]) {
      await page.goto(route);
      await waitForPublicPage(page);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("Suggest Store dialog fits a reduced mobile viewport and validates in place", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto("/stores");
    await waitForPublicPage(page);
    await page.getByRole("button", { name: /Suggest a store/ }).click();

    const dialog = page.getByRole("dialog", { name: "Suggest a store" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.height).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerHeight)
    );

    await page.getByRole("button", { name: "Send suggestion" }).click();
    await expect(page.locator("#suggest-storeName-error")).toBeVisible();
    await expect(page.locator("#suggest-suburb-error")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: /Suggest a store/ })
    ).toBeFocused();

    await page.getByRole("button", { name: /Suggest a store/ }).click();
    await page.route("**/rest/v1/store_submissions**", (route) =>
      route.fulfill({
        body: "{}",
        contentType: "application/json",
        status: 500
      })
    );
    await page.locator("#suggest-storeName").fill("QA Tea House");
    await page.locator("#suggest-suburb").fill("Newmarket");
    await page.getByRole("button", { name: "Send suggestion" }).click();
    await expect(page.getByRole("alert")).toContainText("couldn’t send");
    await page.unroute("**/rest/v1/store_submissions**");
    await page
      .getByRole("button", { name: "Close suggest a store dialog" })
      .click();

    await page.getByRole("button", { name: /Suggest a store/ }).click();
    await page.route("**/rest/v1/store_submissions**", (route) =>
      route.fulfill({
        body: "{}",
        contentType: "application/json",
        status: 201
      })
    );
    await page.locator("#suggest-storeName").fill("QA Tea House");
    await page.locator("#suggest-suburb").fill("Newmarket");
    await page.getByRole("button", { name: "Send suggestion" }).click();
    await expect(page.getByText("Thanks for the suggestion!")).toBeVisible();
    await page.unroute("**/rest/v1/store_submissions**");
    await page.getByRole("button", { name: "Back to stores" }).click();
  });

  test("representative public pages produce review screenshots", async ({
    page
  }, testInfo) => {
    const routes =
      testInfo.project.name === "mobile"
        ? ["/", "/search", "/stores", "/drinks", "/picker"]
        : testInfo.project.name === "desktop"
          ? ["/", "/stores", "/drinks", "/picker"]
          : ["/stores", "/picker"];

    for (const route of routes) {
      await page.goto(route);
      await waitForPublicPage(page);
      await page.screenshot({
        path: testInfo.outputPath(
          `${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}.png`
        ),
        fullPage: true
      });
    }
  });
});
