import {
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useSearchParams
} from "react-router-dom";
import {
  distanceKm,
  loadPublicStoreFacets,
  loadPublicStores,
  markerPosition,
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
import { PublicFooter } from "./public-footer";
import { Seo } from "./seo";
import { StoreDetailPage } from "./store-detail";
import { SuggestStoreCta, SuggestStoreDialog } from "./stores/suggest-store";
import { DrinksPage } from "./drinks/page";
import { DrinkDetailPage } from "./drinks/detail";
import { HomePage } from "./home/page";
import { PickerPage } from "./picker/page";
import { PickerResultPage } from "./picker/result-page";
import { SearchPage } from "./search/page";
import {
  getMobilePreviewId,
  shouldPreserveListOnDesktopToMobile,
  shouldPreserveMapOnDesktopToMobile,
  shouldRevealSelectedStoreOnListTransition
} from "./stores/map-interaction";
import { shouldScrollToTop } from "./route-scroll";
import { useDismissiblePopover } from "./use-dismissible-popover";
import { useDebouncedValue } from "./use-debounced-value";
import { MomentsPage } from "./moments/page";
import { FilterButtonLabel } from "./filter-button-label";
import { summarizeFilterLabels } from "./filter-summary";

const googleMapsBrowserKey =
  typeof import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY === "string"
    ? import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY.trim()
    : "";
const hoverMediaQuery = "(hover: hover) and (pointer: fine)";
const desktopMediaQuery = "(min-width: 768px)";

function supportsStoreMapHover() {
  return (
    typeof window !== "undefined" && window.matchMedia(hoverMediaQuery).matches
  );
}

function useIsDesktopLayout(
  onChange?: (isDesktopLayout: boolean, wasDesktopLayout: boolean) => void
) {
  const initialIsDesktop =
    typeof window !== "undefined" &&
    window.matchMedia(desktopMediaQuery).matches;
  const [isDesktop, setIsDesktop] = useState(initialIsDesktop);
  const currentLayoutRef = useRef(initialIsDesktop);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopMediaQuery);
    const update = () => {
      const nextLayout = mediaQuery.matches;
      const previousLayout = currentLayoutRef.current;
      if (nextLayout === previousLayout) return;

      currentLayoutRef.current = nextLayout;
      onChangeRef.current?.(nextLayout, previousLayout);
      setIsDesktop(nextLayout);
    };
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

function RouteScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = location.pathname;

    if (
      !shouldScrollToTop(previousPathname, location.pathname, navigationType)
    ) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, navigationType]);

  return null;
}

function StoreImage({ store, index }: { store: PublicStore; index: number }) {
  const [hasImageError, setHasImageError] = useState(false);
  const accent = index % 2 === 0 ? "bg-[#a97850]" : "bg-[#c58a62]";
  if (store.imageUrl && !hasImageError) {
    return (
      <div className="size-[62px] shrink-0 overflow-hidden rounded-lg border border-border md:size-[74px]">
        <img
          alt={store.imageAltText ?? `${store.displayName} store`}
          className="discovery-card-image size-full object-cover"
          src={store.imageUrl}
          onError={() => setHasImageError(true)}
        />
      </div>
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
  onSelect: (source: "focus" | "hover") => void;
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
      className="discovery-card flex min-h-[82px] w-full items-center gap-3 rounded-xl border border-border bg-card p-2 md:min-h-[92px]"
      data-highlighted={selected || undefined}
      id={`store-card-${store.id}`}
      to={`/stores/${store.slug}`}
      onFocus={() => onSelect("focus")}
      onMouseEnter={() => onSelect("hover")}
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

function StoreCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="store-skeleton-card flex min-h-[82px] w-full items-center gap-3 rounded-xl border border-border bg-card p-2 md:min-h-[92px]"
    >
      <div className="store-skeleton-block size-[62px] shrink-0 rounded-lg md:size-[74px]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="store-skeleton-line h-4 w-3/4 rounded" />
        <div className="store-skeleton-line h-3 w-1/2 rounded" />
        <div className="store-skeleton-line h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

function StoreListSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="store-list-panel order-2 flex w-full flex-col gap-3 rounded-xl bg-card p-4 md:order-1 md:h-[648px] md:overflow-y-auto"
    >
      <div className="store-skeleton-line mb-1 h-7 w-1/2 rounded" />
      {Array.from({ length: 4 }, (_, index) => (
        <StoreCardSkeleton key={index} />
      ))}
    </div>
  );
}

function StoreMapSkeleton({ mobileMapActive }: { mobileMapActive: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`store-map-skeleton map-surface ${mobileMapActive ? "mobile-google-map-panel" : ""}`}
    />
  );
}

function StoresInitialSkeleton({
  isDesktopLayout,
  mobileView
}: {
  isDesktopLayout: boolean;
  mobileView: "list" | "map";
}) {
  return (
    <div className="mt-4" aria-busy="true">
      <span className="sr-only" role="status">
        Loading store results
      </span>
      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[430px_minmax(0,1fr)]">
        {isDesktopLayout || mobileView === "map" ? (
          <div className="relative order-1 md:order-2">
            <StoreMapSkeleton mobileMapActive={!isDesktopLayout} />
          </div>
        ) : null}
        {isDesktopLayout || mobileView === "list" ? (
          <StoreListSkeleton />
        ) : null}
      </div>
    </div>
  );
}

function StoreMapPreview({
  store,
  index
}: {
  store: PublicStore;
  index: number;
}) {
  return (
    <Link
      aria-label={`View ${store.displayName} store details`}
      aria-live="polite"
      className="store-map-preview absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-md md:hidden"
      to={`/stores/${store.slug}`}
    >
      <StoreImage index={index} store={store} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {store.displayName}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {store.suburb} · {store.brandName}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-muted-foreground">
        ›
      </span>
    </Link>
  );
}

function MapFallback({
  stores,
  selectedId,
  onSelect,
  onHover,
  mobileMapActive,
  message
}: {
  stores: PublicStore[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  mobileMapActive: boolean;
  message?: string;
}) {
  return (
    <section
      className={`map-fallback map-surface relative overflow-hidden rounded-xl border border-border ${mobileMapActive ? "mobile-google-map-panel" : ""}`}
      aria-label="Map of Auckland stores"
    >
      <p className="absolute left-4 top-4 z-10 text-xs font-semibold text-foreground md:left-6 md:top-6 md:text-sm">
        MAP / STORE PINS
      </p>
      {message ? (
        <p className="pointer-events-none absolute inset-x-4 top-1/2 z-10 -translate-y-1/2 text-center text-xs text-muted-foreground md:text-sm">
          {message}
        </p>
      ) : null}
      {stores.map((store) => {
        const position = markerPosition(stores, store);
        const isSelected = selectedId === store.id;
        return (
          <button
            aria-label={`Select ${store.displayName}`}
            aria-pressed={isSelected}
            className={`store-map-marker absolute -translate-x-1/2 -translate-y-1/2 ${isSelected ? "store-map-marker-selected" : ""}`}
            key={store.id}
            style={position}
            type="button"
            onClick={() => onSelect(store.id)}
            onMouseEnter={() => {
              if (supportsStoreMapHover()) onHover(store.id);
            }}
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
  onSelect,
  onHover,
  mobilePreviewStore,
  mobilePreviewIndex,
  mobileMapActive,
  mapPanelRef
}: {
  stores: PublicStore[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  mobilePreviewStore: PublicStore | null;
  mobilePreviewIndex: number;
  mobileMapActive: boolean;
  mapPanelRef: RefObject<HTMLDivElement | null>;
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
      listeners: Array<{ remove: () => void }>;
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

    markersRef.current.forEach(({ marker, listeners }) => {
      listeners.forEach((listener) => listener.remove());
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
      const listeners = [
        marker.addListener("click", () => onSelect(store.id)),
        marker.addListener("mouseover", () => {
          if (supportsStoreMapHover()) onHover(store.id);
        })
      ];
      return { id: store.id, marker, listeners };
    });

    if (stores.length === 1) {
      map.setCenter({ lat: stores[0].latitude, lng: stores[0].longitude });
      map.setZoom(14);
    } else if (stores.length > 1) {
      map.fitBounds(bounds);
    }
  }, [onHover, onSelect, state, stores]);

  useEffect(() => {
    if (state !== "ready") return;

    markersRef.current.forEach(({ id, marker }) => {
      const isSelected = id === selectedId;
      marker.setIcon(buildStoreMarkerIcon(isSelected));
      marker.setZIndex(isSelected ? 2 : 1);
    });
  }, [selectedId, state]);

  return (
    <div ref={mapPanelRef} className="relative order-1 md:order-2">
      {state === "unavailable" ? (
        <MapFallback
          message="Map unavailable right now. You can still browse the store list."
          onHover={onHover}
          onSelect={onSelect}
          selectedId={selectedId}
          stores={stores}
          mobileMapActive={mobileMapActive}
        />
      ) : (
        <>
          <div
            ref={mapElementRef}
            className={`google-map-panel map-surface ${mobileMapActive ? "mobile-google-map-panel" : ""}`}
            aria-hidden={state !== "ready"}
          />
          {state === "loading" ? (
            <div className="map-status" role="status">
              Loading map…
            </div>
          ) : null}
        </>
      )}
      {mobilePreviewStore ? (
        <StoreMapPreview
          index={mobilePreviewIndex}
          store={mobilePreviewStore}
        />
      ) : null}
    </div>
  );
}

export function StoresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<PublicStore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("map");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedStores, setHasLoadedStores] = useState(false);
  const [suggestStoreOpen, setSuggestStoreOpen] = useState(false);
  const [filterBrands, setFilterBrands] = useState<Array<[string, string]>>([]);
  const [filterAreas, setFilterAreas] = useState<string[]>([]);
  const [facetsStatus, setFacetsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const suggestStoreTriggerRef = useRef<HTMLElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filtersPopoverRef = useRef<HTMLDivElement>(null);
  const storeListRef = useRef<HTMLElement>(null);
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const facetsRequestIdRef = useRef(0);
  const pendingListRevealIdRef = useRef<string | null>(null);
  const listRevealHoverLockRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const handleDesktopLayoutChange = useCallback(
    (isDesktopLayout: boolean, wasDesktopLayout: boolean) => {
      const activeElement = document.activeElement;
      const listHasFocus = Boolean(
        activeElement && storeListRef.current?.contains(activeElement)
      );
      const mapHasFocus = Boolean(
        activeElement && mapPanelRef.current?.contains(activeElement)
      );
      if (
        shouldPreserveListOnDesktopToMobile(
          wasDesktopLayout,
          isDesktopLayout,
          listHasFocus
        )
      ) {
        setMobileView("list");
      } else if (
        shouldPreserveMapOnDesktopToMobile(
          wasDesktopLayout,
          isDesktopLayout,
          mapHasFocus
        )
      ) {
        setMobileView("map");
      }
      if (wasDesktopLayout && !isDesktopLayout) {
        setShowMobilePreview(selectedIdRef.current !== null);
      }
    },
    []
  );
  const isDesktopLayout = useIsDesktopLayout(handleDesktopLayoutChange);

  const queryParam = searchParams.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(queryParam);
  const debouncedQuery = useDebouncedValue(searchInput);
  const brandSlug = searchParams.get("brand") ?? "";
  const suburb = searchParams.get("area") ?? "";
  const nearMe = searchParams.get("near") === "1";
  const selectedStoreFilterSummary = summarizeFilterLabels([
    suburb,
    filterBrands.find(([slug]) => slug === brandSlug)?.[1] ?? ""
  ]);
  const loadRequestIdRef = useRef(0);
  const lastWrittenQueryRef = useRef<string | null>(null);
  const syncingQueryRef = useRef<string | null>(null);
  const query = syncingQueryRef.current ?? debouncedQuery;

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
      setSearchParams(next, { replace: true });
      return;
    }
    if (query === queryParam) return;
    const next = new URLSearchParams(searchParams);
    if (query.trim()) next.set("q", query);
    else next.delete("q");
    lastWrittenQueryRef.current = query;
    setSearchParams(next, { replace: true });
  }, [
    debouncedQuery,
    query,
    queryParam,
    searchInput,
    searchParams,
    setSearchParams
  ]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }

    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    void loadPublicStores({ brandSlug, query, suburb }).then((result) => {
      if (requestId !== loadRequestIdRef.current) return;
      if (result.error || !result.data) {
        setErrorMessage("Stores are unavailable right now. Please try again.");
        setSelectedId(null);
        setShowMobilePreview(false);
      } else {
        setStores(result.data);
        setHasLoadedStores(true);
      }
      setIsLoading(false);
    });
  }, [brandSlug, query, suburb]);

  const loadFacets = useCallback(async () => {
    const requestId = ++facetsRequestIdRef.current;
    setFacetsStatus("loading");
    const result = await loadPublicStoreFacets();
    if (requestId !== facetsRequestIdRef.current) return;
    if (result.error || !result.data) {
      setFacetsStatus("error");
      return;
    }
    setFilterBrands(result.data.brands);
    setFilterAreas(result.data.areas);
    setFacetsStatus("ready");
  }, []);

  useEffect(() => {
    void loadFacets();
  }, [loadFacets]);

  const visibleStores = useMemo(() => {
    if (!nearMe || !userLocation) return stores;
    return stores
      .map((store) => ({
        store,
        distance: distanceKm(
          userLocation.latitude,
          userLocation.longitude,
          store.latitude,
          store.longitude
        )
      }))
      .filter(({ distance }) => distance <= 40)
      .sort((a, b) => a.distance - b.distance)
      .map(({ store }) => store);
  }, [nearMe, stores, userLocation]);
  const isInitialLoading = isLoading && !hasLoadedStores;
  const isRefreshing = isLoading && hasLoadedStores;
  const hasStoreResults =
    hasLoadedStores && !errorMessage && visibleStores.length > 0;

  const mobilePreviewId = getMobilePreviewId(
    selectedId,
    showMobilePreview,
    isDesktopLayout
  );
  const mobilePreviewStore = mobilePreviewId
    ? (visibleStores.find((store) => store.id === mobilePreviewId) ?? null)
    : null;
  const mobilePreviewIndex = mobilePreviewStore
    ? visibleStores.indexOf(mobilePreviewStore)
    : 0;

  useEffect(() => {
    if (selectedId && !visibleStores.some((store) => store.id === selectedId)) {
      setSelectedId(null);
      setShowMobilePreview(false);
    }
  }, [selectedId, visibleStores]);

  const handleMapHover = useCallback(
    (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      if (!isDesktopLayout) {
        setShowMobilePreview(true);
        return;
      }
      setShowMobilePreview(false);

      const list = storeListRef.current;
      const card = document.getElementById(`store-card-${id}`);
      if (!list || !card) return;

      const listRect = list.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (cardRect.top < listRect.top) {
        list.scrollBy({ top: cardRect.top - listRect.top, behavior: "smooth" });
      } else if (cardRect.bottom > listRect.bottom) {
        list.scrollBy({
          top: cardRect.bottom - listRect.bottom,
          behavior: "smooth"
        });
      }
    },
    [isDesktopLayout]
  );

  const handleMapMarkerSelect = useCallback(
    (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      setShowMobilePreview(!isDesktopLayout);
    },
    [isDesktopLayout]
  );

  const handleStoreSelect = useCallback(
    (id: string, source: "focus" | "hover") => {
      if (
        source === "hover" &&
        listRevealHoverLockRef.current &&
        listRevealHoverLockRef.current !== id
      ) {
        return;
      }
      selectedIdRef.current = id;
      setSelectedId(id);
      setShowMobilePreview(!isDesktopLayout);
    },
    [isDesktopLayout]
  );

  const handleMobileViewChange = useCallback(
    (nextView: "list" | "map") => {
      const currentSelectedId = selectedIdRef.current;
      if (
        shouldRevealSelectedStoreOnListTransition(
          mobileView,
          nextView,
          currentSelectedId,
          visibleStores.map((store) => store.id)
        )
      ) {
        pendingListRevealIdRef.current = currentSelectedId;
      } else {
        pendingListRevealIdRef.current = null;
      }
      if (nextView === "map" && mobileView === "list" && !isDesktopLayout) {
        setSelectedId(currentSelectedId);
        setShowMobilePreview(currentSelectedId !== null);
      }
      setMobileView(nextView);
    },
    [isDesktopLayout, mobileView, visibleStores]
  );

  useLayoutEffect(() => {
    if (mobileView !== "list") return;

    const pendingId = pendingListRevealIdRef.current;
    pendingListRevealIdRef.current = null;
    if (!pendingId) return;

    const card = document.getElementById(`store-card-${pendingId}`);
    if (!card) return;

    listRevealHoverLockRef.current = pendingId;
    card.scrollIntoView({ block: "nearest", behavior: "auto" });
    const frameId = window.requestAnimationFrame(() => {
      if (listRevealHoverLockRef.current === pendingId) {
        listRevealHoverLockRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [mobileView]);

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

  const updateSearchParam = (name: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name === "q") {
      syncingQueryRef.current = null;
      lastWrittenQueryRef.current = value;
    }
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
    <div className="flex min-h-screen flex-col bg-background">
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
      <PublicHeader />
      <main className="flex-1 w-full mx-auto max-w-[1280px] px-5 pb-8 pt-5 sm:px-8">
        <p className="text-xs font-medium leading-4 text-primary">
          STORES · AUCKLAND
        </p>
        <h1 className="mt-4 max-w-[467px] text-2xl font-semibold leading-8 md:text-[28px] md:leading-9 lg:text-[32px] lg:leading-10">
          Find your next go-to.
        </h1>
        <p className="mt-2 max-w-[560px] text-sm text-muted-foreground">
          Browse Auckland milk tea spots and see what’s nearby.
        </p>

        <div className="mt-4">
          <label className="relative block">
            <span className="sr-only">Search stores</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold">
              ⌕
            </span>
            <input
              className="search-input-custom-clear h-[52px] w-full rounded-xl border border-border bg-card px-12 pr-10 text-base text-foreground placeholder:text-muted-foreground"
              placeholder="Search for your next drink place"
              type="search"
              value={searchInput}
              onChange={(event) => {
                loadRequestIdRef.current += 1;
                syncingQueryRef.current = null;
                setSearchInput(event.target.value);
              }}
            />
            {isRefreshing ? (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center ${searchInput ? "right-12" : "right-3"}`}
              >
                <span className="store-refresh-spinner" />
              </span>
            ) : null}
            {searchInput ? (
              <button
                aria-label="Clear store search"
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-xl hover:bg-muted"
                type="button"
                onClick={() => {
                  loadRequestIdRef.current += 1;
                  setSearchInput("");
                  updateSearchParam("q", "");
                }}
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
            className={`h-11 cursor-pointer rounded-xl border border-border px-4 text-xs font-semibold ${nearMe ? "bg-accent text-primary" : "bg-card"}`}
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
              aria-label={`Filters${brandSlug || suburb ? ` · ${selectedStoreFilterSummary || "active"}` : ""}`}
              className={`inline-flex h-11 max-w-full cursor-pointer items-center rounded-xl border border-border px-4 text-xs font-semibold ${brandSlug || suburb ? "bg-accent text-primary" : "bg-card"}`}
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <FilterButtonLabel
                active={Boolean(brandSlug || suburb)}
                summary={selectedStoreFilterSummary}
              />
            </button>
            {filtersOpen ? (
              <div
                id="store-filters-popover"
                className="filter-popover"
                ref={filtersPopoverRef}
                role="group"
                aria-label="Store filters"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-popover-foreground">
                    Filter stores
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
                {facetsStatus === "error" ? (
                  <div
                    className="mt-3 rounded-lg border border-border bg-muted p-3"
                    role="alert"
                  >
                    <p className="text-xs text-muted-foreground">
                      Store filters are unavailable right now.
                    </p>
                    <button
                      className="mt-2 cursor-pointer text-xs font-semibold text-primary"
                      type="button"
                      onClick={() => void loadFacets()}
                    >
                      Retry store filters
                    </button>
                  </div>
                ) : null}
                <label htmlFor="store-area">Area</label>
                <select
                  id="store-area"
                  value={suburb}
                  onChange={(event) =>
                    updateSearchParam("area", event.target.value)
                  }
                >
                  <option value="">All areas</option>
                  {filterAreas.map((area) => (
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
                  {filterBrands.map(([slug, name]) => (
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

        {errorMessage ? (
          <p className="mt-8 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {isRefreshing ? (
          <span className="sr-only" role="status">
            Updating store results
          </span>
        ) : null}
        {hasStoreResults || isInitialLoading ? (
          <div
            className={`mt-4 flex items-center gap-3 md:hidden ${hasStoreResults ? "justify-between" : "justify-end"}`}
          >
            {hasStoreResults ? (
              <p className="text-sm font-semibold text-foreground">
                {visibleStores.length} stores
              </p>
            ) : null}
            <div
              className="flex rounded-lg border border-border bg-card p-1"
              aria-label="Store result view"
              role="group"
            >
              <button
                aria-pressed={mobileView === "list"}
                className={`min-h-10 min-w-16 cursor-pointer rounded-md px-3 text-xs font-semibold ${mobileView === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                type="button"
                onClick={() => handleMobileViewChange("list")}
              >
                List
              </button>
              <button
                aria-pressed={mobileView === "map"}
                className={`min-h-10 min-w-16 cursor-pointer rounded-md px-3 text-xs font-semibold ${mobileView === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                type="button"
                onClick={() => handleMobileViewChange("map")}
              >
                Map
              </button>
            </div>
          </div>
        ) : null}
        {isInitialLoading ? (
          <StoresInitialSkeleton
            isDesktopLayout={isDesktopLayout}
            mobileView={mobileView}
          />
        ) : null}
        {hasLoadedStores && !errorMessage && visibleStores.length === 0 ? (
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

        {hasStoreResults ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[430px_minmax(0,1fr)]">
            {isDesktopLayout || mobileView === "map" ? (
              <GoogleMapPanel
                mobileMapActive={!isDesktopLayout}
                mobilePreviewIndex={mobilePreviewIndex}
                mobilePreviewStore={mobilePreviewStore}
                stores={visibleStores}
                selectedId={selectedId}
                onHover={handleMapHover}
                onSelect={handleMapMarkerSelect}
                mapPanelRef={mapPanelRef}
              />
            ) : null}
            {isDesktopLayout || mobileView === "list" ? (
              <section
                ref={storeListRef}
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
                    onSelect={(source) => handleStoreSelect(store.id, source)}
                  />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
        {hasStoreResults ? (
          <div className="mt-6">
            <SuggestStoreCta onClick={openSuggestStore} />
          </div>
        ) : null}
      </main>
      <PublicFooter />
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
    <>
      <RouteScrollManager />
      <Routes>
        <Route element={<HomePage />} path="/" />
        <Route element={<StoresPage />} path="/stores" />
        <Route element={<StoreDetailPage />} path="/stores/:slug" />
        <Route element={<SearchPage />} path="/search" />
        <Route element={<MomentsPage />} path="/moments" />
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
    </>
  );
}
