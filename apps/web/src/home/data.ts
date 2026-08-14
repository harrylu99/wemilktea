import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";

export const HOME_DRINK_LIMIT = 4;
export const HOME_STORE_LIMIT = 2;

export function selectHomeDrinks(drinks: PublicDrink[]) {
  return [...drinks]
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, HOME_DRINK_LIMIT);
}

export function selectHomeStores(stores: PublicStore[]) {
  return [...stores]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .slice(0, HOME_STORE_LIMIT);
}

export function selectHomeCategories(categories: PublicDrinkCategory[]) {
  return categories.filter((category) => category.slug && category.name);
}
