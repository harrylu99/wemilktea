import { expect, test } from "bun:test";
import { MenuPayloadError, normalizeUberMenu } from "./uber-menu-adapter.ts";

function menuPayload(overrides: Record<string, unknown> = {}) {
  return {
    menus: [{ id: "menu-1", category_ids: ["category-1"] }],
    categories: [
      {
        id: "category-1",
        title: { translations: { en_us: "Milk Tea" } },
        entities: [{ id: "item-1" }]
      }
    ],
    items: [
      {
        id: "item-1",
        title: { translations: { default: "Brown Sugar Milk Tea" } },
        description: {
          translations: { en_us: "Tea with brown sugar pearls." }
        },
        price_info: { price: 750, overrides: [] },
        image_url: "https://images.example.test/item-1.webp",
        dish_info: {},
        product_info: {}
      }
    ],
    modifier_groups: {},
    ...overrides
  };
}

test("normalizes real Uber item fields and category references", () => {
  expect(normalizeUberMenu(menuPayload())).toEqual({
    provider: "uber_eats",
    warnings: [],
    items: [
      {
        provider: "uber_eats",
        externalItemId: "item-1",
        name: "Brown Sugar Milk Tea",
        description: "Tea with brown sugar pearls.",
        sourceCategory: "Milk Tea",
        price: { amountMinor: 750, currency: null },
        imageUrl: "https://images.example.test/item-1.webp"
      }
    ]
  });
});

test("handles an empty object menu collection and optional fields", () => {
  const result = normalizeUberMenu(
    menuPayload({
      categories: {},
      items: {},
      modifier_groups: null
    })
  );

  expect(result.items).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test("keeps optional item fields nullable and ignores modifier groups explicitly", () => {
  const payload = menuPayload({
    items: [
      {
        id: "item-2",
        title: { translations: { en: "Plain Tea" } },
        price_info: { price: 0 }
      }
    ],
    modifier_groups: [{ id: "modifier-group-1" }]
  });

  const result = normalizeUberMenu(payload);
  expect(result.items[0]).toMatchObject({
    externalItemId: "item-2",
    name: "Plain Tea",
    description: null,
    sourceCategory: null,
    imageUrl: null,
    price: { amountMinor: 0, currency: null }
  });
  expect(result.warnings).toEqual([
    "Modifier groups were returned but are not normalized by WM-52."
  ]);
});

test("fails safely for malformed required item fields", () => {
  expect(() =>
    normalizeUberMenu(menuPayload({ items: [{ id: "missing-title" }] }))
  ).toThrow(MenuPayloadError);

  expect(() =>
    normalizeUberMenu(
      menuPayload({
        items: [
          {
            id: "bad-price",
            title: { translations: { default: "Bad Price" } },
            price_info: { price: "750" }
          }
        ]
      })
    )
  ).toThrow(MenuPayloadError);
});
