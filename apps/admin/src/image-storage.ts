import { imageStorageConfig, publicImageUrl } from "@wemilktea/config";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

type ImageStorageResponse = {
  uploadUrl: string;
  storageKey: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
};

function isSupportedImageType(
  value: string
): value is (typeof imageStorageConfig.contentTypes)[number] {
  return imageStorageConfig.contentTypes.some((type) => type === value);
}

export type ManagedImage = {
  id: string;
  storageKey: string;
  altText: string | null;
  contentType: string | null;
  byteSize: number | null;
};

export class ImageStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageStorageError";
  }
}

function isImageStorageResponse(value: unknown): value is ImageStorageResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<ImageStorageResponse>;
  return (
    typeof response.uploadUrl === "string" &&
    typeof response.storageKey === "string" &&
    typeof response.contentType === "string" &&
    typeof response.expiresIn === "number" &&
    typeof response.maxBytes === "number"
  );
}

function getClient() {
  if (!supabase) {
    throw new ImageStorageError(
      supabaseConfigurationError ?? "Image storage is not configured."
    );
  }
  return supabase;
}

export async function uploadStoreImage(input: {
  locationId: string;
  file: File;
  altText?: string;
}) {
  const client = getClient();
  if (!isSupportedImageType(input.file.type)) {
    throw new ImageStorageError("Choose a JPEG, PNG, or WebP image.");
  }
  if (input.file.size < 1 || input.file.size > imageStorageConfig.maxBytes) {
    throw new ImageStorageError("Images must be smaller than 10 MB.");
  }

  const authorization = await client.functions.invoke("image-storage", {
    body: {
      action: "authorize",
      locationId: input.locationId,
      contentType: input.file.type,
      byteSize: input.file.size,
      ...(input.altText?.trim() ? { altText: input.altText.trim() } : {})
    }
  });
  if (authorization.error || !isImageStorageResponse(authorization.data)) {
    throw new ImageStorageError("Upload authorization was not available.");
  }

  const uploadResponse = await fetch(authorization.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.file.type },
    body: input.file
  }).catch(() => null);
  if (!uploadResponse?.ok) {
    throw new ImageStorageError("The image could not be uploaded.");
  }

  const confirmation = await client.functions.invoke("image-storage", {
    body: {
      action: "confirm",
      locationId: input.locationId,
      storageKey: authorization.data.storageKey,
      contentType: input.file.type,
      ...(input.altText?.trim() ? { altText: input.altText.trim() } : {})
    }
  });
  if (confirmation.error || !confirmation.data?.ok) {
    throw new ImageStorageError("The uploaded image could not be saved.");
  }
}

export async function removeStoreImage(locationId: string) {
  const client = getClient();
  const result = await client.functions.invoke("image-storage", {
    body: { action: "remove", locationId }
  });
  if (result.error || !result.data?.ok) {
    throw new ImageStorageError("The image could not be removed.");
  }
}

export function managedImageUrl(image: ManagedImage) {
  const baseUrl =
    typeof import.meta.env.VITE_R2_PUBLIC_BASE_URL === "string"
      ? import.meta.env.VITE_R2_PUBLIC_BASE_URL
      : "";
  return publicImageUrl(baseUrl, image.storageKey);
}
