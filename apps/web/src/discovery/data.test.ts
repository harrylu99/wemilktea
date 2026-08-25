import { expect, test } from "bun:test";
import {
  filterPublicDiscoveryDrinks,
  filterPublicDiscoveryStores,
  searchPublicDiscovery
} from "./data";
import type { PublicDrink } from "../drinks/data";
import type { PublicStore } from "../stores/data";

const drinks: PublicDrink[] = [
  {
    id: "9de804a5-511a-4b17-829a-694634fa993d",
    name: "Brown Sugar Pearl Milk Tea",
    slug: "brown-sugar-pearl-milk-tea",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    categoryName: "Milk Tea",
    categorySlug: "milk-tea",
    description: "Black tea, milk and brown sugar pearls.",
    discoveryTags: ["brown-sugar", "pearls"],
    isSeasonal: false,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 2
  },
  {
    id: "c0aee95b-c6e2-4501-a5a7-dcb4b8d1b11a",
    name: "Summer Mango Tea",
    slug: "summer-mango-tea",
    brandName: "Chatime",
    brandSlug: "chatime",
    categoryName: "Fruit Tea",
    categorySlug: "fruit-tea",
    description: "A bright seasonal mango drink.",
    discoveryTags: ["mango"],
    isSeasonal: true,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 1
  },
  {
    id: "5f09a3f5-f6f1-4e9e-a0b0-5dcf59852d80",
    name: "Bayberry Coco",
    slug: "bayberry-coco",
    brandName: "Hidden Brand",
    brandSlug: "hidden-brand",
    categoryName: "Fruit Tea",
    categorySlug: "fruit-tea",
    description: "A hidden description keyword.",
    discoveryTags: ["coconut"],
    isSeasonal: false,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 1
  },
  {
    id: "f4df4b47-1da2-4c42-ae8c-3e8fdf3a0e1f",
    name: "Cheese Coconut Matcha",
    slug: "cheese-coconut-matcha",
    brandName: "Tea House",
    brandSlug: "tea-house",
    categoryName: "Milk Tea",
    categorySlug: "milk-tea",
    description: "A creamy matcha drink.",
    discoveryTags: [],
    isSeasonal: false,
    imageUrl: null,
    imageAltText: null,
    availableStoreCount: 1
  }
];

const stores: PublicStore[] = [
  {
    id: "05c6f9e6-b940-4121-a365-01324ecb9fd8",
    slug: "gong-cha-albany",
    displayName: "Gong cha Albany",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    suburb: "Albany",
    address: "Albany, Auckland",
    latitude: -36.726,
    longitude: 174.7023,
    imageUrl: null,
    imageAltText: null
  },
  {
    id: "e802eb8f-1eb7-493f-b1f0-eba35a10151b",
    slug: "gong-cha-north-shore",
    displayName: "Gong cha North Shore",
    brandName: "Gong cha",
    brandSlug: "gong-cha",
    suburb: "Albany",
    address: "North Shore, Auckland",
    latitude: -36.75,
    longitude: 174.73,
    imageUrl: null,
    imageAltText: null
  },
  {
    id: "b8663dc1-6792-44dc-90d4-606bfe2e92e9",
    slug: "tea-one",
    displayName: "Tea One",
    brandName: "Tea One",
    brandSlug: "tea-one",
    suburb: "Newmarket",
    address: "123 Coconut Road, Auckland",
    latitude: -36.87,
    longitude: 174.77,
    imageUrl: null,
    imageAltText: null
  }
];

test("matches only visible drink names", () => {
  expect(filterPublicDiscoveryDrinks(drinks, "mango")).toEqual([drinks[1]]);
  expect(filterPublicDiscoveryDrinks(drinks, "coconut")).toEqual([drinks[3]]);
  expect(filterPublicDiscoveryDrinks(drinks, "COCONUT")).toEqual([drinks[3]]);
  expect(filterPublicDiscoveryDrinks(drinks, "nut")).toEqual([drinks[3]]);
  expect(filterPublicDiscoveryDrinks(drinks, "hidden brand")).toEqual([]);
  expect(filterPublicDiscoveryDrinks(drinks, "fruit tea")).toEqual([]);
  expect(filterPublicDiscoveryDrinks(drinks, "hidden")).toEqual([]);
});

test("matches only visible store display names", () => {
  expect(filterPublicDiscoveryStores(stores, "  GONG  ")).toEqual([
    stores[0],
    stores[1]
  ]);
  expect(filterPublicDiscoveryStores(stores, "albany")).toEqual([stores[0]]);
  expect(filterPublicDiscoveryStores(stores, "coconut")).toEqual([]);
});

test("returns grouped Drink and Store search results", () => {
  expect(searchPublicDiscovery(drinks, stores, "albany")).toEqual({
    drinks: [],
    stores: [stores[0]]
  });
});

test("returns no results for an empty query", () => {
  expect(searchPublicDiscovery(drinks, stores, "  ")).toEqual({
    drinks: [],
    stores: []
  });
});
