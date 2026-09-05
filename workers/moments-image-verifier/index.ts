// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./worker-configuration.d.ts" />

import {
  legacyMomentsUploadTokenVersion,
  momentsUploadTokenPurpose,
  momentsUploadTokenVersion,
  verifyMomentsUploadToken,
  type MomentsUploadSourceContentType,
  type MomentsUploadTokenClaims
} from "../../supabase/functions/_shared/moments-upload-token";

type RuntimeEnv = Env & {
  VERIFY_TOKEN: string;
  MOMENTS_APP_ORIGIN: string;
  MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET: string;
};

export const maxImageBytes = 10 * 1024 * 1024;
const maxSourceDimension = 8000;
const maxSourcePixels = 40_000_000;
const maxOutputLongEdge = 2048;
const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const sourceKeyPattern = new RegExp(
  `^community-quarantine/(${uuidPattern})/(${uuidPattern})/(${uuidPattern})\\.webp$`
);

type VerificationRequest = {
  sourceKey: string;
  finalKey: string;
  expectedEtag: string;
};

type UploadBodyResult =
  { bytes: ArrayBuffer } | { status: 400 | 413; error: string };

type UploadInput = {
  sourceContentType: MomentsUploadSourceContentType;
  normalization: "browser" | "server";
};

type ImageInfo = {
  format: unknown;
  fileSize: unknown;
  width: unknown;
  height: unknown;
};

function json(
  body: Record<string, unknown>,
  status = 200,
  headers: HeadersInit = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function uploadCorsHeaders(request: Request, origin: string) {
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== origin) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "PUT, OPTIONS",
    Vary: "Origin"
  };
}

export async function readBoundedBody(
  request: Request,
  limit = maxImageBytes
): Promise<UploadBodyResult> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0)
      return { status: 400, error: "invalid_content_length" };
    if (declaredLength > limit)
      return { status: 413, error: "payload_too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { status: 400, error: "empty_upload" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (value.byteLength > limit - total) {
        await reader.cancel("payload too large").catch(() => undefined);
        return { status: 413, error: "payload_too_large" };
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { status: 400, error: "upload_read_failed" };
  }
  if (total < 1) return { status: 400, error: "empty_upload" };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: bytes.buffer };
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  );
}

async function tokensMatch(expected: string, actual: string) {
  const [expectedDigest, actualDigest] = await Promise.all([
    digest(expected),
    digest(actual)
  ]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index] ^ actualDigest[index];
  }
  return difference === 0;
}

function fourCC(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

export function inspectWebp(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  if (
    data.length < 12 ||
    fourCC(data, 0) !== "RIFF" ||
    fourCC(data, 8) !== "WEBP"
  ) {
    return { valid: false as const, reason: "invalid_webp_container" };
  }

  const view = new DataView(bytes);
  let offset = 12;
  let imageDataChunk = false;
  let hasForbiddenMetadata = false;
  while (offset + 8 <= data.length) {
    const type = fourCC(data, offset);
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size;
    if (end > data.length) {
      return { valid: false as const, reason: "invalid_webp_chunk" };
    }
    if (["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"].includes(type)) {
      imageDataChunk ||= type === "VP8 " || type === "VP8L";
    } else if (["EXIF", "XMP ", "GPS ", "ANIM", "ANMF"].includes(type)) {
      hasForbiddenMetadata = true;
    } else {
      return { valid: false as const, reason: "unsupported_webp_chunk" };
    }
    if (type === "VP8X" && size >= 10) {
      const flags = data[offset + 8];
      if ((flags & 0xc1) !== 0 || (flags & 0x0e) !== 0) {
        return { valid: false as const, reason: "forbidden_webp_metadata" };
      }
    }
    offset = end + (size % 2);
  }
  if (offset !== data.length || !imageDataChunk || hasForbiddenMetadata) {
    return { valid: false as const, reason: "forbidden_webp_metadata" };
  }
  return { valid: true as const };
}

function requestContentType(request: Request) {
  return request.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function uploadInput(claims: MomentsUploadTokenClaims): UploadInput | null {
  if (claims.v === legacyMomentsUploadTokenVersion)
    return { sourceContentType: "image/webp", normalization: "browser" };
  if (claims.v !== momentsUploadTokenVersion) return null;
  if (
    claims.normalization === "browser" &&
    claims.sourceContentType !== "image/webp"
  )
    return null;
  return {
    sourceContentType: claims.sourceContentType,
    normalization: claims.normalization
  };
}

function hasExpectedSourceContainer(
  bytes: ArrayBuffer,
  contentType: MomentsUploadSourceContentType
) {
  const data = new Uint8Array(bytes);
  if (contentType === "image/jpeg")
    return (
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff
    );
  if (contentType === "image/png")
    return (
      data.length >= 8 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47 &&
      data[4] === 0x0d &&
      data[5] === 0x0a &&
      data[6] === 0x1a &&
      data[7] === 0x0a
    );
  return (
    data.length >= 12 &&
    fourCC(data, 0) === "RIFF" &&
    fourCC(data, 8) === "WEBP"
  );
}

function matchesSourceContentType(
  format: unknown,
  contentType: MomentsUploadSourceContentType
) {
  const normalizedFormat = String(format).toLowerCase();
  return (
    (contentType === "image/jpeg" &&
      (normalizedFormat === "jpeg" ||
        normalizedFormat === "jpg" ||
        normalizedFormat === "image/jpeg")) ||
    (contentType === "image/png" &&
      (normalizedFormat === "png" || normalizedFormat === "image/png")) ||
    (contentType === "image/webp" &&
      (normalizedFormat === "webp" || normalizedFormat === "image/webp"))
  );
}

function hasSafeImageInfo(
  info: ImageInfo,
  byteLength: number,
  maxLongEdge = maxSourceDimension
) {
  const width = Number(info.width);
  const height = Number(info.height);
  const fileSize = Number(info.fileSize);
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= maxSourceDimension &&
    height <= maxSourceDimension &&
    width * height <= maxSourcePixels &&
    Math.max(width, height) <= maxLongEdge &&
    (!Number.isFinite(fileSize) || fileSize === byteLength)
  );
}

async function normalizeFallbackSource(
  bytes: ArrayBuffer,
  sourceContentType: MomentsUploadSourceContentType,
  images: RuntimeEnv["IMAGES"]
) {
  let sourceInfo: ImageInfo;
  try {
    sourceInfo = await images.info(new Response(bytes).body!);
  } catch {
    return null;
  }
  if (
    !matchesSourceContentType(sourceInfo.format, sourceContentType) ||
    !hasSafeImageInfo(sourceInfo, bytes.byteLength)
  )
    return null;

  let response: Response;
  try {
    response = await (
      await images
        .input(new Response(bytes).body!)
        .transform({
          width: maxOutputLongEdge,
          height: maxOutputLongEdge,
          fit: "scale-down"
        })
        .output({ format: "image/webp", quality: 85, anim: false })
    ).response();
  } catch {
    return null;
  }
  if (!response.ok || requestContentType(response) !== "image/webp")
    return null;

  let normalizedBytes: ArrayBuffer;
  try {
    normalizedBytes = await response.arrayBuffer();
  } catch {
    return null;
  }
  if (
    normalizedBytes.byteLength < 1 ||
    normalizedBytes.byteLength > maxImageBytes ||
    !inspectWebp(normalizedBytes).valid
  )
    return null;

  let normalizedInfo: ImageInfo;
  try {
    normalizedInfo = await images.info(new Response(normalizedBytes).body!);
  } catch {
    return null;
  }
  if (
    !matchesSourceContentType(normalizedInfo.format, "image/webp") ||
    !hasSafeImageInfo(
      normalizedInfo,
      normalizedBytes.byteLength,
      maxOutputLongEdge
    )
  )
    return null;
  return normalizedBytes;
}

export default {
  async fetch(request, env: RuntimeEnv) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/upload") {
      const headers = uploadCorsHeaders(request, env.MOMENTS_APP_ORIGIN);
      if (!headers) return json({ error: "origin_not_allowed" }, 403);
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      if (request.method !== "PUT")
        return json({ error: "method_not_allowed" }, 405);

      const authorization = request.headers.get("Authorization") ?? "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
      const claims = token
        ? await verifyMomentsUploadToken(
            token,
            env.MOMENTS_IMAGE_UPLOAD_TOKEN_SECRET
          )
        : null;
      if (
        !claims ||
        claims.purpose !== momentsUploadTokenPurpose ||
        (claims.v !== legacyMomentsUploadTokenVersion &&
          claims.v !== momentsUploadTokenVersion)
      )
        return json({ error: "unauthorized" }, 401, headers);
      const input = uploadInput(claims);
      if (!input) return json({ error: "invalid_upload_mode" }, 400, headers);

      const match = sourceKeyPattern.exec(claims.quarantineKey);
      if (
        !match ||
        claims.ownerUserId !== match[1] ||
        claims.postId !== match[2] ||
        claims.uploadId !== match[3]
      )
        return json({ error: "invalid_upload_key" }, 400, headers);
      if (requestContentType(request) !== input.sourceContentType)
        return json({ error: "normalized_webp_required" }, 415, headers);

      const body = await readBoundedBody(request);
      if ("error" in body)
        return json({ error: body.error }, body.status, headers);
      let normalizedBytes = body.bytes;
      let object: R2Object | null;
      if (input.normalization === "browser") {
        const webp = inspectWebp(body.bytes);
        if (!webp.valid) return json({ error: webp.reason }, 400, headers);
        object = await env.BUCKET.put(claims.quarantineKey, normalizedBytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "image/webp" },
          customMetadata: {
            purpose: momentsUploadTokenPurpose,
            uploadId: claims.uploadId
          }
        });
      } else {
        if (!hasExpectedSourceContainer(body.bytes, input.sourceContentType))
          return json({ error: "invalid_source_container" }, 400, headers);

        const reservation = await env.BUCKET.put(
          claims.quarantineKey,
          new Uint8Array(),
          {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType: "application/octet-stream" },
            customMetadata: {
              purpose: momentsUploadTokenPurpose,
              uploadId: claims.uploadId
            }
          }
        );
        if (!reservation)
          return json({ error: "upload_already_exists" }, 409, headers);

        const transformed = await normalizeFallbackSource(
          body.bytes,
          input.sourceContentType,
          env.IMAGES
        );
        if (!transformed) {
          await env.BUCKET.delete(claims.quarantineKey);
          return json({ error: "source_normalization_failed" }, 400, headers);
        }
        normalizedBytes = transformed;

        object = await env.BUCKET.put(claims.quarantineKey, normalizedBytes, {
          onlyIf: { etagMatches: reservation.etag },
          httpMetadata: { contentType: "image/webp" },
          customMetadata: {
            purpose: momentsUploadTokenPurpose,
            uploadId: claims.uploadId
          }
        });
      }
      if (!object)
        return json({ error: "upload_already_exists" }, 409, headers);
      return json(
        {
          uploadId: claims.uploadId,
          quarantineKey: claims.quarantineKey,
          etag: object.etag,
          byteSize: normalizedBytes.byteLength
        },
        200,
        headers
      );
    }

    if (request.method !== "POST" || pathname !== "/verify")
      return json({ error: "not_found" }, 404);

    const authorization = request.headers.get("Authorization") ?? "";
    if (
      !authorization.startsWith("Bearer ") ||
      !(await tokensMatch(env.VERIFY_TOKEN, authorization.slice(7)))
    ) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = (await request
      .json()
      .catch(() => null)) as Partial<VerificationRequest> | null;
    if (
      !body ||
      typeof body.sourceKey !== "string" ||
      typeof body.finalKey !== "string" ||
      typeof body.expectedEtag !== "string" ||
      body.expectedEtag.length < 1 ||
      body.expectedEtag.length > 200
    ) {
      return json({ error: "invalid_request" }, 400);
    }

    const match = sourceKeyPattern.exec(body.sourceKey);
    if (!match) return json({ error: "invalid_source_key" }, 400);
    const [, ownerId, postId, uploadId] = match;
    const finalKey = `community/${ownerId}/${postId}/${uploadId}.webp`;
    if (body.finalKey !== finalKey)
      return json({ error: "invalid_final_key" }, 400);

    const source = await env.BUCKET.get(body.sourceKey, {
      onlyIf: { etagMatches: body.expectedEtag.replaceAll('"', "") }
    });
    if (!source) return json({ error: "source_not_found" }, 404);
    if (!("body" in source)) return json({ error: "source_changed" }, 412);
    if (source.size < 1 || source.size > maxImageBytes) {
      return json({ error: "image_too_large" }, 400);
    }

    const bytes = await source.arrayBuffer();
    const webp = inspectWebp(bytes);
    if (!webp.valid) return json({ error: webp.reason }, 400);

    let info;
    try {
      info = await env.IMAGES.info(new Response(bytes).body!);
    } catch {
      return json({ error: "image_decode_failed" }, 400);
    }
    const format = String(info.format).toLowerCase();
    const width = Number(info.width);
    const height = Number(info.height);
    const fileSize = Number(info.fileSize);
    if (format !== "webp" && format !== "image/webp") {
      return json({ error: "normalized_webp_required" }, 400);
    }
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > maxSourceDimension ||
      height > maxSourceDimension ||
      width * height > maxSourcePixels ||
      Math.max(width, height) > maxOutputLongEdge ||
      (Number.isFinite(fileSize) && fileSize !== bytes.byteLength)
    ) {
      return json({ error: "invalid_image_dimensions" }, 400);
    }

    const existingFinal = await env.BUCKET.head(finalKey);
    if (existingFinal) {
      if (
        existingFinal.customMetadata?.sourceEtag === source.etag &&
        existingFinal.size === bytes.byteLength &&
        existingFinal.httpMetadata?.contentType === "image/webp"
      ) {
        return json({
          sourceKey: body.sourceKey,
          finalKey,
          sourceEtag: source.etag,
          finalEtag: existingFinal.etag,
          contentType: "image/webp",
          byteSize: bytes.byteLength,
          width,
          height
        });
      }
      return json({ error: "final_object_exists" }, 409);
    }
    const finalObject = await env.BUCKET.put(finalKey, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: { sourceEtag: source.etag }
    });
    if (!finalObject) return json({ error: "final_object_exists" }, 409);

    return json({
      sourceKey: body.sourceKey,
      finalKey,
      sourceEtag: source.etag,
      finalEtag: finalObject.etag,
      contentType: "image/webp",
      byteSize: bytes.byteLength,
      width,
      height
    });
  }
};
