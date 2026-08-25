import { expect, test } from "bun:test";
import {
  createPickerCandidatesCache,
  filterPickerCandidates,
  pickerCandidatesCacheTtlMs,
  pickRecommendation,
  pickerResultPath,
  type PickerCandidate,
  type PickerQueryResult
} from "./data";

const store = (slug: string, displayName: string) => ({
  id: `00000000-0000-0000-0000-00000000000${slug.length}`,
  slug,
  displayName,
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  suburb: "Auckland",
  address: "Auckland",
  latitude: -36.85,
  longitude: 174.76,
  imageUrl: null,
  imageAltText: null,
  priceCents: 700,
  currency: "NZD"
});

const candidate = (
  name: string,
  categorySlug: string,
  discoveryTags: string[],
  stores: ReturnType<typeof store>[] = [store("albany", "Gong cha Albany")]
): PickerCandidate => ({
  id: `00000000-0000-0000-0000-00000000000${name.length}`,
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  brandName: "Gong cha",
  brandSlug: "gong-cha",
  categoryName: categorySlug,
  categorySlug,
  description: null,
  discoveryTags,
  isSeasonal: false,
  imageUrl: null,
  imageAltText: null,
  availableStoreCount: stores.length,
  availableStores: stores
});

const matcha = candidate("Matcha Latte", "matcha", ["light"]);
const milkTea = candidate("Brown Sugar Milk Tea", "milk-tea", ["classic"]);
const creamy = candidate("Taro Milk Tea", "milk-tea", ["creamy"]);
const refreshing = candidate("Citrus Tea", "fruit-tea", ["refreshing"]);

test("matches category cravings by canonical category slug", () => {
  expect(filterPickerCandidates([matcha, milkTea], "matcha")).toEqual([matcha]);
  expect(filterPickerCandidates([matcha, milkTea], "milk-tea")).toEqual([
    milkTea
  ]);
  expect(filterPickerCandidates([matcha, refreshing], "fruit-tea")).toEqual([
    refreshing
  ]);
});

test("matches mood cravings only against explicit discovery tags", () => {
  expect(filterPickerCandidates([milkTea, creamy], "creamy")).toEqual([creamy]);
  expect(filterPickerCandidates([milkTea, refreshing], "refreshing")).toEqual([
    refreshing
  ]);
});

test("Surprise Me includes the complete eligible product pool", () => {
  expect(filterPickerCandidates([matcha, milkTea, creamy], "surprise")).toEqual(
    [matcha, milkTea, creamy]
  );
});

test("selects the product before its store, without branch-count weighting", () => {
  const manyStores = candidate(
    "Many Branches",
    "milk-tea",
    ["classic"],
    [store("one", "One"), store("two", "Two")]
  );
  const oneStore = candidate("One Branch", "milk-tea", ["classic"]);

  const recommendation = pickRecommendation(
    [manyStores, oneStore],
    "milk-tea",
    () => 0.99
  );
  expect(recommendation?.candidate).toBe(oneStore);
  expect(recommendation?.store).toBe(oneStore.availableStores[0]);
});

test("handles RNG boundaries and no-match states", () => {
  expect(pickRecommendation([matcha], "refreshing", () => 0)).toBeNull();
  expect(
    pickRecommendation([matcha, milkTea], "surprise", () => 0)
  ).toMatchObject({
    candidate: matcha
  });
  expect(
    pickRecommendation([matcha, milkTea], "surprise", () => 0.999999)
  ).toMatchObject({
    candidate: milkTea
  });
  expect(
    pickRecommendation(
      [candidate("Unavailable Drink", "milk-tea", ["classic"], [])],
      "milk-tea",
      () => 0
    )
  ).toBeNull();
});

test("builds a reload-safe result route from canonical slugs and craving", () => {
  const recommendation = pickRecommendation([matcha], "matcha", () => 0)!;
  expect(pickerResultPath(recommendation)).toBe(
    "/picker/result/gong-cha/matcha-latte?store=albany&craving=matcha"
  );
});

test("reuses a successful Picker candidate result within the cache lifetime", async () => {
  let calls = 0;
  let now = 1_000;
  const result: PickerQueryResult = { data: [matcha], error: null };
  const cache = createPickerCandidatesCache(async () => {
    calls += 1;
    return result;
  });

  const first = await cache.load({ now: () => now });
  const second = await cache.load({ now: () => now + 1 });

  expect(calls).toBe(1);
  expect(second).toEqual(first);
  now += pickerCandidatesCacheTtlMs;
  await cache.load({ now: () => now });
  expect(calls).toBe(2);
});

test("shares one in-flight Picker candidate request", async () => {
  let calls = 0;
  let resolveRequest: ((result: PickerQueryResult) => void) | undefined;
  const cache = createPickerCandidatesCache(
    () =>
      new Promise<PickerQueryResult>((resolve) => {
        calls += 1;
        resolveRequest = resolve;
      })
  );

  const first = cache.load();
  const second = cache.load();
  expect(first).toBe(second);
  expect(calls).toBe(1);

  resolveRequest?.({ data: [matcha], error: null });
  await first;
});

test("does not cache failed Picker candidate requests and supports force reload", async () => {
  let calls = 0;
  const cache = createPickerCandidatesCache(async () => {
    calls += 1;
    return calls === 1
      ? { data: null, error: "query_failed" }
      : { data: [matcha], error: null };
  });

  const failed = await cache.load();
  const recovered = await cache.load();
  const forced = await cache.load({ force: true });

  expect(failed).toEqual({ data: null, error: "query_failed" });
  expect(recovered).toEqual({ data: [matcha], error: null });
  expect(forced).toEqual(recovered);
  expect(calls).toBe(3);
});
