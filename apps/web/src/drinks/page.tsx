import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { PublicFooter } from "../public-footer";
import { Seo } from "../seo";
import {
  drinkDetailPath,
  filterPublicDrinks,
  loadPublicDrinks,
  type PublicDrink,
  type PublicDrinkCategory
} from "./data";

function DrinkImage({ drink, index }: { drink: PublicDrink; index: number }) {
  const [hasImageError, setHasImageError] = useState(false);
  const fallbackColours = ["bg-[#f0a08c]", "bg-[#e5c879]", "bg-[#b7cda9]"];

  if (drink.imageUrl && !hasImageError) {
    return (
      <img
        alt={drink.imageAltText ?? `${drink.name} from ${drink.brandName}`}
        className="h-[148px] w-full object-cover"
        src={drink.imageUrl}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex h-[148px] w-full items-center justify-center ${fallbackColours[index % fallbackColours.length]} text-xs font-medium text-[#111711]`}
    >
      Drink image
    </div>
  );
}

export function DrinkCard({
  drink,
  index,
  className
}: {
  drink: PublicDrink;
  index: number;
  className?: string;
}) {
  return (
    <Link
      aria-label={`View ${drink.name} by ${drink.brandName}`}
      className={`flex min-h-[284px] flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md ${className ?? ""}`}
      to={drinkDetailPath(drink)}
    >
      <DrinkImage drink={drink} index={index} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-4">
        <h2 className="break-words text-xl font-semibold leading-7 text-card-foreground">
          {drink.name}
        </h2>
        <p className="break-words text-xs font-medium leading-4 text-primary">
          {drink.brandName} · {drink.categoryName}
        </p>
        <p className="break-words text-sm leading-5 text-muted-foreground">
          Available at {drink.availableStoreCount}{" "}
          {drink.availableStoreCount === 1 ? "store" : "stores"}
        </p>
      </div>
    </Link>
  );
}

function DrinkSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,224px)]"
      aria-label="Loading drinks"
      role="status"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="h-[284px] w-full animate-pulse overflow-hidden rounded-xl border border-border bg-card"
          key={index}
        >
          <div className="h-[148px] bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-6 w-4/5 rounded bg-muted" />
            <div className="h-4 w-3/5 rounded bg-muted" />
            <div className="h-4 w-4/5 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryChip({
  category,
  selected,
  onClick
}: {
  category: Pick<PublicDrinkCategory, "slug" | "name">;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`h-11 shrink-0 rounded-full border px-4 text-xs font-medium transition-colors ${selected ? "border-[#93b58b] bg-[#93b58b] text-foreground" : "border-border bg-[#f3f5ef] text-foreground hover:bg-accent"}`}
      type="button"
      onClick={onClick}
    >
      {category.name}
    </button>
  );
}

export function DrinksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [drinks, setDrinks] = useState<PublicDrink[]>([]);
  const [categories, setCategories] = useState<PublicDrinkCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const query = searchParams.get("q") ?? "";
  const categorySlug = searchParams.get("category") ?? "";

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await loadPublicDrinks();
    if (result.error || !result.data || !result.categories) {
      setStatus("error");
      return;
    }
    setDrinks(result.data);
    setCategories(result.categories);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleDrinks = useMemo(
    () => filterPublicDrinks(drinks, { query, categorySlug }),
    [drinks, query, categorySlug]
  );

  const updateSearchParams = (updates: { q?: string; category?: string }) => {
    const next = new URLSearchParams(searchParams);
    if (updates.q !== undefined) {
      if (updates.q) next.set("q", updates.q);
      else next.delete("q");
    }
    if (updates.category !== undefined) {
      if (updates.category) next.set("category", updates.category);
      else next.delete("category");
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Seo
        description="Browse canonical milk tea and bubble tea drinks available around Auckland."
        path="/drinks"
        robots={
          query.trim() || categorySlug ? "noindex, follow" : "index, follow"
        }
        title="Milk Tea Drinks in Auckland | WeMilktea"
      />
      <PublicHeader onSearch={() => searchRef.current?.focus()} />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-8 pt-5 sm:px-8">
        <p className="text-xs font-medium leading-4 text-primary">DRINKS</p>
        <h1 className="mt-4 text-[32px] font-semibold leading-10">
          Find your next cup
        </h1>

        <div className="mt-[18px]">
          <label className="relative block" htmlFor="drink-search">
            <span className="sr-only">Search drinks, brands or categories</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold"
            >
              ⌕
            </span>
            <input
              aria-label="Search drinks, brands or categories"
              className="search-input-custom-clear h-[52px] w-full rounded-xl border border-border bg-card px-12 pr-12 text-base text-foreground placeholder:text-muted-foreground"
              id="drink-search"
              placeholder="Search drinks, brands or categories"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) =>
                updateSearchParams({ q: event.target.value })
              }
            />
            {query ? (
              <button
                aria-label="Clear drink search"
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-xl hover:bg-muted"
                type="button"
                onClick={() => updateSearchParams({ q: "" })}
              >
                ×
              </button>
            ) : null}
          </label>
        </div>

        <div
          aria-label="Drink categories"
          className="mt-[18px] flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
        >
          <CategoryChip
            category={{ name: "All drinks", slug: "" }}
            selected={!categorySlug}
            onClick={() => updateSearchParams({ category: "" })}
          />
          {categories.map((category) => (
            <CategoryChip
              category={category}
              key={category.id}
              selected={categorySlug === category.slug}
              onClick={() =>
                updateSearchParams({
                  category: categorySlug === category.slug ? "" : category.slug
                })
              }
            />
          ))}
        </div>

        <section aria-labelledby="drinks-results-heading" className="mt-5">
          <h2
            className="text-xl font-semibold leading-7"
            id="drinks-results-heading"
          >
            Drinks
          </h2>

          {status === "loading" ? (
            <div className="mt-[18px]">
              <DrinkSkeleton />
            </div>
          ) : null}

          {status === "error" ? (
            <div
              className="mt-[18px] rounded-xl border border-border bg-card p-6"
              role="alert"
            >
              <p className="text-sm text-destructive">
                Drinks are unavailable right now. Please try again.
              </p>
              <button
                className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
                type="button"
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          ) : null}

          {status === "ready" && drinks.length === 0 ? (
            <div className="mt-[18px] rounded-xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                No drinks to show yet. Check back soon.
              </p>
            </div>
          ) : null}

          {status === "ready" &&
          drinks.length > 0 &&
          visibleDrinks.length === 0 ? (
            <div className="mt-[18px] rounded-xl border border-border bg-card p-6">
              <p className="text-base font-semibold">No drinks found</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try another search or category.
              </p>
              <button
                className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          ) : null}

          {status === "ready" && visibleDrinks.length > 0 ? (
            <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,224px)]">
              {visibleDrinks.map((drink, index) => (
                <DrinkCard drink={drink} index={index} key={drink.id} />
              ))}
            </div>
          ) : null}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
