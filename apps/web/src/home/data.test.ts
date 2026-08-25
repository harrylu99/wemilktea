import { expect, test } from "bun:test";
import {
  homeHeroBrandCopy,
  selectHomeCategories,
  selectHomeDrinks,
  selectHomeHeroDrink,
  selectHomeStores
} from "./data";
import type { PublicDrink } from "../drinks/data";
import type { PublicStore } from "../stores/data";

const drink = (name: string, id: string): PublicDrink => ({
  id,
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  categoryName: "Milk Tea",
  categorySlug: "milk-tea",
  description: null,
  discoveryTags: [],
  isSeasonal: false,
  imageUrl: null,
  imageAltText: null,
  availableStoreCount: 1
});

const drinkWithImage = (name: string, id: string): PublicDrink => ({
  ...drink(name, id),
  imageUrl: `https://cdn.example.com/${id}.jpg`
});

const store = (displayName: string, id: string): PublicStore => ({
  id,
  slug: displayName.toLowerCase().replaceAll(" ", "-"),
  displayName,
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  suburb: "Auckland",
  address: "Auckland",
  latitude: -36.85,
  longitude: 174.76,
  imageUrl: null,
  imageAltText: null
});

test("builds safe Home hero brand copy", () => {
  expect(homeHeroBrandCopy("Gong cha")).toBe("Find it at Gong cha");
  expect(homeHeroBrandCopy("  Gong cha  ")).toBe("Find it at Gong cha");
  expect(homeHeroBrandCopy(null)).toBeNull();
  expect(homeHeroBrandCopy(" ")).toBeNull();
});

test("returns an empty drink preview for an empty list", () => {
  expect(selectHomeDrinks([], () => 0)).toEqual([]);
});

test("returns all unique drinks when fewer than four are available", () => {
  const first = drink("First Drink", "drink-1");
  const second = drink("Second Drink", "drink-2");

  const selected = selectHomeDrinks([first, second, first], () => 0);

  expect(selected).toEqual([first, second]);
  expect(new Set(selected.map((item) => item.id)).size).toBe(2);
});

test("selects exactly four unique drinks from a larger list", () => {
  const drinks = [
    drink("Drink A", "drink-a"),
    drink("Drink B", "drink-b"),
    drink("Drink C", "drink-c"),
    drink("Drink D", "drink-d"),
    drink("Drink E", "drink-e")
  ];

  const selected = selectHomeDrinks(drinks, () => 0.5);

  expect(selected).toHaveLength(4);
  expect(new Set(selected.map((item) => item.id)).size).toBe(4);
});

test("supports deterministic partial Fisher-Yates drink sampling", () => {
  const drinks = ["A", "B", "C", "D", "E", "F"].map((name, index) =>
    drinkWithImage(name, `drink-${index}`)
  );
  const randomValues = [0, 0.8, 0.5, 0];

  expect(
    selectHomeDrinks(drinks, () => randomValues.shift() ?? 0).map(
      (item) => item.name
    )
  ).toEqual(["A", "F", "E", "D"]);
});

test("does not mutate the source drink list", () => {
  const drinks = [
    drink("Drink A", "drink-a"),
    drink("Drink B", "drink-b"),
    drink("Drink C", "drink-c"),
    drink("Drink D", "drink-d"),
    drink("Drink E", "drink-e")
  ];
  const originalOrder = drinks.map((item) => item.id);

  selectHomeDrinks(drinks, () => 0.9);

  expect(drinks.map((item) => item.id)).toEqual(originalOrder);
});

test("prefers image-backed drinks before filling from the fallback pool", () => {
  const selected = selectHomeDrinks(
    [
      drinkWithImage("Image A", "image-a"),
      drink("Fallback A", "fallback-a"),
      drinkWithImage("Image B", "image-b"),
      drink("Fallback B", "fallback-b"),
      drink("Fallback C", "fallback-c")
    ],
    () => 0
  );

  expect(selected.map((item) => item.name)).toEqual([
    "Image A",
    "Image B",
    "Fallback A",
    "Fallback B"
  ]);
});

test("fills safely when fewer than four drinks have images", () => {
  const selected = selectHomeDrinks(
    [
      drinkWithImage("Image A", "image-a"),
      drink("Fallback A", "fallback-a"),
      drink("Fallback B", "fallback-b"),
      drink("Fallback C", "fallback-c")
    ],
    () => 0
  );

  expect(selected).toHaveLength(4);
  expect(selected[0]?.imageUrl).toBeTruthy();
  expect(new Set(selected.map((item) => item.id)).size).toBe(4);
});

test("excludes the hero when enough alternative drinks exist", () => {
  const drinks = ["Hero", "A", "B", "C", "D"].map((name, index) =>
    drinkWithImage(name, `drink-${index}`)
  );

  expect(
    selectHomeDrinks(drinks, () => 0, "drink-0").map((item) => item.name)
  ).toEqual(["A", "B", "C", "D"]);
});

test("returns null for an empty hero candidate pool", () => {
  expect(selectHomeHeroDrink([], () => 0)).toBeNull();
});

test("prefers image-backed drinks for the hero", () => {
  const imageDrink = drinkWithImage(
    "Image Drink",
    "00000000-0000-0000-0000-000000000002"
  );
  const laterImageDrink = drinkWithImage(
    "Later Image Drink",
    "00000000-0000-0000-0000-000000000003"
  );

  expect(
    selectHomeHeroDrink(
      [
        drink("No Image Drink", "00000000-0000-0000-0000-000000000001"),
        imageDrink,
        laterImageDrink
      ],
      () => 0
    )
  ).toBe(imageDrink);
  expect(
    selectHomeHeroDrink(
      [
        drink("No Image Drink", "00000000-0000-0000-0000-000000000001"),
        imageDrink,
        laterImageDrink
      ],
      () => 0.9
    )
  ).toBe(laterImageDrink);
});

test("falls back to all drinks when none have images", () => {
  const secondDrink = drink(
    "Second Drink",
    "00000000-0000-0000-0000-000000000002"
  );

  expect(
    selectHomeHeroDrink(
      [
        drink("First Drink", "00000000-0000-0000-0000-000000000001"),
        secondDrink
      ],
      () => 0.9
    )
  ).toBe(secondDrink);
});

test("returns no Home store previews for an empty list", () => {
  expect(selectHomeStores([], () => 0)).toEqual([]);
});

test("returns the only Home store when one is available", () => {
  const onlyStore = store("Tea Talk", "00000000-0000-0000-0000-000000000001");

  expect(selectHomeStores([onlyStore], () => 0)).toEqual([onlyStore]);
});

test("randomly selects at most two unique Home stores", () => {
  const stores = [
    store("Tea Talk", "00000000-0000-0000-0000-000000000001"),
    store("Gong cha Albany", "00000000-0000-0000-0000-000000000002"),
    store("Chatime CBD", "00000000-0000-0000-0000-000000000003")
  ];

  const selected = selectHomeStores(stores, () => 0.5);

  expect(selected).toHaveLength(2);
  expect(new Set(selected.map((item) => item.id)).size).toBe(2);
});

test("supports deterministic Home store sampling", () => {
  const stores = [
    store("Store A", "00000000-0000-0000-0000-000000000001"),
    store("Store B", "00000000-0000-0000-0000-000000000002"),
    store("Store C", "00000000-0000-0000-0000-000000000003"),
    store("Store D", "00000000-0000-0000-0000-000000000004")
  ];
  const randomValues = [0.75, 0];

  expect(
    selectHomeStores(stores, () => randomValues.shift() ?? 0).map(
      (item) => item.displayName
    )
  ).toEqual(["Store D", "Store B"]);
});

test("does not mutate the source Home store list", () => {
  const stores = [
    store("Store A", "00000000-0000-0000-0000-000000000001"),
    store("Store B", "00000000-0000-0000-0000-000000000002"),
    store("Store C", "00000000-0000-0000-0000-000000000003")
  ];
  const originalOrder = stores.map((item) => item.id);

  selectHomeStores(stores, () => 0.9);

  expect(stores.map((item) => item.id)).toEqual(originalOrder);
});

test("keeps canonical category shortcuts", () => {
  expect(
    selectHomeCategories([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Matcha",
        slug: "matcha"
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Milk Tea",
        slug: "milk-tea"
      }
    ])
  ).toHaveLength(2);
});
