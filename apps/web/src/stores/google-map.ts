export type GoogleLatLng = { lat: number; lng: number };

export type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds) => void;
  setCenter: (center: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

export type GoogleLatLngBounds = {
  extend: (point: GoogleLatLng) => void;
};

export type GoogleMarkerIcon = {
  url: string;
};

type GoogleMarker = {
  addListener: (
    eventName: "click",
    handler: () => void
  ) => { remove: () => void };
  setIcon: (icon: GoogleMarkerIcon) => void;
  setMap: (map: GoogleMapInstance | null) => void;
  setZIndex: (zIndex: number | null) => void;
};

export type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: {
        center: GoogleLatLng;
        disableDefaultUI: boolean;
        fullscreenControl: boolean;
        gestureHandling: "cooperative";
        mapTypeControl: boolean;
        streetViewControl: boolean;
        zoom: number;
        zoomControl: boolean;
      }
    ) => GoogleMapInstance;
    Marker: new (options: {
      map: GoogleMapInstance;
      position: GoogleLatLng;
      title: string;
      icon?: GoogleMarkerIcon;
      zIndex?: number;
    }) => GoogleMarker;
    LatLngBounds: new () => GoogleLatLngBounds;
  };
};

type GoogleMapsGlobal = {
  maps?: {
    importLibrary?: (
      libraryName: "maps" | "core" | "marker"
    ) => Promise<unknown>;
  };
};

type GoogleMapsWindow = Window & {
  google?: GoogleMapsGlobal;
  __wemilkteaGoogleMapsReady?: () => void;
};

type GoogleMapsLibrary = Pick<GoogleMapsApi["maps"], "Map">;
type GoogleCoreLibrary = Pick<GoogleMapsApi["maps"], "LatLngBounds">;
type GoogleMarkerLibrary = Pick<GoogleMapsApi["maps"], "Marker">;

const googleMapsCallbackName = "__wemilkteaGoogleMapsReady";
const googleMapsLoadTimeoutMs = 15_000;
let googleMapsPromise: Promise<GoogleMapsApi> | null = null;

export function buildStoreMarkerIcon(selected = false): GoogleMarkerIcon {
  const height = selected ? 48 : 44;
  const width = selected ? 40 : 36;
  const pinColor = selected ? "#273328" : "#526b50";
  const strokeWidth = selected ? 3 : 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 2C10.6 2 3 9.2 3 18c0 11.7 13.6 24.9 17 28 3.4-3.1 17-16.3 17-28C37 9.2 29.4 2 20 2Z" fill="${pinColor}" stroke="#fffdf8" stroke-width="${strokeWidth}"/><path d="M13 16h14v14H13z" fill="#fffdf8"/><path d="M12 16h16l-2-3H14l-2 3Z" fill="#e4eddc" stroke="#273328" stroke-width="1.5"/><path d="M20 13V8" stroke="#273328" stroke-width="1.5" stroke-linecap="round"/><circle cx="17" cy="25" r="2" fill="#a97850"/><circle cx="23" cy="27" r="2" fill="#a97850"/><circle cx="20" cy="22" r="2" fill="#c58a62"/></svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
  };
}

export function buildGoogleMapsScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    callback: googleMapsCallbackName,
    key: apiKey,
    loading: "async",
    v: "weekly"
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

async function resolveGoogleMapsApi(): Promise<GoogleMapsApi> {
  const googleMaps = (window as GoogleMapsWindow).google;
  const importLibrary = googleMaps?.maps?.importLibrary;
  if (!importLibrary) {
    throw new Error("Google Maps loaded without its Maps API.");
  }

  const [mapsLibrary, coreLibrary, markerLibrary] = await Promise.all([
    importLibrary("maps") as Promise<GoogleMapsLibrary>,
    importLibrary("core") as Promise<GoogleCoreLibrary>,
    importLibrary("marker") as Promise<GoogleMarkerLibrary>
  ]);

  if (!mapsLibrary.Map || !coreLibrary.LatLngBounds || !markerLibrary.Marker) {
    throw new Error("Google Maps loaded without its required libraries.");
  }

  return {
    maps: {
      Map: mapsLibrary.Map,
      Marker: markerLibrary.Marker,
      LatLngBounds: coreLibrary.LatLngBounds
    }
  };
}

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps browser key is missing."));
  }

  if (googleMapsPromise) return googleMapsPromise;

  const promise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const googleWindow = window as GoogleMapsWindow;
    let readinessStarted = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (googleWindow[googleMapsCallbackName] === handleReady) {
        delete googleWindow[googleMapsCallbackName];
      }
    };

    const handleReady = () => {
      if (readinessStarted) return;
      readinessStarted = true;
      void resolveGoogleMapsApi().then(
        (googleMaps) => {
          cleanup();
          resolve(googleMaps);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        }
      );
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Google Maps could not be loaded."));
    };

    // With loading=async, Google’s callback is the API readiness signal.
    googleWindow[googleMapsCallbackName] = handleReady;
    timeoutId = setTimeout(handleError, googleMapsLoadTimeoutMs);

    const currentGoogle = googleWindow.google;
    if (currentGoogle?.maps?.importLibrary) {
      handleReady();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-wemilktea-google-maps="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.wemilkteaGoogleMaps = "true";
    script.src = buildGoogleMapsScriptUrl(apiKey);
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  googleMapsPromise = promise.catch((error: unknown) => {
    console.error(
      "Google Maps loader failed.",
      error instanceof Error ? error.message : error
    );
    throw error;
  });

  return googleMapsPromise;
}

export function resetGoogleMapsLoaderForTests() {
  googleMapsPromise = null;
}
