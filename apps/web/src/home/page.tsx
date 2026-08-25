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
import { PublicFooter } from "../public-footer";
import { Seo } from "../seo";
import { publicSiteDescription } from "../seo-utils";
import { DrinkCard } from "../drinks/page";
import type { PublicDrink, PublicDrinkCategory } from "../drinks/data";
import type { PublicStore } from "../stores/data";
import { loadPublicDiscoveryData } from "../discovery/data";
import { HorizontalScrollControls } from "../horizontal-scroll-controls";
import { useHorizontalScrollControls } from "../horizontal-scroll";
import {
  selectHomeCategories,
  selectHomeDrinks,
  selectHomeHeroDrink,
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
      className="discovery-card flex min-h-[96px] items-center gap-3 rounded-xl border border-border bg-card p-2"
      to={`/stores/${store.slug}`}
    >
      {store.imageUrl && !imageError ? (
        <div className="size-[80px] shrink-0 overflow-hidden rounded-lg border border-border">
          <img
            alt={store.imageAltText ?? `${store.displayName} store`}
            className="discovery-card-image size-full object-cover"
            src={store.imageUrl}
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className={`flex size-[80px] shrink-0 items-center justify-center rounded-lg border border-border ${accent} text-[10px] text-[#111711]`}
        >
          Store image
        </div>
      )}
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold text-card-foreground">
          {store.displayName}
        </h3>
        <p className="break-words text-sm text-primary">{store.brandName}</p>
        <p className="break-words text-sm text-muted-foreground">
          {store.suburb}
        </p>
      </div>
    </Link>
  );
}

const heroMediaClassName =
  "relative h-[250px] overflow-hidden rounded-xl border border-border sm:h-[clamp(320px,48vw,380px)] lg:h-[clamp(360px,45svh,500px)]";

function HeroVisual({
  drink,
  isLoading
}: {
  drink: PublicDrink | null;
  isLoading: boolean;
}) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [drink?.id, drink?.imageUrl]);

  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className={`${heroMediaClassName} animate-pulse bg-muted`}
      />
    );
  }

  if (drink?.imageUrl && !imageError) {
    return (
      <div className={heroMediaClassName}>
        <img
          alt={drink.imageAltText ?? `${drink.name} from ${drink.brandName}`}
          className="absolute inset-0 h-full w-full object-cover"
          src={drink.imageUrl}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={`${heroMediaClassName} bg-[#f0a08c]`} />
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

export function HomePage() {
  const navigate = useNavigate();
  const loadRequestIdRef = useRef(0);
  const drinksScrollerRef = useRef<HTMLDivElement>(null);
  const categoriesScrollerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [content, setContent] = useState<{
    drinks: PublicDrink[];
    stores: PublicStore[];
    categories: PublicDrinkCategory[];
  } | null>(null);
  const [heroDrink, setHeroDrink] = useState<PublicDrink | null>(null);
  const [homeDrinks, setHomeDrinks] = useState<PublicDrink[]>([]);
  const [homeStores, setHomeStores] = useState<PublicStore[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    setStatus("loading");
    setContent(null);
    setHeroDrink(null);
    setHomeDrinks([]);
    setHomeStores([]);

    const result = await loadPublicDiscoveryData();

    // Ignore an older request if another Home load has started.
    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    if (result.error || !result.data) {
      setStatus("error");
      return;
    }
    const hero = selectHomeHeroDrink(result.data.drinks);
    setContent(result.data);
    setHeroDrink(hero);
    setHomeDrinks(selectHomeDrinks(result.data.drinks, Math.random, hero?.id));
    setHomeStores(selectHomeStores(result.data.stores));
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();

    return () => {
      // Invalidate any request still running during Strict Mode cleanup/unmount.
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  const drinks = homeDrinks;
  const categories = useMemo(
    () => selectHomeCategories(content?.categories ?? []),
    [content?.categories]
  );
  const drinksScroll = useHorizontalScrollControls(
    drinksScrollerRef,
    status === "ready" && drinks.length > 0
  );
  const categoriesScroll = useHorizontalScrollControls(
    categoriesScrollerRef,
    status === "ready" && categories.length > 0
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = search.trim();
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Seo
        description={publicSiteDescription}
        path="/"
        title="WeMilktea | Discover Milk Tea & Bubble Tea in Auckland"
      />
      <PublicHeader />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-12 pt-5 sm:px-8 md:pt-8">
        <section className="grid items-center gap-5 rounded-2xl bg-accent p-5 md:grid-cols-[0.95fr_1.05fr] md:gap-8 md:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
          <div className="flex flex-col justify-center rounded-xl bg-card p-6 md:p-8">
            <p className="text-xs font-medium tracking-wide text-primary">
              AUCKLAND MILK TEA
            </p>
            <h1 className="mt-4 max-w-[560px] text-[32px] font-semibold leading-10 md:text-[40px] md:leading-[48px]">
              What are we drinking today?
            </h1>
            <p className="mt-4 max-w-[500px] text-base leading-6 text-muted-foreground">
              Find a new favourite, pick a store, or let fate choose.
            </p>
            <Link
              className="mt-6 hidden min-h-11 w-fit items-center rounded-xl bg-primary px-6 text-xs font-medium text-primary-foreground md:inline-flex"
              to="/picker"
            >
              Pick for me
            </Link>
          </div>
          <HeroVisual drink={heroDrink} isLoading={status === "loading"} />
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
                    Have you tried these?
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Maybe today&apos;s the day.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    className="text-sm font-semibold text-primary"
                    to="/drinks"
                  >
                    View all
                  </Link>
                  {drinksScroll.hasOverflow ? (
                    <HorizontalScrollControls
                      canScrollNext={drinksScroll.canScrollNext}
                      canScrollPrevious={drinksScroll.canScrollPrevious}
                      label="drinks"
                      onNext={drinksScroll.scrollNext}
                      onPrevious={drinksScroll.scrollPrevious}
                    />
                  ) : null}
                </div>
              </div>
              {drinks.length > 0 ? (
                <div
                  ref={drinksScrollerRef}
                  className="hide-scrollbar mt-4 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible"
                >
                  {drinks.map((drink, index) => (
                    <DrinkCard
                      className="w-[224px] shrink-0 lg:w-full lg:max-w-[280px] lg:min-w-0 lg:justify-self-center"
                      drink={drink}
                      index={index}
                      key={drink.id}
                    />
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
                    Where to next?
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A couple of Auckland spots worth a look.
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-primary"
                  to="/stores"
                >
                  View all
                </Link>
              </div>
              {homeStores.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {homeStores.map((store, index) => (
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
            </section>

            <section
              className="mt-10"
              aria-labelledby="home-categories-heading"
            >
              <div className="flex items-center justify-between gap-4">
                <h2
                  className="text-xl font-semibold"
                  id="home-categories-heading"
                >
                  Explore by type
                </h2>
                {categoriesScroll.hasOverflow ? (
                  <HorizontalScrollControls
                    canScrollNext={categoriesScroll.canScrollNext}
                    canScrollPrevious={categoriesScroll.canScrollPrevious}
                    label="drink types"
                    onNext={categoriesScroll.scrollNext}
                    onPrevious={categoriesScroll.scrollPrevious}
                  />
                ) : null}
              </div>
              {categories.length > 0 ? (
                <div
                  ref={categoriesScrollerRef}
                  className="hide-scrollbar mt-4 flex max-w-full gap-2 overflow-x-auto pb-2"
                >
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
      <PublicFooter />
    </div>
  );
}
