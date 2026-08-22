import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useSearchParams
} from "react-router-dom";
import {
  distanceKm,
  filterPublicStores,
  markerPosition,
  normalizePublicStore,
  type Coordinates,
  type PublicStore
} from "./stores/data";
import {
  buildStoreMarkerIcon,
  loadGoogleMaps,
  type GoogleMapInstance,
  type GoogleMapsApi
} from "./stores/google-map";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import { PublicHeader } from "./public-header";
import { Seo } from "./seo";
import { StoreDetailPage } from "./store-detail";
import { SuggestStoreCta, SuggestStoreDialog } from "./stores/suggest-store";
import { DrinksPage } from "./drinks/page";
import { DrinkDetailPage } from "./drinks/detail";
import { HomePage } from "./home/page";
import { PickerPage } from "./picker/page";
import { PickerResultPage } from "./picker/result-page";
import { SearchPage } from "./search/page";

const googleMapsBrowserKey =
  typeof import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY === "string"
    ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY.trim()
    : "";

function StoreImage({ store, index }: { store: PublicStore; index: number }) {
  const [hasImageError, setHasImageError] = useState(false);
  const accent = index % 2 === 0 ? "bg-[#a97850]" : "bg-[#c58a62]";
  if (store.imageUrl && !hasImageError) {
    return (
      <img
        alt={store.imageAltText ?? `${store.displayName} store`}
        className="size-[62px] shrink-0 rounded-lg border border-border object-cover md:size-[74px]"
        src={store.imageUrl}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex size-[62px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border ${accent} text-[10px] text-[#111711] md:size-[74px]`}
    >
      Store image
    </div>
  );
}

function StoreCard({
  store,
  index,
  userLocation,
  selected,
  onSelect
}: {
  store: PublicStore;
  index: number;
  userLocation: Coordinates | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const distance = userLocation
    ? distanceKm(
        userLocation.latitude,
        userLocation.longitude,
        store.latitude,
        store.longitude
      )
    : null;

  return (
    <Link
      className={`flex min-h-[82px] w-full items-center gap-3 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md md:min-h-[92px] ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      to={`/stores/${store.slug}`}
      onFocus={onSelect}
      onMouseEnter={onSelect}
    >
      <StoreImage index={index} store={store} />
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm font-semibold leading-5 text-card-foreground">
          {store.displayName}
        </h3>
        <p className="break-words text-xs leading-4 text-muted-foreground">
          {distance === null
            ? `${store.suburb} · ${store.brandName}`
            : `${distance.toFixed(1)} km · ${store.suburb}`}
        </p>
      </div>
    </Link>
  );
}

function MapFallback({
  stores,
  selectedId,
  onSelect,
  message
}: {
  stores: PublicStore[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  message?: string;
}) {
  return (
    <section
      className="map-fallback map-surface relative min-h-[180px] overflow-hidden rounded-xl border border-border"
      aria-label="Map of Auckland stores"
    >
      <p className="absolute left-4 top-4 z-10 text-xs font-semibold text-foreground md:left-6 md:top-6 md:text-sm">
        MAP / STORE PINS
      </p>
      {message ? (
        <p className="absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 text-center text-xs text-muted-foreground md:text-sm">
          {message}
        </p>
      ) : null}
      {stores.map((store) => {
        const position = markerPosition(stores, store);
        const isSelected = selectedId === store.id;
        return (
          <button
            aria-label={`Show ${store.displayName} on the list`}
            aria-pressed={isSelected}
            className={`store-map-marker absolute -translate-x-1/2 -translate-y-1/2 ${isSelected ? "store-map-marker-selected" : ""}`}
            key={store.id}
            style={position}
            type="button"
            onClick={() => onSelect(store.id)}
          >
            <span aria-hidden="true" className="store-map-marker-cup">
              <span className="store-map-marker-lid" />
              <span className="store-map-marker-straw" />
              <span className="store-map-marker-bubble store-map-marker-bubble-one" />
              <span className="store-map-marker-bubble store-map-marker-bubble-two" />
              <span className="store-map-marker-bubble store-map-marker-bubble-three" />
            </span>
          </button>
        );
      })}
    </section>
  );
}

function GoogleMapPanel({
  stores,
  selectedId,
  onSelect
}: {
  stores: PublicStore[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const mapsApiRef = useRef<GoogleMapsApi | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const markersRef = useRef<
    Array<{
      id: string;
      marker: {
        setIcon: (icon: ReturnType<typeof buildStoreMarkerIcon>) => void;
        setMap: (map: GoogleMapInstance | null) => void;
        setZIndex: (zIndex: number | null) => void;
      };
      listener: { remove: () => void };
    }>
  >([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    googleMapsBrowserKey ? "loading" : "unavailable"
  );

  useEffect(() => {
    if (!googleMapsBrowserKey || !mapElementRef.current) {
      setState("unavailable");
      return;
    }

    let active = true;
    setState("loading");

    void loadGoogleMaps(googleMapsBrowserKey)
      .then((googleMaps) => {
        if (!active || !mapElementRef.current) return;
        mapsApiRef.current = googleMaps;
        mapRef.current = new googleMaps.maps.Map(mapElementRef.current, {
          center: { lat: -36.8485, lng: 174.7633 },
          disableDefaultUI: true,
          fullscreenControl: false,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          zoom: 11,
          zoomControl: true
        });
        setState("ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = mapsApiRef.current;
    if (state !== "ready" || !map || !googleMaps) return;

    markersRef.current.forEach(({ marker, listener }) => {
      listener.remove();
      marker.setMap(null);
    });

    const bounds = new googleMaps.maps.LatLngBounds();
    markersRef.current = stores.map((store) => {
      const position = { lat: store.latitude, lng: store.longitude };
      bounds.extend(position);
      const marker = new googleMaps.maps.Marker({
        icon: buildStoreMarkerIcon(selectedIdRef.current === store.id),
        map,
        position,
        title: store.displayName,
        zIndex: selectedIdRef.current === store.id ? 2 : 1
      });
      const listener = marker.addListener("click", () => onSelect(store.id));
      return { id: store.id, marker, listener };
    });

    if (stores.length === 1) {
      map.setCenter({ lat: stores[0].latitude, lng: stores[0].longitude });
      map.setZoom(14);
    } else if (stores.length > 1) {
      map.fitBounds(bounds);
    }
  }, [onSelect, state, stores]);

  useEffect(() => {
    if (state !== "ready") return;

    markersRef.current.forEach(({ id, marker }) => {
      const isSelected = id === selectedId;
      marker.setIcon(buildStoreMarkerIcon(isSelected));
      marker.setZIndex(isSelected ? 2 : 1);
    });
  }, [selectedId, state]);

  return (
    <div className="relative order-1 md:order-2">
      {state === "unavailable" ? (
        <MapFallback
          message="Map unavailable right now. You can still browse the store list."
          onSelect={onSelect}
          selectedId={selectedId}
          stores={stores}
        />
      ) : (
        <>
          <div
            ref={mapElementRef}
            className="google-map-panel map-surface"
            aria-hidden={state !== "ready"}
          />
          {state === "loading" ? (
            <div className="map-status" role="status">
              Loading map…
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function StoresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suggestStoreOpen, setSuggestStoreOpen] = useState(false);
  const suggestStoreTriggerRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);

  const query = searchParams.get("q") ?? "";
  const brandSlug = searchParams.get("brand") ?? "";
  const suburb = searchParams.get("area") ?? "";
  const nearMe = searchParams.get("near") === "1";

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const { data, error } = await client
        .from("locations")
        .select(
          "id, slug, display_name, suburb, address, coordinates, brands!inner(name, slug), location_images(image_assets(id, provenance, storage_key, external_url, alt_text))"
        )
        .order("display_name");

      if (error) {
        setErrorMessage("Stores are unavailable right now. Please try again.");
      } else {
        const normalized = (data ?? [])
          .map((row) => normalizePublicStore(row))
          .filter((store): store is PublicStore => store !== null);
        setStores(normalized);
        setErrorMessage(null);
      }
      setIsLoading(false);
    };

    void load();
  }, []);

  const visibleStores = useMemo(
    () =>
      filterPublicStores(stores, {
        query,
        brandSlug,
        suburb,
        nearMe,
        userLocation
      }),
    [stores, query, brandSlug, suburb, nearMe, userLocation]
  );
  const brands = useMemo(
    () =>
      [
        ...new Map(
          stores.map((store) => [store.brandSlug, store.brandName])
        ).entries()
      ].sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB)),
    [stores]
  );
  const areas = useMemo(
    () => [...new Set(stores.map((store) => store.suburb))].sort(),
    [stores]
  );

  useEffect(() => {
    if (visibleStores.length === 0) {
      setSelectedId(null);
    } else if (!visibleStores.some((store) => store.id === selectedId)) {
      setSelectedId(visibleStores[0].id);
    }
  }, [visibleStores, selectedId]);

  useEffect(() => {
    if (!filtersOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFiltersOpen(false);
      filtersButtonRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filtersOpen]);

  const updateSearchParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  };

  const requestNearMe = () => {
    if (nearMe) {
      updateSearchParam("near", "");
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage("Location is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({
          latitude: coords.latitude,
          longitude: coords.longitude
        });
        setLocationMessage(null);
        updateSearchParam("near", "1");
      },
      () =>
        setLocationMessage(
          "Location permission was not granted. You can still browse all Auckland stores."
        )
    );
  };

  const focusSearch = () => searchRef.current?.focus();
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("area");
    next.delete("brand");
    setSearchParams(next, { replace: true });
    setFiltersOpen(false);
  };

  const openSuggestStore = (event: MouseEvent<HTMLButtonElement>) => {
    suggestStoreTriggerRef.current = event.currentTarget;
    setSuggestStoreOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        description="Explore milk tea and bubble tea stores across Auckland, browse locations and discover somewhere new to try."
        path="/stores"
        robots={
          query.trim() || brandSlug || suburb || nearMe
            ? "noindex, follow"
            : "index, follow"
        }
        title="Milk Tea Stores in Auckland | WeMilktea"
      />
      <PublicHeader onSearch={focusSearch} />
      <main className="mx-auto max-w-[1280px] px-5 pb-8 pt-5 sm:px-8">
        <p className="text-xs font-medium leading-4 text-primary">
          STORES · AUCKLAND
        </p>
        <h1 className="mt-4 max-w-[467px] text-2xl font-semibold leading-8 md:text-[28px] md:leading-9 lg:text-[32px] lg:leading-10">
          Find milk tea around Auckland
        </h1>

        <div className="mt-4">
          <label className="relative block">
            <span className="sr-only">Search stores</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold">
              ⌕
            </span>
            <input
              ref={searchRef}
              className="search-input-custom-clear h-11 w-full rounded-xl border border-border bg-card px-12 pr-10 text-sm text-foreground placeholder:text-muted-foreground md:h-12"
              placeholder="Search stores, drinks, matcha..."
              type="search"
              value={query}
              onChange={(event) => updateSearchParam("q", event.target.value)}
            />
            {query ? (
              <button
                aria-label="Clear store search"
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-xl hover:bg-muted"
                type="button"
                onClick={() => updateSearchParam("q", "")}
              >
                ×
              </button>
            ) : null}
          </label>
        </div>

        <div
          className="mt-3 flex flex-wrap gap-2"
          aria-label="Store filters"
          role="group"
        >
          <button
            aria-pressed={nearMe}
            className={`h-11 rounded-xl border border-border px-4 text-xs font-semibold ${nearMe ? "bg-accent text-primary" : "bg-card"}`}
            type="button"
            onClick={requestNearMe}
          >
            Near me
          </button>
          <div className="relative">
            <button
              ref={filtersButtonRef}
              aria-controls="store-filters-popover"
              aria-expanded={filtersOpen}
              className={`h-11 rounded-xl border border-border px-4 text-xs font-semibold ${brandSlug || suburb ? "bg-accent text-primary" : "bg-card"}`}
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              Filters{brandSlug || suburb ? " · active" : ""}
            </button>
            {filtersOpen ? (
              <div
                id="store-filters-popover"
                className="filter-popover"
                role="group"
                aria-label="Store filters"
              >
                <label htmlFor="store-area">Area</label>
                <select
                  id="store-area"
                  value={suburb}
                  onChange={(event) =>
                    updateSearchParam("area", event.target.value)
                  }
                >
                  <option value="">All areas</option>
                  {areas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <label htmlFor="store-brand">Brand</label>
                <select
                  id="store-brand"
                  value={brandSlug}
                  onChange={(event) =>
                    updateSearchParam("brand", event.target.value)
                  }
                >
                  <option value="">All brands</option>
                  {brands.map(([slug, name]) => (
                    <option key={slug} value={slug}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  className="mt-2 text-left text-xs font-semibold text-primary"
                  type="button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
          {locationMessage ? (
            <p
              className="basis-full text-sm text-muted-foreground"
              role="status"
            >
              {locationMessage}
            </p>
          ) : null}
        </div>

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading stores…</p>
        ) : null}
        {errorMessage ? (
          <p className="mt-8 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleStores.length === 0 ? (
          <section className="mt-8 rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-semibold">No stores found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different search or clear your filters.
            </p>
            <button
              className="mt-4 rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Clear filters
            </button>
            <div className="mt-6 border-t border-border pt-5">
              <SuggestStoreCta compact onClick={openSuggestStore} />
            </div>
          </section>
        ) : null}

        {!isLoading && !errorMessage && visibleStores.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[430px_minmax(0,1fr)]">
            <GoogleMapPanel
              stores={visibleStores}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <section
              className="store-list-panel order-2 flex w-full flex-col gap-3 rounded-xl bg-card p-4 md:order-1 md:h-[648px] md:overflow-y-auto"
              aria-labelledby="nearby-stores-heading"
            >
              <h2
                className="text-xl font-semibold leading-7"
                id="nearby-stores-heading"
              >
                Nearby stores
                <span className="sr-only">
                  , {visibleStores.length} results
                </span>
              </h2>
              {visibleStores.map((store, index) => (
                <StoreCard
                  index={index}
                  key={store.id}
                  selected={selectedId === store.id}
                  store={store}
                  userLocation={userLocation}
                  onSelect={() => setSelectedId(store.id)}
                />
              ))}
            </section>
          </div>
        ) : null}
        {!isLoading && !errorMessage && visibleStores.length > 0 ? (
          <div className="mt-6">
            <SuggestStoreCta onClick={openSuggestStore} />
          </div>
        ) : null}
      </main>
      <SuggestStoreDialog
        onClose={() => setSuggestStoreOpen(false)}
        open={suggestStoreOpen}
        returnFocusRef={suggestStoreTriggerRef}
      />
    </div>
  );
}

function PlaceholderPage({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        description={description}
        path={typeof window === "undefined" ? "/" : window.location.pathname}
        robots="noindex, follow"
        title={`${title} | WeMilktea`}
      />
      <PublicHeader />
      <main className="mx-auto max-w-[1280px] px-5 py-12 sm:px-8">
        <h1 className="text-[32px] font-semibold leading-10">{title}</h1>
        <p className="mt-3 text-base text-muted-foreground">{description}</p>
      </main>
    </div>
  );
}

function LegacyExploreRedirect() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  return (
    <Navigate
      replace
      to={query ? `/search?q=${encodeURIComponent(query)}` : "/"}
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<HomePage />} path="/" />
      <Route element={<StoresPage />} path="/stores" />
      <Route element={<StoreDetailPage />} path="/stores/:slug" />
      <Route element={<SearchPage />} path="/search" />
      <Route element={<LegacyExploreRedirect />} path="/explore" />
      <Route element={<DrinksPage />} path="/drinks" />
      <Route
        element={<DrinkDetailPage />}
        path="/drinks/:brandSlug/:productSlug"
      />
      <Route
        element={<PickerResultPage />}
        path="/picker/result/:brandSlug/:productSlug"
      />
      <Route element={<PickerPage />} path="/picker" />
      <Route
        element={
          <PlaceholderPage
            description="This page is not available yet."
            title="WeMilktea"
          />
        }
        path="*"
      />
    </Routes>
  );
}
