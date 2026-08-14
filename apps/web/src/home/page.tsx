import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { DrinkCard } from "../drinks/page";
import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";
import { loadPublicExploreData } from "../explore/data";
import {
  selectHomeCategories,
  selectHomeDrinks,
  selectHomeStores
} from "./data";

function StorePreviewCard({
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
      className="flex min-h-[96px] items-center gap-3 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md"
      to={`/stores/${store.slug}`}
    >
      {store.imageUrl && !imageError ? (
        <img
          alt={store.imageAltText ?? `${store.displayName} store`}
          className="size-[80px] shrink-0 rounded-lg border border-border object-cover"
          src={store.imageUrl}
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`flex size-[80px] shrink-0 items-center justify-center rounded-lg border border-border ${accent} text-[10px] text-primary`}
        >
          Store image
        </div>
      )}
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-card-foreground">
          {store.displayName}
        </h3>
        <p className="truncate text-sm text-primary">{store.brandName}</p>
        <p className="truncate text-sm text-muted-foreground">{store.suburb}</p>
      </div>
    </Link>
  );
}

function HeroVisual({ drink }: { drink: PublicDrink | null }) {
  const [imageError, setImageError] = useState(false);

  if (drink?.imageUrl && !imageError) {
    return (
      <img
        alt={drink.imageAltText ?? `${drink.name} from ${drink.brandName}`}
        className="h-full min-h-[180px] w-full rounded-xl border border-border object-cover md:min-h-0"
        src={drink.imageUrl}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex min-h-[180px] items-center justify-center rounded-xl border border-border bg-[#f0a08c] text-sm text-primary md:min-h-0"
    >
      Hero image · drink + Auckland
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Loading Home"
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

function CategoryLink({ category }: { category: PublicDrinkCategory }) {
  return (
    <Link
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent"
      to={`/drinks?category=${encodeURIComponent(category.slug)}`}
    >
      {category.name}
    </Link>
  );
}

function setHomeMetadata() {
  document.title = "WeMilktea — Auckland milk tea guide";
  const description =
    "Discover Auckland milk tea drinks, stores and small discoveries with WeMilktea.";
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  tag.content = description;
}

export function HomePage() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [content, setContent] = useState<{
    drinks: PublicDrink[];
    stores: PublicStore[];
    categories: PublicDrinkCategory[];
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await loadPublicExploreData();
    if (result.error || !result.data) {
      setStatus("error");
      return;
    }
    setContent(result.data);
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
    setHomeMetadata();
  }, [load]);

  const drinks = useMemo(
    () => selectHomeDrinks(content?.drinks ?? []),
    [content?.drinks]
  );
  const stores = useMemo(
    () => selectHomeStores(content?.stores ?? []),
    [content?.stores]
  );
  const categories = useMemo(
    () => selectHomeCategories(content?.categories ?? []),
    [content?.categories]
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = search.trim();
    navigate(value ? `/explore?q=${encodeURIComponent(value)}` : "/explore");
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader onSearch={() => searchRef.current?.focus()} />
      <main className="mx-auto max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 md:pt-8">
        <section className="grid gap-5 rounded-2xl bg-accent p-5 md:grid-cols-[1.05fr_0.95fr] md:items-stretch md:gap-8 md:p-8 lg:p-10">
          <div className="flex flex-col justify-center rounded-xl bg-card p-6 md:p-8">
            <p className="text-xs font-medium tracking-wide text-primary">
              AUCKLAND MILK TEA
            </p>
            <h1 className="mt-4 max-w-[560px] text-[32px] font-semibold leading-10 md:text-[40px] md:leading-[48px]">
              Discover. Decide. Go.
            </h1>
            <p className="mt-4 max-w-[500px] text-base leading-6 text-muted-foreground">
              Auckland&apos;s drinks, stores and small discoveries — in one
              useful place.
            </p>
            <Link
              className="mt-6 hidden min-h-11 w-fit items-center rounded-xl bg-primary px-6 text-xs font-medium text-primary-foreground md:inline-flex"
              to="/picker"
            >
              Pick for me
            </Link>
          </div>
          <HeroVisual drink={drinks[0] ?? null} />
        </section>

        <form className="mt-5" role="search" onSubmit={submitSearch}>
          <label className="relative block" htmlFor="home-search">
            <span className="sr-only">Search stores or drinks</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold"
            >
              ⌕
            </span>
            <input
              aria-label="Search stores or drinks"
              className="h-[52px] w-full rounded-xl border border-border bg-card px-12 text-base text-foreground placeholder:text-muted-foreground"
              id="home-search"
              placeholder="Search stores or drinks"
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </form>

        <Link
          className="mt-5 flex min-h-[190px] flex-col justify-between rounded-xl bg-accent p-5 md:hidden"
          to="/picker"
        >
          <div>
            <p className="text-xs font-medium tracking-wide text-primary">
              DAILY MILK TEA PICKER
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-7">
              Can&apos;t decide? Let the sign choose.
            </h2>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              A tiny ritual for a very important drink.
            </p>
          </div>
          <span className="mt-4 inline-flex min-h-11 w-fit items-center rounded-xl bg-primary px-5 text-xs font-medium text-primary-foreground">
            Pick for me
          </span>
        </Link>

        {status === "loading" ? (
          <div className="mt-8">
            <HomeSkeleton />
          </div>
        ) : null}
        {status === "error" ? (
          <section
            className="mt-8 rounded-xl border border-border bg-card p-6"
            role="alert"
          >
            <p className="text-sm text-destructive">
              Some discoveries are unavailable right now. Please try again.
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

        {status === "ready" ? (
          <>
            <section className="mt-10" aria-labelledby="home-drinks-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-primary">
                    DRINK DISCOVERY
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold"
                    id="home-drinks-heading"
                  >
                    Worth trying
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A few good places to start.
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-primary"
                  to="/drinks"
                >
                  View all
                </Link>
              </div>
              {drinks.length > 0 ? (
                <div className="mt-4 flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">
                  {drinks.map((drink, index) => (
                    <DrinkCard drink={drink} index={index} key={drink.id} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  No published drinks are available yet. Explore stores while
                  the catalogue grows.
                </p>
              )}
            </section>

            <section className="mt-10" aria-labelledby="home-stores-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-primary">
                    AUCKLAND STOPS
                  </p>
                  <h2
                    className="mt-2 text-2xl font-semibold"
                    id="home-stores-heading"
                  >
                    Around Auckland
                  </h2>
                </div>
                <Link
                  className="text-sm font-semibold text-primary"
                  to="/stores"
                >
                  View all
                </Link>
              </div>
              {stores.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {stores.map((store, index) => (
                    <StorePreviewCard
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
              <Link
                className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-xs font-medium text-foreground hover:bg-accent"
                to="/explore"
              >
                Explore Auckland
              </Link>
            </section>

            <section
              className="mt-10"
              aria-labelledby="home-categories-heading"
            >
              <h2
                className="text-xl font-semibold"
                id="home-categories-heading"
              >
                Explore by type
              </h2>
              {categories.length > 0 ? (
                <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2">
                  {categories.map((category) => (
                    <CategoryLink category={category} key={category.id} />
                  ))}
                </div>
              ) : (
                <Link
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 text-xs font-medium text-foreground hover:bg-accent"
                  to="/drinks"
                >
                  Browse drinks
                </Link>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
