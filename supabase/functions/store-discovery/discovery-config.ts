export const discoverySearches = [
  "bubble tea Auckland",
  "milk tea Auckland",
  "boba Auckland",
  "matcha Auckland",
  "bubble tea Auckland CBD",
  "bubble tea North Shore",
  "bubble tea East Auckland",
  "bubble tea South Auckland"
] as const;

export const discoveryRequestConfig = {
  pageSize: 20,
  maxPagesPerSearch: 2,
  locationBias: {
    latitude: -36.8485,
    longitude: 174.7633,
    radiusMetres: 35_000
  }
} as const;
