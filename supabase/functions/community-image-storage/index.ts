import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createCommunityR2Storage,
  type CommunityR2Storage
} from "./storage.ts";
import {
  buildQuarantineKey,
  communityImageRequestSchema,
  parseOwnedQuarantineKey
} from "./storage-policy.ts";
import {
  createMomentsUploadToken,
  momentsUploadTokenPurpose,
  momentsUploadTokenVersion
} from "../_shared/moments-upload-token.ts";
import { verifyAndPromote, shouldDeleteQuarantine } from "./verification.ts";

const uploadExpirySeconds = 10 * 60;
const maxImageBytes = 10 * 1024 * 1024;

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MOMENTS_APP_ORIGIN: z.string().url(),
  MOMENTS_IMAGE_UPLOAD_URL: z.string().url(),
  MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET: z.string().min(1),
  MOMENTS_IMAGE_VERIFIER_URL: z.string().url(),
  MOMENTS_IMAGE_VERIFIER_TOKEN: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1)
});

type FinalizedImage = {
  postId: string;
  imageAssetId: string;
  storageKey: string;
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
};

function response(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function corsHeaders(request: Request, origin: string) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

async function requireUser(
  request: Request,
  environment: z.infer<typeof environmentSchema>
) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: authorization } }
    }
  );
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { client, userId: data.user.id };
}

function createServiceClient(environment: z.infer<typeof environmentSchema>) {
  return createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function deleteObject(storage: CommunityR2Storage, key: string) {
  try {
    await storage.deleteObject(key);
    return false;
  } catch (error) {
    console.error("Moments image cleanup failed.", error);
    return true;
  }
}

async function readFinalizedImage(
  client: SupabaseClient,
  postId: string,
  userId: string,
  finalKey: string
): Promise<FinalizedImage | null> {
  const { data: post, error: postError } = await client
    .from("community_posts")
    .select("id, owner_user_id, image_asset_id, status")
    .eq("id", postId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (postError || !post || post.status !== "active" || !post.image_asset_id)
    return null;

  const { data: asset, error: assetError } = await client
    .from("image_assets")
    .select("id, storage_key, content_type, byte_size, width, height")
    .eq("id", post.image_asset_id)
    .maybeSingle();
  if (
    assetError ||
    !asset ||
    asset.storage_key !== finalKey ||
    asset.content_type !== "image/webp" ||
    typeof asset.byte_size !== "number" ||
    typeof asset.width !== "number" ||
    typeof asset.height !== "number"
  )
    return null;
  return {
    postId,
    imageAssetId: asset.id,
    storageKey: asset.storage_key,
    contentType: "image/webp",
    byteSize: asset.byte_size,
    width: asset.width,
    height: asset.height
  };
}

Deno.serve(async (request) => {
  const environment = environmentSchema.safeParse({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    MOMENTS_APP_ORIGIN: Deno.env.get("MOMENTS_APP_ORIGIN"),
    MOMENTS_IMAGE_UPLOAD_URL: Deno.env.get("MOMENTS_IMAGE_UPLOAD_URL"),
    MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET: Deno.env.get(
      "MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET"
    ),
    MOMENTS_IMAGE_VERIFIER_URL: Deno.env.get("MOMENTS_IMAGE_VERIFIER_URL"),
    MOMENTS_IMAGE_VERIFIER_TOKEN: Deno.env.get("MOMENTS_IMAGE_VERIFIER_TOKEN"),
    R2_ACCOUNT_ID: Deno.env.get("R2_ACCOUNT_ID"),
    R2_ACCESS_KEY_ID: Deno.env.get("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: Deno.env.get("R2_SECRET_ACCESS_KEY"),
    R2_BUCKET: Deno.env.get("R2_BUCKET")
  });
  if (!environment.success)
    return response(
      { error: "Moments image storage is not configured." },
      500,
      {}
    );

  const headers = corsHeaders(request, environment.data.MOMENTS_APP_ORIGIN);
  if (!headers) return response({ error: "Origin is not allowed." }, 403, {});
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return response({ error: "Method not allowed." }, 405, headers);

  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json().catch(() => null)
    : null;
  const parsed = communityImageRequestSchema.safeParse(body);
  if (!parsed.success)
    return response({ error: "Invalid Moments image request." }, 400, headers);

  const user = await requireUser(request, environment.data);
  if (!user)
    return response({ error: "Authentication is required." }, 401, headers);

  const storage = createCommunityR2Storage({
    accountId: environment.data.R2_ACCOUNT_ID,
    accessKeyId: environment.data.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.data.R2_SECRET_ACCESS_KEY,
    bucket: environment.data.R2_BUCKET
  });
  const serviceClient = createServiceClient(environment.data);

  if (parsed.data.action === "authorize") {
    const { error } = await user.client.rpc(
      "consume_community_image_upload_authorization",
      { p_post_id: parsed.data.postId }
    );
    if (error) {
      const isQuotaExceeded = [
        "upload_hourly_limit",
        "upload_daily_limit",
        "post_upload_limit"
      ].includes(error.message);
      return response(
        {
          error: isQuotaExceeded
            ? "The Moments upload limit has been reached. Please try again later."
            : "This Moment is not uploadable."
        },
        isQuotaExceeded ? 429 : 403,
        headers
      );
    }

    const uploadId = crypto.randomUUID();
    const quarantineKey = buildQuarantineKey(
      user.userId,
      parsed.data.postId,
      uploadId
    );
    const uploadToken = await createMomentsUploadToken(
      {
        v: momentsUploadTokenVersion,
        purpose: momentsUploadTokenPurpose,
        ownerUserId: user.userId,
        postId: parsed.data.postId,
        uploadId,
        quarantineKey,
        sourceContentType: parsed.data.sourceContentType,
        normalization: parsed.data.normalization,
        expiresAt: Math.floor(Date.now() / 1000) + uploadExpirySeconds
      },
      environment.data.MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET
    );
    return response(
      {
        uploadUrl: `${environment.data.MOMENTS_IMAGE_UPLOAD_URL.replace(/\/+$/, "")}/upload`,
        uploadToken,
        quarantineKey,
        contentType: parsed.data.sourceContentType,
        normalization: parsed.data.normalization,
        expiresIn: uploadExpirySeconds,
        maxBytes: maxImageBytes
      },
      200,
      headers
    );
  }

  const finalKey = parseOwnedQuarantineKey(
    parsed.data.quarantineKey,
    user.userId,
    parsed.data.postId
  );
  if (!finalKey)
    return response(
      { error: "Invalid Moments image reference." },
      400,
      headers
    );

  const existing = await readFinalizedImage(
    serviceClient,
    parsed.data.postId,
    user.userId,
    finalKey
  );
  if (existing) return response(existing, 200, headers);

  try {
    const object = await storage.headObject(parsed.data.quarantineKey);
    if (
      object.contentType !== "image/webp" ||
      object.contentLength === null ||
      object.contentLength < 1 ||
      object.contentLength > maxImageBytes ||
      !object.etag
    ) {
      await deleteObject(storage, parsed.data.quarantineKey);
      return response(
        { error: "Uploaded image could not be verified." },
        400,
        headers
      );
    }

    const verified = await verifyAndPromote({
      verifierUrl: environment.data.MOMENTS_IMAGE_VERIFIER_URL,
      verifierToken: environment.data.MOMENTS_IMAGE_VERIFIER_TOKEN,
      sourceKey: parsed.data.quarantineKey,
      finalKey,
      expectedEtag: object.etag
    });
    if (verified.kind !== "success") {
      if (shouldDeleteQuarantine(verified))
        await deleteObject(storage, parsed.data.quarantineKey);
      return response(
        {
          error:
            verified.kind === "retryable_failure"
              ? "Image verification is temporarily unavailable. Please try again."
              : "Uploaded image could not be verified."
        },
        verified.kind === "retryable_failure" ? 502 : 400,
        headers
      );
    }

    const { data, error } = await serviceClient.rpc(
      "finalize_community_post_image",
      {
        p_post_id: parsed.data.postId,
        p_owner_user_id: user.userId,
        p_quarantine_key: parsed.data.quarantineKey,
        p_storage_key: finalKey,
        p_content_type: verified.image.contentType,
        p_byte_size: verified.image.byteSize,
        p_width: verified.image.width,
        p_height: verified.image.height,
        p_etag: verified.image.etag
      }
    );
    const finalized = (Array.isArray(data) ? data[0] : data) as
      Record<string, unknown> | undefined;
    if (error || !finalized?.image_asset_id) {
      const concurrentResult = await readFinalizedImage(
        serviceClient,
        parsed.data.postId,
        user.userId,
        finalKey
      );
      if (concurrentResult) return response(concurrentResult, 200, headers);
      const finalCleanupWarning = await deleteObject(storage, finalKey);
      const sourceCleanupWarning = await deleteObject(
        storage,
        parsed.data.quarantineKey
      );
      console.error("Moments image metadata finalization failed.", error);
      return response(
        {
          error: "Image metadata could not be saved.",
          cleanupWarning: finalCleanupWarning || sourceCleanupWarning
        },
        500,
        headers
      );
    }

    const cleanupWarning = await deleteObject(
      storage,
      parsed.data.quarantineKey
    );
    return response(
      {
        postId: finalized.post_id,
        imageAssetId: finalized.image_asset_id,
        storageKey: finalized.storage_key,
        contentType: finalized.content_type,
        byteSize: finalized.byte_size,
        width: finalized.width,
        height: finalized.height,
        ...(cleanupWarning ? { cleanupWarning: true } : {})
      },
      200,
      headers
    );
  } catch (error) {
    console.error("Moments image finalization failed.", error);
    return response(
      { error: "Moments image finalization failed." },
      502,
      headers
    );
  }
});
