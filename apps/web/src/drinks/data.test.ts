import { expect, test } from "bun:test";
import {
  drinkDetailPath,
  filterPublicDrinks,
  normalizePublicDrink
} from "./data";

const productId = "9de804a5-511a-4b17-829a-694634fa993d";
const brandId = "3ff27baa-8375-448d-ac76-9bb0edbb6a2f";
const categoryId = "6ebec59b-e16e-4be4-a8cb-647c29fd81c0";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea",
    description: "Black tea, milk and brown sugar pearls.",
    is_seasonal: false,
    discovery_tags: ["brown-sugar", "pearls"],
    brands: { id: brandId, name: "Gong cha", slug: "gong-cha" },
    categories: { id: categoryId, name: "Milk Tea", slug: "milk-tea" },
    product_images: [],
    ...overrides
  };
}

test("normalizes canonical product data and availability count", () => {
  const drink = normalizePublicDrink(product(), 2);
  expect(drink).toMatchObject({
    name: "Brown Sugar Pearl Milk Tea",
    brandSlug: "gong-cha",
    categorySlug: "milk-tea",
    availableStoreCount: 2,
    imageUrl: null
  });
});

test("normalizes an owned primary product image", () => {
  const drink = normalizePublicDrink(
    product({
      product_images: [
        {
          is_primary: true,
          image_assets: {
            id: "2c4d7a6e-f782-4704-bd84-7c34f6d16a7d",
            provenance: "wemilktea",
            storage_key:
              "products/9de804a5-511a-4b17-829a-694634fa993d/00000000-0000-0000-0000-000000000001.jpg",
            external_url: null,
            alt_text: "Brown sugar pearl milk tea"
          }
        }
      ]
    }),
    1
  );
  expect(drink?.imageUrl).toBeNull();
  expect(drink?.imageAltText).toBe("Brown sugar pearl milk tea");
});

test("accepts a persisted stock primary product image", () => {
  const drink = normalizePublicDrink(
    product({
      product_images: [
        {
          is_primary: true,
          image_assets: {
            id: "2c4d7a6e-f782-4704-bd84-7c34f6d16a7d",
            provenance: "stock",
            storage_key: "showcase/pexels/12345.jpg",
            external_url: null,
            alt_text: "Milk Tea showcase image"
          }
        }
      ]
    })
  );
  expect(drink).not.toBeNull();
  expect(drink?.imageAltText).toBe("Milk Tea showcase image");
});

test("does not use Google product imagery", () => {
  const drink = normalizePublicDrink(
    product({
      product_images: [
        {
          is_primary: true,
          image_assets: {
            id: "2c4d7a6e-f782-4704-bd84-7c34f6d16a7d",
            provenance: "google",
            storage_key: null,
            external_url: "https://example.test/google.jpg",
            alt_text: "Google photo"
          }
        }
      ]
    }),
    1
  );
  expect(drink?.imageUrl).toBeNull();
});

test("filters by name, brand, category and tags", () => {
  const drinks = [
    normalizePublicDrink(product(), 2)!,
    normalizePublicDrink(
      product({
        id: "c0aee95b-c6e2-4501-a5a7-dcb4b8d1b11a",
        name: "Taro Milk Tea",
        slug: "taro-milk-tea",
        brands: { id: brandId, name: "Chatime", slug: "chatime" },
        categories: { id: categoryId, name: "Milk Tea", slug: "milk-tea" },
        discovery_tags: ["taro", "creamy"]
      }),
      1
    )!
  ];

  expect(
    filterPublicDrinks(drinks, { query: "  chatime ", categorySlug: "" })
  ).toHaveLength(1);
  expect(
    filterPublicDrinks(drinks, { query: "creamy", categorySlug: "" })
  ).toHaveLength(1);
  expect(
    filterPublicDrinks(drinks, { query: "", categorySlug: "milk-tea" })
  ).toHaveLength(2);
  expect(
    filterPublicDrinks(drinks, { query: "matcha", categorySlug: "" })
  ).toHaveLength(0);
});

test("matches partial discovery tags", () => {
  const drink = normalizePublicDrink(
    product({ discovery_tags: ["green-tea"] }),
    1
  )!;

  expect(
    filterPublicDrinks([drink], { query: "green", categorySlug: "" })
  ).toHaveLength(1);
});

test("uses an unambiguous brand-scoped future detail route", () => {
  expect(
    drinkDetailPath({
      brandSlug: "gong-cha",
      slug: "brown-sugar-pearl-milk-tea"
    })
  ).toBe("/drinks/gong-cha/brown-sugar-pearl-milk-tea");
});
