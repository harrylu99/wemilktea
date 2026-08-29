import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { PublicFooter } from "../public-footer";
import { PublicPagination } from "../public-pagination";
import { Seo } from "../seo";
import {
  drinkDetailPath,
  loadPublicDrinkCategories,
  loadPublicDrinksPage,
  type PublicDrink,
  type PublicDrinkCategory
} from "./data";
import {
  clampPage,
  DRINKS_PAGE_SIZE,
  parsePageParam,
  resetDrinksPage,
  setDrinksPage,
  totalPagesFor
} from "./pagination";
import { useDismissiblePopover } from "../use-dismissible-popover";
import { useDebouncedValue } from "../use-debounced-value";

function DrinkImage({ drink, index }: { drink: PublicDrink; index: number }) {
  const [hasImageError, setHasImageError] = useState(false);
  const fallbackColours = ["bg-[#f0a08c]", "bg-[#e5c879]", "bg-[#b7cda9]"];

  if (drink.imageUrl && !hasImageError) {
    return (
      <div className="h-[148px] overflow-hidden">
        <img
          alt={drink.imageAltText ?? `${drink.name} from ${drink.brandName}`}
          className="discovery-card-image h-full w-full object-cover"
          src={drink.imageUrl}
          onError={() => setHasImageError(true)}
        />
      </div>
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
      className={`discovery-card flex min-h-[284px] flex-col overflow-hidden rounded-xl border border-border bg-card ${className ?? ""}`}
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
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,224px)] lg:justify-between"
      aria-label="Loading drinks"
      role="status"
    >
      {Array.from({ length: 5 }, (_, index) => (
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
      className={`h-11 shrink-0 cursor-pointer rounded-full border px-4 text-xs font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-foreground hover:bg-accent"}`}
      type="button"
      onClick={onClick}
    >
      {category.name}
    </button>
  );
}

export function DrinksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersPopoverRef = useRef<HTMLDivElement>(null);
  const [drinks, setDrinks] = useState<PublicDrink[]>([]);
  const [categories, setCategories] = useState<PublicDrinkCategory[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [totalResults, setTotalResults] = useState(0);
  const requestIdRef = useRef(0);
  const lastWrittenQueryRef = useRef<string | null>(null);
  const syncingQueryRef = useRef<string | null>(null);
  const categoryRequestIdRef = useRef(0);
  const [categoryStatus, setCategoryStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const queryParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(queryParam);
  const debouncedQuery = useDebouncedValue(searchInput);
  const query = syncingQueryRef.current ?? debouncedQuery;
  const categorySlug = searchParams.get("category") ?? "";
  const pageParam = searchParams.get("page");
  const requestedPage = parsePageParam(pageParam);

  useEffect(() => {
    if (lastWrittenQueryRef.current === queryParam) {
      lastWrittenQueryRef.current = null;
      return;
    }
    syncingQueryRef.current = queryParam;
    setSearchInput(queryParam);
  }, [queryParam]);

  useEffect(() => {
    if (syncingQueryRef.current !== null) {
      if (
        searchInput === syncingQueryRef.current &&
        debouncedQuery === syncingQueryRef.current
      ) {
        syncingQueryRef.current = null;
      }
      return;
    }
    if (!searchInput.trim()) {
      if (!queryParam) return;
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      lastWrittenQueryRef.current = "";
      setSearchParams(resetDrinksPage(next), { replace: true });
      return;
    }
    if (debouncedQuery === queryParam) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedQuery.trim()) next.set("q", debouncedQuery);
    else next.delete("q");
    lastWrittenQueryRef.current = debouncedQuery;
    setSearchParams(resetDrinksPage(next), { replace: true });
  }, [debouncedQuery, queryParam, searchInput, searchParams, setSearchParams]);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    const result = await loadPublicDrinksPage({
      categorySlug,
      page: requestedPage,
      pageSize: DRINKS_PAGE_SIZE,
      query
    });
    if (requestId !== requestIdRef.current) return;
    if (result.error || !result.data) {
      setStatus("error");
      return;
    }
    setDrinks(result.data);
    setTotalResults(result.totalResults);
    setStatus("ready");
  }, [categorySlug, query, requestedPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCategories = useCallback(async () => {
    const requestId = ++categoryRequestIdRef.current;
    setCategoryStatus("loading");
    const result = await loadPublicDrinkCategories();
    if (requestId !== categoryRequestIdRef.current) return;
    if (result.error || !result.data) {
      setCategoryStatus("error");
      return;
    }
    setCategories(result.data);
    setCategoryStatus("ready");
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const totalPages = totalPagesFor(totalResults);
  const currentPage = clampPage(requestedPage, totalPages);

  useEffect(() => {
    if (status !== "ready") return;
    const normalizedPage = currentPage > 1 ? String(currentPage) : null;
    if (pageParam === normalizedPage) return;

    const next = new URLSearchParams(searchParams);
    if (normalizedPage) next.set("page", normalizedPage);
    else next.delete("page");
    setSearchParams(next, { replace: true });
  }, [currentPage, pageParam, searchParams, setSearchParams, status]);

  const updateSearchParams = (updates: { q?: string; category?: string }) => {
    if (updates.q !== undefined) {
      syncingQueryRef.current = null;
      setSearchInput(updates.q);
      if (!updates.q) {
        const next = new URLSearchParams(searchParams);
        next.delete("q");
        lastWrittenQueryRef.current = "";
        setSearchParams(resetDrinksPage(next), { replace: true });
      }
      return;
    }

    const next = new URLSearchParams(searchParams);
    if (updates.category !== undefined) {
      if (updates.category) next.set("category", updates.category);
      else next.delete("category");
    }
    setSearchParams(resetDrinksPage(next), { replace: true });
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchParams({}, { replace: true });
  };

  const closeFilters = useCallback(() => {
    setFiltersOpen(false);
    filtersButtonRef.current?.focus();
  }, []);

  useDismissiblePopover({
    onClose: closeFilters,
    open: filtersOpen,
    popoverRef: filtersPopoverRef,
    triggerRef: filtersButtonRef
  });

  const updatePage = (page: number) => {
    setSearchParams(setDrinksPage(searchParams, page));

    const target = document.getElementById("drinks-results-heading");
    if (!target) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start"
    });
  };

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
      <PublicHeader />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-8 pt-5 sm:px-8">
        <p className="text-xs font-medium leading-4 text-primary">DRINKS</p>
        <h1 className="mt-4 text-[32px] font-semibold leading-10">
          What are we feeling today?
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
              placeholder="Search for whatever you are keen on today"
              type="search"
              value={searchInput}
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

        <div className="relative mt-[18px]">
          <button
            ref={filtersButtonRef}
            aria-controls="drink-filters-popover"
            aria-expanded={filtersOpen}
            className={`h-11 cursor-pointer rounded-xl border border-border px-4 text-xs font-semibold ${categorySlug ? "bg-accent text-primary" : "bg-card"}`}
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{categorySlug ? " · active" : ""}
          </button>
          {filtersOpen ? (
            <div
              id="drink-filters-popover"
              ref={filtersPopoverRef}
              aria-label="Drink filters"
              className="filter-popover"
              role="group"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-popover-foreground">
                  Filter drinks
                </p>
                <button
                  aria-label="Close filters"
                  className="grid size-10 cursor-pointer place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                  type="button"
                  onClick={closeFilters}
                >
                  ×
                </button>
              </div>
              <div
                aria-label="Drink categories"
                className="flex max-w-full flex-wrap gap-2 pb-1"
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
                        category:
                          categorySlug === category.slug ? "" : category.slug
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
          {categoryStatus === "error" ? (
            <div className="mt-3 flex items-center gap-3" role="alert">
              <p className="text-sm text-destructive">
                Drink categories are unavailable right now.
              </p>
              <button
                className="rounded-md border border-border bg-card px-3 py-2 text-xs font-medium"
                type="button"
                onClick={() => void loadCategories()}
              >
                Retry categories
              </button>
            </div>
          ) : null}
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

          {status === "ready" &&
          totalResults === 0 &&
          !query &&
          !categorySlug ? (
            <div className="mt-[18px] rounded-xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                No drinks to show yet. Check back soon.
              </p>
            </div>
          ) : null}

          {status === "ready" &&
          totalResults === 0 &&
          (query || categorySlug) ? (
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

          {status === "ready" && totalResults > 0 ? (
            <>
              <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,224px)] lg:justify-between">
                {drinks.map((drink, index) => (
                  <DrinkCard
                    drink={drink}
                    index={(currentPage - 1) * DRINKS_PAGE_SIZE + index}
                    key={drink.id}
                  />
                ))}
              </div>
              <PublicPagination
                currentPage={currentPage}
                onPageChange={updatePage}
                pageSize={DRINKS_PAGE_SIZE}
                totalPages={totalPages}
                totalResults={totalResults}
              />
            </>
          ) : null}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
