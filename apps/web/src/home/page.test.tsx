import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "bun:test";
import type { PublicDrink } from "../drinks/data";
import { HomeHeroCopy, HomePage } from "./page";
import { ThemeContext } from "../theme-context";

test("uses the header Search entry without a standalone Home Search field", () => {
  const markup = renderToStaticMarkup(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );

  expect(markup).not.toContain('id="home-search"');
  expect(markup).not.toContain('aria-label="Search stores or drinks"');
  expect(markup).toContain('aria-label="Search WeMilktea"');
  expect(markup).toContain("Have you ever tried this one?");
  expect(markup).toContain("TODAY’S MILK TEA SIGN");
  expect(markup).toContain("What’s your milk tea sign today?");
  expect(markup).toContain(
    "A totally scientific way to pick your next milk tea."
  );
  expect(markup).toContain("Read my sign");
});

const featuredDrink: PublicDrink = {
  id: "9de804a5-511a-4b17-829a-694634fa993d",
  name: "Matcha Coconut Latte",
  slug: "matcha-coconut-latte",
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  categoryName: "Milk Tea",
  categorySlug: "milk-tea",
  description: null,
  discoveryTags: [],
  isSeasonal: false,
  imageUrl: "https://images.example.test/matcha.jpg",
  imageAltText: "Matcha Coconut Latte",
  availableStoreCount: 1
};

test("renders the featured drink route and omits missing brand copy", () => {
  const withBrand = renderToStaticMarkup(
    <MemoryRouter>
      <HomeHeroCopy drink={featuredDrink} />
    </MemoryRouter>
  );
  expect(withBrand).toContain("Matcha Coconut Latte");
  expect(withBrand).toContain("Find it at Gong cha");
  expect(withBrand).toContain('href="/drinks/gong-cha/matcha-coconut-latte"');
  expect(withBrand).toContain("View drink");

  const withoutBrand = renderToStaticMarkup(
    <MemoryRouter>
      <HomeHeroCopy drink={{ ...featuredDrink, brandName: "" }} />
    </MemoryRouter>
  );
  expect(withoutBrand).not.toContain("Find it at");
  expect(withoutBrand).not.toContain("undefined");
});
