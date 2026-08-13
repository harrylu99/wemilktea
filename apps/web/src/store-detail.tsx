import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PublicHeader } from "./public-header";
import {
  loadGoogleMaps,
  type GoogleMapInstance,
  type GoogleMapsApi
} from "./stores/google-map";
import {
  directionsUrl,
  loadPublicStoreDetail,
  type PublicStoreDetail,
  type PublicStoreDrink
} from "./stores/detail";

const googleMapsBrowserKey =
  typeof import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY === "string"
    ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY.trim()
    : "";

function StoreHeroImage({ store }: { store: PublicStoreDetail }) {
  const [hasImageError, setHasImageError] = useState(false);
  const image = store.images[0];
  if (image?.url && !hasImageError) {
    return (
      <img
        alt={image.altText ?? `${store.displayName} store`}
        className="detail-hero-image"
        src={image.url}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div aria-hidden="true" className="detail-image-fallback">
      STORE IMAGE
    </div>
  );
}

function formatPrice(priceCents: number | null, currency: string) {
  if (priceCents === null) return null;
  return new Intl.NumberFormat("en-NZ", {
    currency,
    style: "currency"
  }).format(priceCents / 100);
}

function DrinkCard({
  drink,
  index
}: {
  drink: PublicStoreDrink;
  index: number;
}) {
  const price = formatPrice(drink.priceCents, drink.currency);
  return (
    <Link
      className="detail-drink-card"
      to={`/drinks/${drink.slug}`}
      aria-label={`View ${drink.name}`}
    >
      <div
        aria-hidden="true"
        className={`detail-drink-image detail-accent-${index % 3}`}
      >
        DRINK IMAGE
      </div>
      <div className="mt-3 min-w-0">
        <h3 className="truncate text-sm font-semibold">{drink.name}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {price ?? "View drink"}
        </p>
      </div>
    </Link>
  );
}

function StoreMap({ store }: { store: PublicStoreDetail }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsApiRef = useRef<GoogleMapsApi | null>(null);
  const markerRef = useRef<{
    setMap: (map: GoogleMapInstance | null) => void;
  } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    googleMapsBrowserKey ? "loading" : "unavailable"
  );

  useEffect(() => {
    if (!googleMapsBrowserKey || !mapElementRef.current) {
      setState("unavailable");
      return;
    }

    let active = true;
    void loadGoogleMaps(googleMapsBrowserKey)
      .then((googleMaps) => {
        if (!active || !mapElementRef.current) return;
        mapsApiRef.current = googleMaps;
        const position = { lat: store.latitude, lng: store.longitude };
        mapRef.current = new googleMaps.maps.Map(mapElementRef.current, {
          center: position,
          disableDefaultUI: true,
          fullscreenControl: false,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 15,
          zoomControl: true
        });
        markerRef.current = new googleMaps.maps.Marker({
          map: mapRef.current,
          position,
          title: store.displayName
        });
        setState("ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });

    return () => {
      active = false;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      mapsApiRef.current = null;
    };
  }, [store.displayName, store.latitude, store.longitude]);

  return (
    <section className="detail-map-card" aria-labelledby="store-map-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" id="store-map-heading">
          Location
        </h2>
        <a
          className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          href={directionsUrl(store)}
          rel="noreferrer"
          target="_blank"
        >
          Open directions
        </a>
      </div>
      <div className="relative mt-3 overflow-hidden rounded-lg">
        <div
          ref={mapElementRef}
          className={`detail-map-surface ${state === "ready" ? "opacity-100" : "opacity-0"}`}
          aria-hidden={state !== "ready"}
        />
        {state === "loading" ? (
          <div className="detail-map-status" role="status">
            Loading map…
          </div>
        ) : null}
        {state === "unavailable" ? (
          <div className="detail-map-status items-start justify-items-start text-left">
            <p>
              Map preview unavailable, but this store is at {store.address}.
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{store.address}</p>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div
      className="detail-skeleton"
      aria-label="Loading store details"
      role="status"
    >
      <div className="detail-skeleton-block" />
      <div className="detail-skeleton-line detail-skeleton-title" />
      <div className="detail-skeleton-line" />
      <div className="detail-skeleton-line detail-skeleton-short" />
    </div>
  );
}

function DetailError({ notFound }: { notFound: boolean }) {
  return (
    <section className="mx-auto max-w-[680px] rounded-xl border border-border bg-card p-8 text-center">
      <h1 className="text-2xl font-semibold">
        {notFound
          ? "We couldn't find this store."
          : "Store details are unavailable."}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {notFound
          ? "Explore other milk-tea spots in Auckland."
          : "Please try again, or browse other milk-tea spots in Auckland."}
      </p>
      <Link
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        to="/stores"
      >
        Back to stores
      </Link>
    </section>
  );
}

export function StoreDetailPage() {
  const { slug } = useParams();
  const [store, setStore] = useState<PublicStoreDetail | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "not_found" | "error"
  >("loading");
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setStore(null);
    if (!slug) {
      setStatus("not_found");
      return () => {
        active = false;
      };
    }

    void loadPublicStoreDetail(slug).then((result) => {
      if (!active) return;
      if (result.error === "not_found") {
        setStatus("not_found");
      } else if (result.error) {
        setStatus("error");
      } else {
        setStore(result.data);
        setStatus("ready");
      }
    });

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const title = store
      ? `${store.displayName} | WeMilktea`
      : "Store detail | WeMilktea";
    document.title = title;
    if (store) {
      let description = document.querySelector<HTMLMetaElement>(
        'meta[name="description"]'
      );
      if (!description) {
        description = document.createElement("meta");
        description.name = "description";
        document.head.append(description);
      }
      description.content = `${store.displayName} in ${store.suburb}. Discover this Auckland milk-tea location on WeMilktea.`;
    }
  }, [store]);

  const shareStore = async () => {
    if (!store) return;
    const browserNavigator = navigator as Navigator & {
      share?: (data: {
        title: string;
        text: string;
        url: string;
      }) => Promise<void>;
      clipboard?: { writeText: (value: string) => Promise<void> };
    };
    const shareData = {
      title: `${store.displayName} | WeMilktea`,
      text: `Discover ${store.displayName} in ${store.suburb}.`,
      url: window.location.href
    };
    try {
      if (browserNavigator.share) {
        await browserNavigator.share(shareData);
        setShareMessage("Shared");
      } else if (browserNavigator.clipboard) {
        await browserNavigator.clipboard.writeText(window.location.href);
        setShareMessage("Link copied");
      } else {
        setShareMessage("Copy this page URL to share it");
      }
    } catch {
      setShareMessage(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-[1250px] px-5 pb-28 pt-5 sm:px-8 md:pb-10 lg:px-0">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground hover:text-primary"
          to="/stores"
        >
          ‹ Stores
        </Link>

        {status === "loading" ? <DetailSkeleton /> : null}
        {status === "not_found" ? <DetailError notFound /> : null}
        {status === "error" ? <DetailError notFound={false} /> : null}

        {status === "ready" && store ? (
          <>
            <div className="detail-hero mt-4">
              <div className="detail-hero-media">
                <StoreHeroImage store={store} />
              </div>
              <section
                className="detail-summary"
                aria-labelledby="store-detail-heading"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                  {store.brandName}
                </p>
                <h1
                  className="mt-3 text-3xl font-semibold leading-tight lg:text-[32px]"
                  id="store-detail-heading"
                >
                  {store.displayName}
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  {store.brandName} · {store.suburb}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
                    href={directionsUrl(store)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Get Directions
                  </a>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-semibold"
                    type="button"
                    onClick={() => void shareStore()}
                  >
                    Share
                  </button>
                </div>
                {shareMessage ? (
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    {shareMessage}
                  </p>
                ) : null}
                <div className="detail-summary-facts mt-8">
                  <div>
                    <h2 className="text-sm font-semibold">Address</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {store.address}
                    </p>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Area</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {store.suburb}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="mt-10" aria-labelledby="popular-drinks-heading">
              <div className="flex items-end justify-between gap-4">
                <h2
                  className="text-2xl font-semibold"
                  id="popular-drinks-heading"
                >
                  Popular drinks
                </h2>
                {store.drinks.length > 0 ? (
                  <Link
                    className="text-sm font-semibold text-primary hover:underline"
                    to="/drinks"
                  >
                    View all drinks
                  </Link>
                ) : null}
              </div>
              {store.drinks.length > 0 ? (
                <div className="detail-drinks-grid mt-5">
                  {store.drinks.map((drink, index) => (
                    <DrinkCard drink={drink} index={index} key={drink.id} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                  {store.drinksUnavailable
                    ? "Drinks are temporarily unavailable. Please try again later."
                    : "No featured drinks are available for this location yet."}
                </p>
              )}
            </section>

            <div className="detail-lower-grid mt-10">
              <section
                className="detail-info-card"
                aria-labelledby="store-information-heading"
              >
                <h2
                  className="text-xl font-semibold"
                  id="store-information-heading"
                >
                  Store information
                </h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-semibold">Address</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      {store.address}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold">Area</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      {store.suburb}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold">Contact</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      Canonical website information is not available yet.
                    </dd>
                  </div>
                </dl>
              </section>
              <StoreMap store={store} />
            </div>
          </>
        ) : null}
      </main>
      {status === "ready" && store ? (
        <div className="detail-sticky-action">
          <a
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            href={directionsUrl(store)}
            rel="noreferrer"
            target="_blank"
          >
            Get Directions
          </a>
        </div>
      ) : null}
    </div>
  );
}
