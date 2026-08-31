import { supabase, supabaseConfigurationError } from "./lib/supabase";
import type { normalizeMomentImage } from "./moments-image-normalization";

type NormalizedMomentImage = Awaited<ReturnType<typeof normalizeMomentImage>>;

type UploadAuthorization = {
  uploadUrl: string;
  quarantineKey: string;
  contentType: "image/webp";
  expiresIn: number;
  maxBytes: number;
};

export type FinalizedMomentImage = {
  postId: string;
  imageAssetId: string;
  storageKey: string;
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
};

export class MomentImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentImageUploadError";
  }
}

function getClient() {
  if (!supabase) {
    throw new MomentImageUploadError(
      supabaseConfigurationError ?? "Moments image upload is not configured."
    );
  }
  return supabase;
}

function isUploadAuthorization(value: unknown): value is UploadAuthorization {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<UploadAuthorization>;
  return (
    typeof response.uploadUrl === "string" &&
    typeof response.quarantineKey === "string" &&
    response.contentType === "image/webp" &&
    typeof response.expiresIn === "number" &&
    typeof response.maxBytes === "number"
  );
}

function isFinalizedMomentImage(value: unknown): value is FinalizedMomentImage {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<FinalizedMomentImage>;
  return (
    typeof response.postId === "string" &&
    typeof response.imageAssetId === "string" &&
    typeof response.storageKey === "string" &&
    response.contentType === "image/webp" &&
    typeof response.byteSize === "number" &&
    typeof response.width === "number" &&
    typeof response.height === "number"
  );
}

export async function uploadMomentImage(
  postId: string,
  normalized: NormalizedMomentImage
): Promise<FinalizedMomentImage> {
  const client = getClient();
  const authorization = await client.functions.invoke(
    "community-image-storage",
    {
      body: { action: "authorize", postId }
    }
  );
  if (authorization.error || !isUploadAuthorization(authorization.data)) {
    throw new MomentImageUploadError("Upload authorization was not available.");
  }

  if (normalized.file.size > authorization.data.maxBytes) {
    throw new MomentImageUploadError("The normalized image is too large.");
  }

  const uploadResponse = await fetch(authorization.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": authorization.data.contentType },
    body: normalized.file
  }).catch(() => null);
  if (!uploadResponse?.ok) {
    throw new MomentImageUploadError("The image could not be uploaded.");
  }

  const finalized = await client.functions.invoke("community-image-storage", {
    body: {
      action: "finalize",
      postId,
      quarantineKey: authorization.data.quarantineKey
    }
  });
  if (finalized.error || !isFinalizedMomentImage(finalized.data)) {
    throw new MomentImageUploadError(
      "The uploaded image could not be finalized."
    );
  }
  return finalized.data;
}
