import { expect, test } from "bun:test";
import {
  buildMenuReviewItems,
  externalMenuErrorMessage,
  formatSourcePrice,
  reviewValidation,
  setAllMenuReviewSelection,
  toggleMenuReviewItem,
  type ExternalMenuItem,
  type ReviewCategory,
  type ReviewProduct
} from "./menu-review";

const categories: ReviewCategory[] = [
  { id: "category-milk-tea", name: "Milk Tea", slug: "milk-tea" },
  { id: "category-fruit", name: "Fruit Tea", slug: "fruit-tea" }
];

const products: ReviewProduct[] = [
  {
    id: "product-brown-sugar",
    brandId: "brand-one",
    categoryId: "category-milk-tea",
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea"
  },
  {
    id: "product-name-match",
    brandId: "brand-one",
    categoryId: "category-fruit",
    name: "Mango Tea",
    slug: "mango-tea-legacy"
  },
  {
    id: "other-brand-match",
    brandId: "brand-two",
    categoryId: "category-milk-tea",
    name: "New Tea",
    slug: "new-tea"
  }
];

const items: ExternalMenuItem[] = [
  {
    provider: "uber_eats",
    externalItemId: "external-existing",
    name: "Brown Sugar Pearl Milk Tea",
    description: "Existing item",
    sourceCategory: "Milk Tea",
    price: { amountMinor: 750, currency: "NZD" },
    imageUrl: "https://example.com/existing.jpg"
  },
  {
    provider: "uber_eats",
    externalItemId: "external-possible",
    name: "Mango Tea",
    description: null,
    sourceCategory: "Fruit Tea",
    price: null,
    imageUrl: null
  },
  {
    provider: "uber_eats",
    externalItemId: "external-new",
    name: "New Tea",
    description: "New item",
    sourceCategory: "Milk Tea",
    price: { amountMinor: 625, currency: null },
    imageUrl: null
  }
];

test("matches products by brand plus WM-48 slug identity", () => {
  const review = buildMenuReviewItems(items, "brand-one", products, categories);

  expect(review.map((item) => item.duplicateStatus)).toEqual([
    "existing",
    "possible-match",
    "new"
  ]);
  expect(review[0]?.selected).toBeFalse();
  expect(review[1]?.selected).toBeFalse();
  expect(review[2]?.selected).toBeTrue();
  expect(review[0]?.targetCategoryId).toBe("category-milk-tea");
  expect(review[1]?.targetCategoryId).toBe("category-fruit");
  expect(review[2]?.targetCategoryId).toBe("category-milk-tea");
});

test("does not match an identically named product from another brand", () => {
  const review = buildMenuReviewItems(
    [items[2]!],
    "brand-one",
    products,
    categories
  );

  expect(review[0]?.duplicateStatus).toBe("new");
  expect(review[0]?.matchedProductId).toBeNull();
});

test("selects, deselects, and validates local review state", () => {
  const review = buildMenuReviewItems(items, "brand-one", products, categories);
  const selected = toggleMenuReviewItem(review, "external-existing");
  expect(reviewValidation(selected).selectedCount).toBe(2);

  const missingCategory = selected.map((item) =>
    item.externalItemId === "external-existing"
      ? { ...item, targetCategoryId: null }
      : item
  );
  expect(reviewValidation(missingCategory).isReady).toBeFalse();
  expect(
    reviewValidation(missingCategory).selectedWithoutCategory
  ).toHaveLength(1);

  const allSelected = setAllMenuReviewSelection(review, true);
  expect(allSelected.every((item) => item.selected)).toBeTrue();
  expect(
    setAllMenuReviewSelection(allSelected, false).some((item) => item.selected)
  ).toBeFalse();
});

test("formats normalized minor-unit prices without persisting them", () => {
  expect(formatSourcePrice(items[0]!.price)).toContain("7.50");
  expect(formatSourcePrice(items[2]!.price)).toBe(
    "6.25 (currency unavailable)"
  );
  expect(formatSourcePrice(null)).toBe("Not provided");
});

test("maps safe external-menu error statuses", () => {
  expect(externalMenuErrorMessage(404)).toBe(
    "This store is not connected to Uber Eats."
  );
  expect(externalMenuErrorMessage(503)).toContain("temporarily unavailable");
  expect(externalMenuErrorMessage(418)).toContain("could not be loaded");
});
