import { z } from "zod";
import {
  adminCorsHeaders,
  jsonResponse,
  requireAdmin
} from "../_shared/admin-auth.ts";
import {
  buildImageStorageKey,
  imageStorageRequestSchema,
  isImageStorageKeyForEntity,
  maxImageBytes
} from "./storage-policy.ts";
import { createR2Storage, type R2Storage } from "./storage.ts";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url(),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url()
});

const uploadExpirySeconds = 10 * 60;

function isExpectedContentType(storageKey: string, contentType: string) {
  return (
    (contentType === "image/jpeg" && /\.(jpg|jpeg)$/.test(storageKey)) ||
    (contentType === "image/png" && storageKey.endsWith(".png")) ||
    (contentType === "image/webp" && storageKey.endsWith(".webp"))
  );
}

async function cleanupObject(storage: R2Storage, key: string | null) {
  if (!key) return false;
  try {
    await storage.deleteObject(key);
    return false;
  } catch (error) {
    console.error("R2 object cleanup failed.", error);
    return true;
  }
}

Deno.serve(async (request) => {
  const environment = environmentSchema.safeParse({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    ADMIN_APP_ORIGIN: Deno.env.get("ADMIN_APP_ORIGIN"),
    R2_ACCOUNT_ID: Deno.env.get("R2_ACCOUNT_ID"),
    R2_ACCESS_KEY_ID: Deno.env.get("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: Deno.env.get("R2_SECRET_ACCESS_KEY"),
    R2_BUCKET: Deno.env.get("R2_BUCKET"),
    R2_PUBLIC_BASE_URL: Deno.env.get("R2_PUBLIC_BASE_URL")
  });

  if (!environment.success) {
    console.error("Image storage function is missing required configuration.");
    return jsonResponse({ error: "Image storage is not configured." }, 500);
  }

  const headers = adminCorsHeaders(request, environment.data.ADMIN_APP_ORIGIN);
  if (!headers) return jsonResponse({ error: "Origin is not allowed." }, 403);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, headers);
  }

  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json().catch(() => null)
    : null;
  const parsedRequest = imageStorageRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return jsonResponse({ error: "Invalid image request." }, 400, headers);
  }

  const admin = await requireAdmin(
    request,
    {
      supabaseUrl: environment.data.SUPABASE_URL,
      supabaseAnonKey: environment.data.SUPABASE_ANON_KEY
    },
    headers
  );
  if (admin instanceof Response) return admin;

  const storage = createR2Storage({
    accountId: environment.data.R2_ACCOUNT_ID,
    accessKeyId: environment.data.R2_ACCESS_KEY_ID,
    secretAccessKey: environment.data.R2_SECRET_ACCESS_KEY,
    bucket: environment.data.R2_BUCKET
  });

  try {
    if (parsedRequest.data.action === "authorize") {
      const storageKey = buildImageStorageKey(
        parsedRequest.data.entityType,
        parsedRequest.data.entityId,
        parsedRequest.data.contentType
      );
      const uploadUrl = await storage.createPutUrl({
        key: storageKey,
        contentType: parsedRequest.data.contentType,
        expiresIn: uploadExpirySeconds
      });

      return jsonResponse(
        {
          uploadUrl,
          storageKey,
          contentType: parsedRequest.data.contentType,
          expiresIn: uploadExpirySeconds,
          maxBytes: maxImageBytes
        },
        200,
        headers
      );
    }

    if (
      !isImageStorageKeyForEntity(
        parsedRequest.data.storageKey,
        parsedRequest.data.entityType,
        parsedRequest.data.entityId
      )
    ) {
      return jsonResponse({ error: "Invalid image reference." }, 400, headers);
    }

    if (parsedRequest.data.action === "confirm") {
      if (
        !isExpectedContentType(
          parsedRequest.data.storageKey,
          parsedRequest.data.contentType
        )
      ) {
        return jsonResponse(
          { error: "Image type does not match its object." },
          400,
          headers
        );
      }

      const object = await storage.headObject(parsedRequest.data.storageKey);
      if (
        object.contentType !== parsedRequest.data.contentType ||
        object.contentLength === null ||
        object.contentLength < 1 ||
        object.contentLength > maxImageBytes
      ) {
        await cleanupObject(storage, parsedRequest.data.storageKey);
        return jsonResponse(
          { error: "Uploaded image could not be verified." },
          400,
          headers
        );
      }

      const rpcName =
        parsedRequest.data.entityType === "product"
          ? "attach_product_image"
          : "attach_location_image";
      const rpcArgs =
        parsedRequest.data.entityType === "product"
          ? {
              p_product_id: parsedRequest.data.entityId,
              p_storage_key: parsedRequest.data.storageKey,
              p_provenance: "wemilktea",
              p_alt_text: parsedRequest.data.altText ?? null,
              p_content_type: object.contentType,
              p_byte_size: object.contentLength,
              p_width: parsedRequest.data.width ?? null,
              p_height: parsedRequest.data.height ?? null
            }
          : {
              p_location_id: parsedRequest.data.entityId,
              p_storage_key: parsedRequest.data.storageKey,
              p_provenance: "wemilktea",
              p_alt_text: parsedRequest.data.altText ?? null,
              p_content_type: object.contentType,
              p_byte_size: object.contentLength,
              p_width: parsedRequest.data.width ?? null,
              p_height: parsedRequest.data.height ?? null
            };
      const { data, error } = await admin.client.rpc(rpcName, rpcArgs);

      if (error || !Array.isArray(data) || !data[0]?.image_id) {
        await cleanupObject(storage, parsedRequest.data.storageKey);
        console.error("Image metadata attachment failed.", error);
        return jsonResponse(
          { error: "Image metadata could not be saved." },
          500,
          headers
        );
      }

      const cleanupWarning = await cleanupObject(
        storage,
        typeof data[0].previous_storage_key === "string"
          ? data[0].previous_storage_key
          : null
      );
      return jsonResponse(
        { ok: true, imageId: data[0].image_id, cleanupWarning },
        200,
        headers
      );
    }

    const rpcName =
      parsedRequest.data.entityType === "product"
        ? "remove_product_image"
        : "remove_location_image";
    const rpcArgs =
      parsedRequest.data.entityType === "product"
        ? { p_product_id: parsedRequest.data.entityId }
        : { p_location_id: parsedRequest.data.entityId };
    const { data, error } = await admin.client.rpc(rpcName, rpcArgs);
    if (error) {
      console.error("Image metadata removal failed.", error);
      return jsonResponse(
        { error: "Image could not be removed." },
        500,
        headers
      );
    }

    const previousKey = typeof data === "string" ? data : null;
    const cleanupWarning = await cleanupObject(storage, previousKey);
    return jsonResponse({ ok: true, cleanupWarning }, 200, headers);
  } catch (error) {
    console.error("Image storage operation failed.", error);
    return jsonResponse(
      { error: "Image storage operation failed." },
      502,
      headers
    );
  }
});
