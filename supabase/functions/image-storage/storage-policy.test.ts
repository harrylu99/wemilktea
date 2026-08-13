import { expect, test } from "bun:test";
import {
  buildStoreStorageKey,
  buildImageStorageKey,
  imageStorageRequestSchema,
  isStoreStorageKeyForLocation,
  maxImageBytes,
  publicImageUrl
} from "./storage-policy";

const locationId = "9adff3b8-a8a3-4b15-a03b-64b4730e1dde";

test("builds a scoped unique store image key", () => {
  const key = buildStoreStorageKey(locationId, "image/webp", "abc-def");
  expect(key).toBe(`stores/${locationId}/abc-def.webp`);
  expect(isStoreStorageKeyForLocation(key, locationId)).toBeTrue();
  expect(
    isStoreStorageKeyForLocation(key, "6b2f9ccb-fd9c-4a19-9d42-e9203b48ba3e")
  ).toBeFalse();
});

test("builds a product-specific image key and rejects cross-entity keys", () => {
  const key = buildImageStorageKey(
    "product",
    locationId,
    "image/png",
    "abc-def"
  );
  expect(key).toBe(`products/${locationId}/abc-def.png`);
  expect(isStoreStorageKeyForLocation(key, locationId)).toBeFalse();
});

test("validates the small supported image contract", () => {
  expect(
    imageStorageRequestSchema.safeParse({
      action: "authorize",
      entityType: "store",
      entityId: locationId,
      contentType: "image/jpeg",
      byteSize: maxImageBytes
    }).success
  ).toBeTrue();
  expect(
    imageStorageRequestSchema.safeParse({
      action: "authorize",
      entityType: "product",
      entityId: locationId,
      contentType: "image/gif",
      byteSize: 20
    }).success
  ).toBeFalse();
  expect(
    imageStorageRequestSchema.safeParse({
      action: "authorize",
      entityType: "store",
      entityId: locationId,
      contentType: "image/png",
      byteSize: maxImageBytes + 1
    }).success
  ).toBeFalse();
});

test("builds a safe configurable public image URL", () => {
  expect(
    publicImageUrl("https://images.example.test/", "stores/a/image.webp")
  ).toBe("https://images.example.test/stores/a/image.webp");
  expect(
    publicImageUrl("https://images.example.test", "../secret.webp")
  ).toBeNull();
});
