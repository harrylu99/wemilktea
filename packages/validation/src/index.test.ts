import { expect, test } from "bun:test";
import {
  approveStoreCandidateSchema,
  browserEnvironmentSchema,
  candidateGoogleDetailSchema,
  storeManagementListItemSchema,
  storeDiscoveryResultSchema,
  storeSuggestionSchema,
  updateStoreManagementSchema
} from "./index";

test("accepts a complete store suggestion", () => {
  expect(
    storeSuggestionSchema.parse({
      storeName: "Example Tea",
      suburb: "Auckland CBD",
      googleMapsUrl: "https://maps.google.com/?q=Example+Tea",
      officialUrl: "https://example.com",
      notes: "Try the brown sugar milk tea.",
      submitterEmail: "tea-fan@example.com"
    })
  ).toEqual({
    storeName: "Example Tea",
    suburb: "Auckland CBD",
    googleMapsUrl: "https://maps.google.com/?q=Example+Tea",
    officialUrl: "https://example.com",
    notes: "Try the brown sugar milk tea.",
    submitterEmail: "tea-fan@example.com"
  });
});

test("rejects incomplete or invalid browser configuration", () => {
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_URL: "https://example.supabase.co"
    }).success
  ).toBeFalse();
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_ANON_KEY: "anon-key"
    }).success
  ).toBeFalse();
  expect(
    browserEnvironmentSchema.safeParse({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_ANON_KEY: "anon-key"
    }).success
  ).toBeFalse();
});

test("rejects an empty store suggestion name", () => {
  expect(
    storeSuggestionSchema.safeParse({
      storeName: "   ",
      suburb: "Auckland CBD"
    }).success
  ).toBeFalse();
});

test("rejects an invalid store suggestion fields", () => {
  expect(
    storeSuggestionSchema.safeParse({
      storeName: "Example Tea",
      suburb: "Auckland CBD",
      googleMapsUrl: "javascript:alert(1)"
    }).success
  ).toBeFalse();
  expect(
    storeSuggestionSchema.safeParse({
      storeName: "Example Tea",
      suburb: "Auckland CBD",
      submitterEmail: "not-an-email"
    }).success
  ).toBeFalse();
});

test("validates the server-side store discovery response", () => {
  expect(
    storeDiscoveryResultSchema.safeParse({
      runId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      status: "succeeded",
      queryCount: 8,
      resultCount: 112,
      newCandidateCount: 8,
      knownCount: 101,
      possibleDuplicateCount: 3,
      errorSummary: null
    }).success
  ).toBeTrue();
  expect(
    storeDiscoveryResultSchema.safeParse({ status: "succeeded" }).success
  ).toBeFalse();
});

test("requires verified canonical data before approving a candidate", () => {
  expect(
    approveStoreCandidateSchema.safeParse({
      candidateId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      brand: {
        mode: "existing",
        brandId: "4b75bfe1-f502-4c41-ad08-4b4d9b16bfc2"
      },
      location: {
        displayName: "Tea House Central",
        slug: "tea-house-central",
        suburb: "Auckland CBD",
        address: "1 Queen Street, Auckland",
        latitude: -36.8485,
        longitude: 174.7633,
        sourceReference: "https://example.com/stores/central"
      }
    }).success
  ).toBeTrue();
  expect(
    approveStoreCandidateSchema.safeParse({
      candidateId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
      brand: { mode: "new", name: "Tea House", slug: "Tea House" },
      location: {}
    }).success
  ).toBeFalse();
});

test("validates the transient Google detail contract", () => {
  expect(
    candidateGoogleDetailSchema.safeParse({
      placeId: "ChIJexample",
      displayName: "Tea House",
      formattedAddress: "1 Queen Street, Auckland",
      latitude: -36.8485,
      longitude: 174.7633,
      businessStatus: "OPERATIONAL",
      websiteUri: null,
      googleMapsUri: "https://maps.google.com/?cid=1",
      attributionLabel: "Google Maps"
    }).success
  ).toBeTrue();
});

test("validates canonical store-management updates", () => {
  expect(
    updateStoreManagementSchema.safeParse({
      locationId: "9adff3b8-a8a3-4b15-a03b-64b4730e1dde",
      expectedUpdatedAt: "2026-08-12T00:00:00.000Z",
      brandId: "6b2f9ccb-fd9c-4a19-9d42-e9203b48ba3e",
      location: {
        displayName: "Gong cha Newmarket",
        slug: "gong-cha-newmarket",
        suburb: "Newmarket",
        address: "123 Broadway, Auckland",
        latitude: -36.87,
        longitude: 174.78,
        sourceReference: "https://example.test/verification"
      }
    }).success
  ).toBeTrue();
});

test("accepts Supabase timestamptz offsets for store-management rows", () => {
  const row = {
    id: "a9a8eaa0-cfc0-4372-b897-66cb106a2ffd",
    brand_id: "876d4af2-a2c5-434f-b573-78eb1ce09a74",
    display_name: "Wucha Ormiston",
    slug: "wucha-ormiston",
    suburb: "Flat Bush",
    publication_status: "draft",
    created_at: "2026-08-15T03:35:18.842225+00:00",
    updated_at: "2026-08-15T03:35:18.842225+00:00"
  };

  expect(storeManagementListItemSchema.safeParse(row).success).toBeTrue();
});
