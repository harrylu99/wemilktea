import { z } from "zod";

export const allowedImageContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export const maxImageBytes = 10 * 1024 * 1024;

const contentTypeSchema = z.enum(allowedImageContentTypes);
const uuidSchema = z.string().uuid();
export type AllowedImageContentType = (typeof allowedImageContentTypes)[number];
export const imageEntityTypes = ["store", "product"] as const;
export type ImageEntityType = (typeof imageEntityTypes)[number];

export const imageStorageRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("authorize"),
    entityType: z.enum(imageEntityTypes),
    entityId: uuidSchema,
    contentType: contentTypeSchema,
    byteSize: z.number().int().positive().max(maxImageBytes),
    altText: z.string().trim().max(200).optional()
  }),
  z.object({
    action: z.literal("confirm"),
    entityType: z.enum(imageEntityTypes),
    entityId: uuidSchema,
    storageKey: z.string().min(1).max(300),
    contentType: contentTypeSchema,
    altText: z.string().trim().max(200).optional(),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional()
  }),
  z.object({
    action: z.literal("remove"),
    entityType: z.enum(imageEntityTypes),
    entityId: uuidSchema
  })
]);

export type ImageStorageRequest = z.infer<typeof imageStorageRequestSchema>;

const extensionByContentType: Record<AllowedImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function extensionForContentType(contentType: AllowedImageContentType) {
  return extensionByContentType[contentType];
}

export function buildImageStorageKey(
  entityType: ImageEntityType,
  entityId: string,
  contentType: AllowedImageContentType,
  id = crypto.randomUUID()
) {
  return `${entityType === "store" ? "stores" : "products"}/${entityId}/${id}.${extensionForContentType(contentType)}`;
}

export function isImageStorageKeyForEntity(
  storageKey: string,
  entityType: ImageEntityType,
  entityId: string
) {
  return new RegExp(
    `^${entityType === "store" ? "stores" : "products"}/${entityId}/[0-9a-f-]+\\.(jpg|jpeg|png|webp)$`
  ).test(storageKey);
}

export const buildStoreStorageKey = (
  locationId: string,
  contentType: AllowedImageContentType,
  id?: string
) => buildImageStorageKey("store", locationId, contentType, id);

export const isStoreStorageKeyForLocation = (
  storageKey: string,
  locationId: string
) => isImageStorageKeyForEntity(storageKey, "store", locationId);

export function publicImageUrl(baseUrl: string, storageKey: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (
    !normalizedBaseUrl ||
    storageKey.includes("..") ||
    storageKey.startsWith("/")
  ) {
    return null;
  }
  return `${normalizedBaseUrl}/${storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}
