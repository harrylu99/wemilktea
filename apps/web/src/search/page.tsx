import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { PublicFooter } from "../public-footer";
import { Seo } from "../seo";
import { DrinkCard } from "../drinks/page";
import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";
import {
  searchPublicDiscovery,
  loadPublicDiscoveryData
} from "../discovery/data";

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

function SearchSkeleton() {
  return (
    <div
      aria-label="Loading search results"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
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

export function SearchPage() {
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
  const hasQuery = Boolean(query.trim());

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await loadPublicDiscoveryData();
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
        ? searchPublicDiscovery(data.drinks, data.stores, query)
        : { drinks: [], stores: [] },
    [data, query]
  );

  const updateQuery = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const clearQuery = () => {
    updateQuery("");
    searchRef.current?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Seo
        description="Search published WeMilktea drinks and stores across Auckland."
        path="/search"
        robots="noindex, follow"
        title="Search WeMilktea"
      />
      <PublicHeader onSearch={() => searchRef.current?.focus()} />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 lg:pt-8">
        <p className="text-xs font-medium tracking-wide text-primary">SEARCH</p>
        <h1 className="mt-3 text-3xl font-semibold">
          Search drinks and stores
        </h1>
        <div className="mt-5">
          <label className="relative block" htmlFor="search-input">
            <span className="sr-only">Search drinks and stores</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold"
            >
              ⌕
            </span>
            <input
              aria-label="Search drinks and stores"
              className="search-input-custom-clear h-[52px] w-full rounded-xl border border-border bg-card px-12 pr-12 text-base text-foreground placeholder:text-muted-foreground"
              id="search-input"
              placeholder="Search drinks and stores"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
            />
            {hasQuery ? (
              <button
                aria-label="Clear search"
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-xl hover:bg-muted"
                type="button"
                onClick={clearQuery}
              >
                ×
              </button>
            ) : null}
          </label>
        </div>

        {!hasQuery && status === "ready" ? (
          <p className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Search drinks and stores across Auckland.
          </p>
        ) : null}
        {status === "loading" ? (
          <div className="mt-8">
            <SearchSkeleton />
          </div>
        ) : null}
        {status === "error" ? (
          <section
            className="mt-8 rounded-xl border border-border bg-card p-6"
            role="alert"
          >
            <p className="text-sm text-destructive">
              Search is unavailable right now. Please try again.
            </p>
            <button
              className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
              type="button"
              onClick={() => void load()}
            >
              Try again
            </button>
          </section>
        ) : null}

        {status === "ready" && hasQuery ? (
          <section className="mt-8" aria-labelledby="search-results-heading">
            <h2 className="text-xl font-semibold" id="search-results-heading">
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
                  Try a different search.
                </p>
                <button
                  className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
                  type="button"
                  onClick={clearQuery}
                >
                  Clear search
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
      <PublicFooter />
    </div>
  );
}
