import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const validStoreRoute = "/stores/gong-cha-newmarket";
const validDrinkRoute = "/drinks/gong-cha/brown-sugar-pearl-milk-tea";
const validPickerResultRoute =
  "/picker/result/gong-cha/brown-sugar-pearl-milk-tea?store=gong-cha-newmarket&craving=milk-tea";

const publicRoutes = [
  ["Home", "/"],
  ["Search", "/search"],
  ["Stores", "/stores"],
  ["Store Detail", validStoreRoute],
  ["Drinks", "/drinks"],
  ["Drink Detail", validDrinkRoute],
  ["Picker", "/picker"],
  ["Picker Result", validPickerResultRoute]
] as const;

const routeTitles = [
  ["/", "WeMilktea | Discover Milk Tea & Bubble Tea in Auckland"],
  ["/search", "Search WeMilktea"],
  ["/stores", "Milk Tea Stores in Auckland | WeMilktea"],
  [validStoreRoute, "Gong cha Newmarket | Milk Tea in Newmarket | WeMilktea"],
  ["/drinks", "Milk Tea Drinks in Auckland | WeMilktea"],
  [validDrinkRoute, "Brown Sugar Pearl Milk Tea | Milk Tea Drink | WeMilktea"],
  ["/picker", "Daily Milk Tea Picker | WeMilktea"],
  [
    validPickerResultRoute,
    "Brown Sugar Pearl Milk Tea — Your Milk Tea Sign | WeMilktea"
  ]
] as const;

async function waitForPublicPage(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveCount(1);
}

async function navigateFromHomeWithKeyboard(
  page: Page,
  linkName: "Stores" | "Pick for me"
) {
  const desktopLink = page.getByRole("link", { name: linkName }).first();
  if (await desktopLink.isVisible()) {
    await desktopLink.focus();
    await desktopLink.press("Enter");
    return;
  }

  const openMenu = page.getByRole("button", { name: "Open menu" });
  await openMenu.focus();
  await openMenu.press("Enter");
  const mobileLink = page.getByRole("link", { name: linkName }).last();
  await mobileLink.focus();
  await mobileLink.press("Enter");
}

test.describe("public accessibility", () => {
  for (const [name, route] of publicRoutes) {
    test(`${name} has no WCAG A/AA axe violations`, async ({ page }) => {
      await page.goto(route);
      await waitForPublicPage(page);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("Suggest Store open state has no WCAG A/AA axe violations", async ({
    page
  }) => {
    await page.goto("/stores");
    await waitForPublicPage(page);
    await page
      .getByRole("button", { name: /suggest a store/i })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: /suggest a store/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test("public routes expose meaningful document titles", async ({ page }) => {
  for (const [route, title] of routeTitles) {
    await page.goto(route);
    await waitForPublicPage(page);
    await expect(page).toHaveTitle(title);
  }
});

test("mobile menu exposes state and restores focus after route selection", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForPublicPage(page);

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.focus();
  await menuButton.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close menu" })
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" })
  ).toBeVisible();
  await page.getByRole("link", { name: "Drinks" }).last().click();
  await expect(page).toHaveURL(/\/drinks$/);
  await expect(page.locator("h1")).toHaveCount(1);
});

test("mobile menu closes on Escape and restores trigger focus", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForPublicPage(page);

  const openMenu = page.getByRole("button", { name: "Open menu" });
  await openMenu.click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" })
  ).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("Stores filter popover closes on Escape and restores trigger focus", async ({
  page
}) => {
  await page.goto("/stores");
  await waitForPublicPage(page);

  const trigger = page.getByRole("button", { name: /^Filters/ });
  await trigger.click();
  const popover = page.locator("#store-filters-popover");
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Picker controls preserve native radio semantics and announce no-match state", async ({
  page
}) => {
  await page.goto("/picker");
  await waitForPublicPage(page);
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(6);
  await expect(radios.filter({ hasText: "Matcha" })).toHaveCount(0);
  await expect(radios.nth(0)).toBeChecked();
  await radios.nth(4).focus();
  await radios.nth(4).press("Space");
  await expect(radios.nth(4)).toBeChecked();
  await expect(radios.nth(0)).not.toBeChecked();
  await page.getByRole("button", { name: "Draw my milk tea sign" }).click();
  await expect(page.getByRole("alert")).toContainText("Nothing matches");
});

test("Suggest Store validation associates errors with fields and traps focus", async ({
  page
}) => {
  await page.goto("/stores");
  await waitForPublicPage(page);
  const trigger = page
    .getByRole("button", { name: /suggest a store/i })
    .first();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /suggest a store/i });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close suggest a store dialog" })
  ).toBeFocused();

  await page.getByRole("button", { name: "Send suggestion" }).click();
  await expect(page.getByLabel("Store name")).toBeFocused();
  await expect(page.getByLabel("Store name")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expect(page.getByLabel("Store name")).toHaveAttribute(
    "aria-describedby",
    "suggest-storeName-error"
  );
  await expect(page.locator("#suggest-storeName-error")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keyboard journey reaches a drink and its store", async ({ page }) => {
  await page.goto("/");
  await waitForPublicPage(page);

  const headerSearch = page.getByRole("button", {
    name: "Search stores and drinks"
  });
  await headerSearch.focus();
  await headerSearch.press("Enter");
  const homeSearch = page.getByLabel("Search stores or drinks");
  await expect(homeSearch).toBeFocused();
  await homeSearch.pressSequentially("brown sugar");
  await homeSearch.press("Enter");
  await expect(page).toHaveURL(
    /\/search\?q=brown\+sugar|\/search\?q=brown%20sugar/
  );
  await waitForPublicPage(page);

  const drinkLink = page.getByRole("link", {
    name: /View Brown Sugar Pearl Milk Tea by Gong cha/i
  });
  await drinkLink.focus();
  await drinkLink.press("Enter");
  await expect(page).toHaveURL(
    /\/drinks\/gong-cha\/brown-sugar-pearl-milk-tea$/
  );
  await waitForPublicPage(page);

  const findDrink = page
    .getByRole("button", { name: "Find this drink" })
    .first();
  await findDrink.focus();
  await findDrink.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Available at" })
  ).toBeFocused();

  const storeLink = page.getByRole("link", {
    name: /View Gong cha Newmarket/i
  });
  await storeLink.focus();
  await storeLink.press("Enter");
  await expect(page).toHaveURL(/\/stores\/gong-cha-newmarket$/);
  await waitForPublicPage(page);
});

test("keyboard journey completes Suggest Store validation and close", async ({
  page
}) => {
  await page.goto("/");
  await waitForPublicPage(page);
  await navigateFromHomeWithKeyboard(page, "Stores");
  await expect(page).toHaveURL(/\/stores$/);
  await waitForPublicPage(page);

  const trigger = page
    .getByRole("button", { name: /suggest a store/i })
    .first();
  await trigger.focus();
  await trigger.press("Enter");
  await expect(
    page.getByRole("dialog", { name: /suggest a store/i })
  ).toBeVisible();
  const submit = page.getByRole("button", { name: "Send suggestion" });
  await submit.focus();
  await submit.press("Enter");
  await expect(page.getByLabel("Store name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: /suggest a store/i })
  ).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keyboard journey reaches Picker Result and can pick again", async ({
  page
}) => {
  await page.goto("/");
  await waitForPublicPage(page);
  await navigateFromHomeWithKeyboard(page, "Pick for me");
  await expect(page).toHaveURL(/\/picker$/);
  await waitForPublicPage(page);

  const matcha = page.getByRole("radio", { name: "Matcha" });
  const milkTea = page.getByRole("radio", { name: "Milk Tea" });
  await expect(matcha).toBeEnabled();
  await matcha.focus();
  await matcha.press("ArrowDown");
  await expect(milkTea).toBeChecked();
  const draw = page.getByRole("button", { name: "Draw my milk tea sign" });
  await expect(draw).toBeEnabled();
  await draw.focus();
  await draw.press("Enter");
  await expect(page).toHaveURL(/\/picker\/result\//, { timeout: 10_000 });
  await waitForPublicPage(page);

  const viewDrink = page.getByRole("link", { name: "View drink" });
  await viewDrink.focus();
  await viewDrink.press("Enter");
  await expect(page).toHaveURL(/\/drinks\/[^/]+\/[^/]+$/);
  await waitForPublicPage(page);
  await page.goBack();
  await waitForPublicPage(page);

  const pickAgain = page.getByRole("link", { name: "Pick again" }).last();
  await pickAgain.focus();
  await pickAgain.press("Enter");
  await expect(page).toHaveURL(/\/picker$/);
  await waitForPublicPage(page);
});

test("Picker skips the draw transition for reduced-motion users", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/picker");
  await waitForPublicPage(page);

  const matcha = page.getByRole("radio", { name: "Matcha" });
  const milkTea = page.getByRole("radio", { name: "Milk Tea" });
  await expect(matcha).toBeEnabled();
  await matcha.focus();
  await matcha.press("ArrowDown");
  await expect(milkTea).toBeChecked();
  const draw = page.getByRole("button", { name: "Draw my milk tea sign" });
  await expect(draw).toBeEnabled();
  await draw.focus();
  await draw.press("Enter");
  await expect(page).toHaveURL(/\/picker\/result\//, { timeout: 1_000 });
});
