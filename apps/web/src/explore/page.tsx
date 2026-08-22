import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { Seo } from "../seo";
import { DrinkCard } from "../drinks/page";
import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";
import {
  exploreSearchMatches,
  loadPublicExploreData,
  type ExploreFilter
} from "./data";

function StoreResultCard({
  store,
  index
}: {
  store: PublicStore;
  index: number;
}) {
  const [imageError, setImageError] = useState(false);
  const accent = index % 2 === 0 ? "bg-[#a97850]" : "bg-[#c58a62]";

  return (
    <Link
      className="flex min-h-[92px] items-center gap-3 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md"
      to={`/stores/${store.slug}`}
    >
      {store.imageUrl && !imageError ? (
        <img
          alt={store.imageAltText ?? `${store.displayName} store`}
          className="size-[74px] shrink-0 rounded-lg border border-border object-cover"
          src={store.imageUrl}
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`flex size-[74px] shrink-0 items-center justify-center rounded-lg border border-border ${accent} text-[10px] text-[#111711]`}
        >
          Store image
        </div>
      )}
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-card-foreground">
          {store.displayName}
        </h3>
        <p className="truncate text-sm text-muted-foreground">
          {store.brandName} · {store.suburb}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {store.address}
        </p>
      </div>
    </Link>
  );
}

function ExploreSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Loading explore"
      role="status"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className="h-[284px] animate-pulse rounded-xl border border-border bg-card"
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

function ExploreFilterChip({
  label,
  selected,
  onClick
}: {
  label: string;
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
      {label}
    </button>
  );
}

export function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<{
    drinks: PublicDrink[];
    stores: PublicStore[];
    categories: PublicDrinkCategory[];
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const query = searchParams.get("q") ?? "";
  const requestedFilter = searchParams.get("filter") ?? "";
  const filter: ExploreFilter =
    requestedFilter === "seasonal" ? "seasonal" : "";
  const hasSearch = Boolean(query.trim() || filter);

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await loadPublicExploreData();
    if (result.error || !result.data) {
      setStatus("error");
      return;
    }
    setData(result.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(
    () =>
      data
        ? exploreSearchMatches(data.drinks, data.stores, query, filter)
        : { drinks: [], stores: [] },
    [data, filter, query]
  );
  const editorialDrinks = useMemo(
    () =>
      [...(data?.drinks ?? [])]
        .sort(
          (left, right) =>
            Number(right.isSeasonal) - Number(left.isSeasonal) ||
            left.name.localeCompare(right.name)
        )
        .slice(0, 4),
    [data?.drinks]
  );
  const editorialStores = useMemo(
    () => (data?.stores ?? []).slice(0, 4),
    [data?.stores]
  );

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const updateFilter = (value: ExploreFilter) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("filter", value);
    else next.delete("filter");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        description="Explore canonical WeMilktea drinks and stores across Auckland, then find your next milk tea stop."
        path="/explore"
        robots={hasSearch ? "noindex, follow" : "index, follow"}
        title="Explore Auckland Milk Tea | WeMilktea"
      />
      <PublicHeader onSearch={() => searchRef.current?.focus()} />
      <main className="mx-auto max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 lg:pt-8">
        <section className="rounded-2xl border border-border bg-[#dfead5] p-6 md:grid md:grid-cols-[1.15fr_0.85fr] md:items-center md:p-10">
          <div>
            <p className="text-xs font-medium tracking-wide text-primary">
              EXPLORE AUCKLAND
            </p>
            <h1 className="mt-4 max-w-[620px] text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] md:text-[48px]">
              See what&apos;s worth trying
            </h1>
            <p className="mt-4 max-w-[520px] text-base leading-6 text-muted-foreground">
              Find canonical WeMilktea drinks and stores to add to your next
              Auckland milk-tea stop.
            </p>
            <Link
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              to="/drinks"
            >
              Browse all drinks
            </Link>
          </div>
          <div
            aria-hidden="true"
            className="mt-6 hidden min-h-[180px] rounded-xl bg-[#c4d8b8] md:mt-0 md:block"
          />
        </section>

        <div className="mt-5">
          <label className="relative block" htmlFor="explore-search">
            <span className="sr-only">Search stores or drinks</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold"
            >
              ⌕
            </span>
            <input
              aria-label="Search stores or drinks"
              className="h-[52px] w-full rounded-xl border border-border bg-card px-12 pr-12 text-base text-foreground placeholder:text-muted-foreground"
              id="explore-search"
              placeholder="Search stores or drinks"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => updateSearch(event.target.value)}
            />
            {query ? (
              <button
                aria-label="Clear Explore search"
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-xl hover:bg-muted"
                type="button"
                onClick={() => updateSearch("")}
              >
                ×
              </button>
            ) : null}
          </label>
        </div>

        <div
          aria-label="Explore filters"
          className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
        >
          <ExploreFilterChip
            label="All"
            selected={!filter}
            onClick={() => updateFilter("")}
          />
          <ExploreFilterChip
            label="Seasonal drinks"
            selected={filter === "seasonal"}
            onClick={() =>
              updateFilter(filter === "seasonal" ? "" : "seasonal")
            }
          />
        </div>

        {status === "loading" ? (
          <div className="mt-8">
            <ExploreSkeleton />
          </div>
        ) : null}
        {status === "error" ? (
          <div
            className="mt-8 rounded-xl border border-border bg-card p-6"
            role="alert"
          >
            <p className="text-sm text-destructive">
              Explore is unavailable right now. Please try again.
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

        {status === "ready" && hasSearch ? (
          <section className="mt-8" aria-labelledby="explore-results-heading">
            <h2 className="text-xl font-semibold" id="explore-results-heading">
              Search results
            </h2>
            {matches.drinks.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Drinks
                </h3>
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,224px)] gap-4">
                  {matches.drinks.map((drink, index) => (
                    <DrinkCard
                      className="w-[224px] shrink-0"
                      drink={drink}
                      index={index}
                      key={drink.id}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {matches.stores.length > 0 ? (
              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  Stores
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.stores.map((store, index) => (
                    <StoreResultCard
                      index={index}
                      key={store.id}
                      store={store}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {!matches.drinks.length && !matches.stores.length ? (
              <div className="mt-4 rounded-xl border border-border bg-card p-6">
                <p className="text-base font-semibold">No matches found</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a different search or clear the filter.
                </p>
                <button
                  className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
                  type="button"
                  onClick={() => setSearchParams({}, { replace: true })}
                >
                  Clear search
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {status === "ready" && !hasSearch ? (
          <>
            <section className="mt-8" aria-labelledby="worth-trying-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-primary">
                    DISCOVERY NOTES
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold"
                    id="worth-trying-heading"
                  >
                    Worth trying
                  </h2>
                </div>
                <Link
                  className="text-sm font-semibold text-primary"
                  to="/drinks"
                >
                  See all drinks
                </Link>
              </div>
              {editorialDrinks.length > 0 ? (
                <div className="mt-4 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:overflow-visible">
                  {editorialDrinks.map((drink, index) => (
                    <DrinkCard
                      className="w-[224px] shrink-0"
                      drink={drink}
                      index={index}
                      key={drink.id}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  No published drinks are available yet.
                </p>
              )}
            </section>

            <section
              className="mt-10"
              aria-labelledby="around-auckland-heading"
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-primary">
                    LOCAL STOPS
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold"
                    id="around-auckland-heading"
                  >
                    Around Auckland
                  </h2>
                </div>
                <Link
                  className="text-sm font-semibold text-primary"
                  to="/stores"
                >
                  See all stores
                </Link>
              </div>
              {editorialStores.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {editorialStores.map((store, index) => (
                    <StoreResultCard
                      index={index}
                      key={store.id}
                      store={store}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  No published stores are available yet.
                </p>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
