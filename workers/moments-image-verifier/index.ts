// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./worker-configuration.d.ts" />

type RuntimeEnv = Env & { VERIFY_TOKEN: string };

const maxImageBytes = 10 * 1024 * 1024;
const maxSourceDimension = 8000;
const maxSourcePixels = 40_000_000;
const maxOutputLongEdge = 2048;
const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const sourceKeyPattern = new RegExp(
  `^community/(${uuidPattern})/(${uuidPattern})/quarantine/(${uuidPattern})\\.webp$`
);

type VerificationRequest = {
  sourceKey: string;
  finalKey: string;
  expectedEtag: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
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
      if ((flags & 0xc1) !== 0 || (flags & 0x38) !== 0) {
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

export default {
  async fetch(request, env: RuntimeEnv) {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/verify"
    ) {
      return json({ error: "not_found" }, 404);
    }

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
