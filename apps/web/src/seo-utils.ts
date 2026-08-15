export const publicSiteDescription =
  "Discover milk tea stores, bubble tea drinks and new favourites around Auckland with WeMilktea.";

function siteOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the browser origin for a malformed local value.
    }
  }

  return typeof window === "undefined"
    ? "http://localhost:5173"
    : window.location.origin;
}

export function publicUrl(path: string) {
  return new URL(path.replace(/^\/?/, "/"), `${siteOrigin()}/`).toString();
}

export function localBusinessJsonLd(store: {
  displayName: string;
  suburb: string;
  address: string;
  latitude: number;
  longitude: number;
  url: string;
  imageUrl?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: store.displayName,
    url: store.url,
    address: {
      "@type": "PostalAddress",
      streetAddress: store.address,
      addressLocality: store.suburb,
      addressRegion: "Auckland",
      addressCountry: "NZ"
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: store.latitude,
      longitude: store.longitude
    },
    ...(store.imageUrl ? { image: [store.imageUrl] } : {})
  } satisfies Record<string, unknown>;
}

export function productJsonLd(product: {
  name: string;
  description: string | null;
  brandName: string;
  url: string;
  imageUrl?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: { "@type": "Brand", name: product.brandName },
    url: product.url,
    ...(product.description ? { description: product.description } : {}),
    ...(product.imageUrl ? { image: [product.imageUrl] } : {})
  } satisfies Record<string, unknown>;
}
