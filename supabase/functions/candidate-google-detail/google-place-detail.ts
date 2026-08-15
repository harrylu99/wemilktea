import { z } from "zod";

const placeDetailsUrl = "https://places.googleapis.com/v1/places/";

const placeDetailSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string().trim().min(1) }),
    formattedAddress: z.string().trim().min(1).optional(),
    location: z
      .object({ latitude: z.number(), longitude: z.number() })
      .optional(),
    businessStatus: z.string().trim().min(1).optional(),
    websiteUri: z.string().url().optional(),
    googleMapsUri: z.string().url().optional()
  })
  .passthrough();

export type GooglePlaceDetail = {
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  attributionLabel: "Google Maps";
};

export class GooglePlaceDetailError extends Error {
  constructor(readonly status: number) {
    super(`Google Places detail request failed with status ${status}.`);
    this.name = "GooglePlaceDetailError";
  }
}

function validCoordinates(
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

export function normalizeGooglePlaceDetail(
  value: unknown
): GooglePlaceDetail | null {
  const parsed = placeDetailSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const { location } = parsed.data;
  const hasCoordinates = validCoordinates(
    location?.latitude,
    location?.longitude
  );

  return {
    placeId: parsed.data.id,
    displayName: parsed.data.displayName.text,
    formattedAddress: parsed.data.formattedAddress ?? null,
    latitude: hasCoordinates ? location!.latitude : null,
    longitude: hasCoordinates ? location!.longitude : null,
    businessStatus: parsed.data.businessStatus ?? null,
    websiteUri: parsed.data.websiteUri ?? null,
    googleMapsUri: parsed.data.googleMapsUri ?? null,
    attributionLabel: "Google Maps"
  };
}

export function createGooglePlaceDetailClient(
  apiKey: string,
  fetchImplementation: typeof fetch = fetch
) {
  return {
    async getPlaceDetail(googlePlaceId: string) {
      const response = await fetchImplementation(
        `${placeDetailsUrl}${encodeURIComponent(googlePlaceId)}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,location,businessStatus,websiteUri,googleMapsUri"
          }
        }
      );

      if (!response.ok) {
        throw new GooglePlaceDetailError(response.status);
      }

      const detail = normalizeGooglePlaceDetail(await response.json());

      if (!detail) {
        throw new Error("Google Places returned an invalid detail response.");
      }

      return detail;
    }
  };
}
