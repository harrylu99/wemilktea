import { z } from "zod";
import { discoveryRequestConfig } from "./discovery-config.ts";

const textSearchUrl = "https://places.googleapis.com/v1/places:searchText";

const placeSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string().trim().min(1) }),
    location: z
      .object({ latitude: z.number(), longitude: z.number() })
      .optional()
  })
  .passthrough();

const textSearchResponseSchema = z.object({
  places: z.array(placeSchema).default([]),
  nextPageToken: z.string().min(1).optional()
});

export type NormalizedGooglePlace = {
  googlePlaceId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

export type GooglePlacesPage = {
  places: NormalizedGooglePlace[];
  nextPageToken: string | null;
};

export type GooglePlacesClient = {
  searchText(input: {
    query: string;
    pageToken?: string;
  }): Promise<GooglePlacesPage>;
};

type FetchLike = typeof fetch;

export class GooglePlacesRequestError extends Error {
  constructor(status: number) {
    super(`Google Places request failed with status ${status}.`);
    this.name = "GooglePlacesRequestError";
  }
}

function validCoordinate(
  latitude: number | undefined,
  longitude: number | undefined
) {
  return (
    latitude !== undefined &&
    longitude !== undefined &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function normalizeGooglePlace(
  value: unknown
): NormalizedGooglePlace | null {
  const parsed = placeSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const location = parsed.data.location;
  const hasCoordinates = validCoordinate(
    location?.latitude,
    location?.longitude
  );

  return {
    googlePlaceId: parsed.data.id,
    name: parsed.data.displayName.text,
    latitude: hasCoordinates ? location!.latitude : null,
    longitude: hasCoordinates ? location!.longitude : null
  };
}

export function createGooglePlacesClient(
  apiKey: string,
  fetchImplementation: FetchLike = fetch
): GooglePlacesClient {
  return {
    async searchText({ query, pageToken }) {
      const response = await fetchImplementation(textSearchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.location,nextPageToken"
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: discoveryRequestConfig.pageSize,
          ...(pageToken ? { pageToken } : {}),
          languageCode: "en",
          locationBias: {
            circle: {
              center: {
                latitude: discoveryRequestConfig.locationBias.latitude,
                longitude: discoveryRequestConfig.locationBias.longitude
              },
              radius: discoveryRequestConfig.locationBias.radiusMetres
            }
          }
        })
      });

      if (!response.ok) {
        throw new GooglePlacesRequestError(response.status);
      }

      const parsed = textSearchResponseSchema.safeParse(await response.json());

      if (!parsed.success) {
        throw new Error("Google Places returned an invalid response.");
      }

      return {
        places: parsed.data.places
          .map(normalizeGooglePlace)
          .filter((place): place is NormalizedGooglePlace => place !== null),
        nextPageToken: parsed.data.nextPageToken ?? null
      };
    }
  };
}
