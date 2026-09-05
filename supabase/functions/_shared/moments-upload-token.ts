export const momentsUploadTokenPurpose = "moments-image-upload" as const;
export const legacyMomentsUploadTokenVersion = 1 as const;
export const momentsUploadTokenVersion = 2 as const;

export const momentsUploadSourceContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export const momentsUploadNormalizations = ["browser", "server"] as const;

export type MomentsUploadSourceContentType =
  (typeof momentsUploadSourceContentTypes)[number];
export type MomentsUploadNormalization =
  (typeof momentsUploadNormalizations)[number];

type MomentsUploadTokenBase = {
  purpose: typeof momentsUploadTokenPurpose;
  ownerUserId: string;
  postId: string;
  uploadId: string;
  quarantineKey: string;
  expiresAt: number;
};

export type LegacyMomentsUploadTokenClaims = MomentsUploadTokenBase & {
  v: typeof legacyMomentsUploadTokenVersion;
};

export type CurrentMomentsUploadTokenClaims = MomentsUploadTokenBase & {
  v: typeof momentsUploadTokenVersion;
  sourceContentType: MomentsUploadSourceContentType;
  normalization: MomentsUploadNormalization;
};

export type MomentsUploadTokenClaims =
  LegacyMomentsUploadTokenClaims | CurrentMomentsUploadTokenClaims;

export type MomentsUploadTokenAuthorizationInput = MomentsUploadTokenBase & {
  sourceContentType: MomentsUploadSourceContentType;
  normalization: MomentsUploadNormalization;
};

export function createMomentsUploadTokenAuthorizationClaims(
  input: MomentsUploadTokenAuthorizationInput
): MomentsUploadTokenClaims {
  if (input.normalization === "browser") {
    if (input.sourceContentType !== "image/webp")
      throw new Error("Browser normalization must upload WebP.");
    return {
      v: legacyMomentsUploadTokenVersion,
      purpose: input.purpose,
      ownerUserId: input.ownerUserId,
      postId: input.postId,
      uploadId: input.uploadId,
      quarantineKey: input.quarantineKey,
      expiresAt: input.expiresAt
    };
  }
  return { v: momentsUploadTokenVersion, ...input };
}

function encode(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decode(value: string) {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createMomentsUploadToken(
  claims: MomentsUploadTokenClaims,
  secret: string
) {
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${encode(await signature(secret, payload))}`;
}

export async function verifyMomentsUploadToken(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000)
) {
  const [payload, encodedSignature, ...extra] = token.split(".");
  if (!payload || !encodedSignature || extra.length > 0) return null;
  const actualSignature = decode(encodedSignature);
  if (
    !actualSignature ||
    !equalBytes(actualSignature, await signature(secret, payload))
  )
    return null;
  const encodedPayload = decode(payload);
  if (!encodedPayload) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(encodedPayload)) as
      | Partial<LegacyMomentsUploadTokenClaims>
      | Partial<CurrentMomentsUploadTokenClaims>;
    if (
      (claims.v !== legacyMomentsUploadTokenVersion &&
        claims.v !== momentsUploadTokenVersion) ||
      claims.purpose !== momentsUploadTokenPurpose ||
      typeof claims.ownerUserId !== "string" ||
      typeof claims.postId !== "string" ||
      typeof claims.uploadId !== "string" ||
      typeof claims.quarantineKey !== "string" ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= now
    )
      return null;
    if (claims.v === legacyMomentsUploadTokenVersion)
      return claims as LegacyMomentsUploadTokenClaims;
    if (
      !momentsUploadSourceContentTypes.includes(
        claims.sourceContentType as MomentsUploadSourceContentType
      ) ||
      !momentsUploadNormalizations.includes(
        claims.normalization as MomentsUploadNormalization
      )
    )
      return null;
    return claims as CurrentMomentsUploadTokenClaims;
  } catch {
    return null;
  }
}
