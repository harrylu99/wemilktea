export type GoogleLatLng = { lat: number; lng: number };

export type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds) => void;
  setCenter: (center: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

export type GoogleLatLngBounds = {
  extend: (point: GoogleLatLng) => void;
};

type GoogleMarker = {
  addListener: (
    eventName: "click",
    handler: () => void
  ) => { remove: () => void };
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
      zIndex?: number;
    }) => GoogleMarker;
    LatLngBounds: new () => GoogleLatLngBounds;
  };
};

let googleMapsPromise: Promise<GoogleMapsApi> | null = null;

export function buildGoogleMapsScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    loading: "async",
    v: "weekly"
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps browser key is missing."));
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const currentGoogle = (window as Window & { google?: GoogleMapsApi })
      .google;
    if (currentGoogle?.maps) {
      resolve(currentGoogle);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-wemilktea-google-maps="true"]'
    );

    const handleLoad = () => {
      const googleMaps = (window as Window & { google?: GoogleMapsApi }).google;
      if (googleMaps?.maps) resolve(googleMaps);
      else reject(new Error("Google Maps loaded without its Maps API."));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google Maps could not be loaded.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.wemilkteaGoogleMaps = "true";
    script.src = buildGoogleMapsScriptUrl(apiKey);
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Maps could not be loaded.")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function resetGoogleMapsLoaderForTests() {
  googleMapsPromise = null;
}
