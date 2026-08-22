import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";

export const HOME_DRINK_LIMIT = 4;
export const HOME_STORE_LIMIT = 2;

export function selectHomeHeroDrink(
  drinks: PublicDrink[],
  random: () => number = Math.random
) {
  const imageBackedDrinks = drinks.filter((drink) => Boolean(drink.imageUrl));
  const pool = imageBackedDrinks.length > 0 ? imageBackedDrinks : drinks;
  if (pool.length === 0) return null;

  const rawIndex = Math.floor(random() * pool.length);
  const index = Number.isFinite(rawIndex)
    ? Math.min(Math.max(rawIndex, 0), pool.length - 1)
    : 0;
  return pool[index] ?? null;
}

export function selectHomeDrinks(
  drinks: PublicDrink[],
  random: () => number = Math.random,
  excludeDrinkId?: string
) {
  const uniqueDrinks: PublicDrink[] = [];
  const seenIds = new Set<string>();
  for (const drink of drinks) {
    if (seenIds.has(drink.id)) continue;
    seenIds.add(drink.id);
    uniqueDrinks.push(drink);
  }

  const canExcludeDrink =
    excludeDrinkId && uniqueDrinks.length > HOME_DRINK_LIMIT;
  const eligibleDrinks = canExcludeDrink
    ? uniqueDrinks.filter((drink) => drink.id !== excludeDrinkId)
    : uniqueDrinks;
  const imageBackedDrinks = eligibleDrinks.filter((drink) =>
    Boolean(drink.imageUrl)
  );
  const fallbackDrinks = eligibleDrinks.filter((drink) => !drink.imageUrl);
  const imageSelection = sampleHomeDrinks(
    imageBackedDrinks,
    Math.min(HOME_DRINK_LIMIT, imageBackedDrinks.length),
    random
  );
  const fallbackSelection = sampleHomeDrinks(
    fallbackDrinks,
    HOME_DRINK_LIMIT - imageSelection.length,
    random
  );

  return [...imageSelection, ...fallbackSelection];
}

function sampleHomeDrinks(
  drinks: PublicDrink[],
  limit: number,
  random: () => number
) {
  const pool = [...drinks];
  const selectionLimit = Math.min(pool.length, limit);

  for (let index = 0; index < selectionLimit; index += 1) {
    const remaining = pool.length - index;
    const rawOffset = Math.floor(random() * remaining);
    const offset = Number.isFinite(rawOffset)
      ? Math.min(Math.max(rawOffset, 0), remaining - 1)
      : 0;
    const selectedIndex = index + offset;

    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }

  return pool.slice(0, selectionLimit);
}

export function selectHomeStores(
  stores: PublicStore[],
  random: () => number = Math.random
) {
  const pool = [...stores];
  const limit = Math.min(pool.length, HOME_STORE_LIMIT);

  for (let index = 0; index < limit; index += 1) {
    const remaining = pool.length - index;
    const rawOffset = Math.floor(random() * remaining);
    const offset = Number.isFinite(rawOffset)
      ? Math.min(Math.max(rawOffset, 0), remaining - 1)
      : 0;
    const selectedIndex = index + offset;

    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }

  return pool.slice(0, limit);
}

export function selectHomeCategories(categories: PublicDrinkCategory[]) {
  return categories.filter((category) => category.slug && category.name);
}
