import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import { Seo } from "../seo";
import { productJsonLd, publicUrl } from "../seo-utils";
import {
  loadPublicDrinkDetail,
  type PublicDrinkAvailableStore,
  type PublicDrinkDetail
} from "./detail-data";

function ProductImage({ drink }: { drink: PublicDrinkDetail }) {
  const [hasImageError, setHasImageError] = useState(false);
  if (drink.imageUrl && !hasImageError) {
    return (
      <img
        alt={drink.imageAltText ?? drink.name}
        className="h-[240px] w-full rounded-xl border border-border object-cover md:h-[280px] lg:h-[320px]"
        src={drink.imageUrl}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-[240px] w-full items-center justify-center rounded-xl border border-border bg-[#f0a08c] text-sm text-[#111711] md:h-[280px] lg:h-[320px]"
    >
      Drink image
    </div>
  );
}

function StoreImage({ store }: { store: PublicDrinkAvailableStore }) {
  const [hasImageError, setHasImageError] = useState(false);
  if (store.imageUrl && !hasImageError) {
    return (
      <img
        alt=""
        className="h-24 w-full object-cover"
        src={store.imageUrl}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-24 w-full items-center justify-center bg-[#a97850] text-xs text-[#111711]"
    >
      Store image
    </div>
  );
}

function formatPrice(priceCents: number | null, currency: string) {
  if (priceCents === null) return "Price not listed";
  return new Intl.NumberFormat("en-NZ", {
    currency,
    style: "currency"
  }).format(priceCents / 100);
}

function AvailableStoreCard({ store }: { store: PublicDrinkAvailableStore }) {
  return (
    <Link
      aria-label={`View ${store.displayName}`}
      className="w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
      to={`/stores/${encodeURIComponent(store.slug)}`}
    >
      <StoreImage store={store} />
      <div className="space-y-1 p-3">
        <h3 className="break-words text-xl font-semibold leading-7 text-card-foreground">
          {store.displayName}
        </h3>
        <p className="text-sm leading-5 text-muted-foreground">
          {store.suburb} · Auckland
        </p>
        <p className="text-sm font-semibold leading-5 text-primary">
          {formatPrice(store.priceCents, store.currency)}
        </p>
      </div>
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading drink details" role="status">
      <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div className="grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
        <div className="h-[240px] animate-pulse rounded-xl bg-muted md:h-[280px] lg:h-[320px]" />
        <div className="space-y-4 rounded-xl bg-card p-5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-5 w-full animate-pulse rounded bg-muted" />
          <div className="h-12 w-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

function DetailMessage({ notFound }: { notFound: boolean }) {
  return (
    <section className="mx-auto max-w-[680px] rounded-xl border border-border bg-card p-8 text-center">
      <h1 className="text-2xl font-semibold">
        {notFound
          ? "We couldn't find this drink."
          : "Drink details are unavailable."}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {notFound
          ? "Explore other milk-tea drinks in Auckland."
          : "Please try again, or browse the drinks catalogue."}
      </p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        to="/drinks"
      >
        Back to drinks
      </Link>
    </section>
  );
}

export function DrinkDetailPage() {
  const { brandSlug, productSlug } = useParams();
  const [drink, setDrink] = useState<PublicDrinkDetail | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "not_found" | "error"
  >("loading");
  const availableAtRef = useRef<HTMLElement>(null);
  const availableHeadingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    if (!brandSlug || !productSlug) {
      setStatus("not_found");
      return;
    }
    setStatus("loading");
    setDrink(null);
    const result = await loadPublicDrinkDetail(brandSlug, productSlug);
    if (result.error === "not_found") setStatus("not_found");
    else if (result.error) setStatus("error");
    else {
      setDrink(result.data);
      setStatus("ready");
    }
  }, [brandSlug, productSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const findDrink = () => {
    const target = availableAtRef.current;
    if (!target) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start"
    });
    availableHeadingRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        description={
          drink?.description
            ? `${drink.name} by ${drink.brandName}. ${drink.description}`
            : `Discover ${drink?.name ?? "milk-tea drinks"} on WeMilktea.`
        }
        imageUrl={drink?.imageUrl}
        jsonLd={
          drink
            ? productJsonLd({
                brandName: drink.brandName,
                description: drink.description,
                imageUrl: drink.imageUrl,
                name: drink.name,
                url: publicUrl(
                  `/drinks/${encodeURIComponent(drink.brandSlug)}/${encodeURIComponent(drink.slug)}`
                )
              })
            : null
        }
        path={
          brandSlug && productSlug
            ? `/drinks/${encodeURIComponent(brandSlug)}/${encodeURIComponent(productSlug)}`
            : "/drinks"
        }
        robots={status === "ready" ? "index, follow" : "noindex, follow"}
        title={
          drink
            ? `${drink.name} | Milk Tea Drink | WeMilktea`
            : "Drink detail | WeMilktea"
        }
        type="product"
      />
      <PublicHeader />
      <main className="mx-auto max-w-[1280px] px-5 pb-28 pt-5 sm:px-8 md:pb-10 lg:px-8">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground hover:text-primary"
          to="/drinks"
        >
          ‹ Drinks
        </Link>

        {status === "loading" ? (
          <div className="mt-4">
            <DetailSkeleton />
          </div>
        ) : null}
        {status === "not_found" ? (
          <div className="mt-8">
            <DetailMessage notFound />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="mt-8 space-y-4">
            <DetailMessage notFound={false} />
            <div className="text-center">
              <button
                className="min-h-11 rounded-md border border-border bg-card px-4 text-sm font-semibold"
                type="button"
                onClick={() => void load()}
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {status === "ready" && drink ? (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-[0.08em] text-primary md:hidden">
              {drink.brandName} · {drink.categoryName}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-5 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)] lg:gap-6">
              <div>
                <ProductImage drink={drink} />
              </div>
              <section
                className="flex flex-col items-start gap-3 rounded-xl bg-card p-5 md:min-h-[280px] lg:min-h-[320px]"
                aria-labelledby="drink-detail-heading"
              >
                <p className="hidden text-xs font-medium uppercase tracking-[0.08em] text-primary md:block">
                  {drink.brandName} · {drink.categoryName}
                </p>
                <h1
                  className="text-[32px] font-semibold leading-10 lg:text-[40px] lg:leading-[48px]"
                  id="drink-detail-heading"
                >
                  {drink.name}
                </h1>
                {drink.description ? (
                  <p className="max-w-2xl text-base leading-6 text-muted-foreground">
                    {drink.description}
                  </p>
                ) : null}
                <button
                  className="mt-auto inline-flex min-h-[52px] w-[200px] items-center justify-center rounded-xl bg-primary px-6 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={drink.availableStores.length === 0}
                  onClick={findDrink}
                >
                  Find this drink
                </button>
              </section>
            </div>

            <section
              className="mt-7 scroll-mt-24"
              id="available-at"
              ref={availableAtRef}
              aria-labelledby="available-at-heading"
            >
              <h2
                className="text-xl font-semibold leading-7"
                id="available-at-heading"
                ref={availableHeadingRef}
                tabIndex={-1}
              >
                Available at
              </h2>
              {drink.availableStores.length > 0 ? (
                <div className="mt-[18px] flex flex-wrap gap-4">
                  {drink.availableStores.map((store) => (
                    <AvailableStoreCard key={store.id} store={store} />
                  ))}
                </div>
              ) : (
                <p className="mt-[18px] rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  This drink is not currently available at a listed store.
                </p>
              )}
            </section>

            {drink.availableStores.length > 0 ? (
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 shadow-[0_-4px_8px_rgba(20,31,20,0.12)] backdrop-blur md:hidden">
                <div className="mx-auto flex max-w-[390px] items-center justify-between gap-3">
                  <span className="text-xs font-medium text-foreground">
                    Drink detail
                  </span>
                  <button
                    className="min-h-11 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                    type="button"
                    onClick={findDrink}
                  >
                    Find this drink
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
