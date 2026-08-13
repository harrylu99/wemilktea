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

export const imageStorageRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("authorize"),
    locationId: uuidSchema,
    contentType: contentTypeSchema,
    byteSize: z.number().int().positive().max(maxImageBytes),
    altText: z.string().trim().max(200).optional()
  }),
  z.object({
    action: z.literal("confirm"),
    locationId: uuidSchema,
    storageKey: z.string().min(1).max(300),
    contentType: contentTypeSchema,
    altText: z.string().trim().max(200).optional(),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional()
  }),
  z.object({
    action: z.literal("remove"),
    locationId: uuidSchema
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

export function buildStoreStorageKey(
  locationId: string,
  contentType: AllowedImageContentType,
  id = crypto.randomUUID()
) {
  return `stores/${locationId}/${id}.${extensionForContentType(contentType)}`;
}

export function isStoreStorageKeyForLocation(
  storageKey: string,
  locationId: string
) {
  return new RegExp(
    `^stores/${locationId}/[0-9a-f-]+\\.(jpg|jpeg|png|webp)$`
  ).test(storageKey);
}

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
