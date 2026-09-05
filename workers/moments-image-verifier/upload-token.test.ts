import { describe, expect, test } from "bun:test";
import {
  createMomentsUploadTokenAuthorizationClaims,
  createMomentsUploadToken,
  legacyMomentsUploadTokenVersion,
  momentsUploadTokenVersion,
  verifyMomentsUploadToken
} from "../../supabase/functions/_shared/moments-upload-token";

const secret = "token-test-secret";
const authorizationInput = {
  purpose: "moments-image-upload" as const,
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  postId: "22222222-2222-4222-8222-222222222222",
  uploadId: "33333333-3333-4333-8333-333333333333",
  quarantineKey:
    "community-quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
  sourceContentType: "image/webp" as const,
  normalization: "browser" as const,
  expiresAt: 2_000_000_000
};
const claims = { v: momentsUploadTokenVersion, ...authorizationInput };

describe("Moments upload capability", () => {
  test("round-trips only with the signing secret and before expiry", async () => {
    const token = await createMomentsUploadToken(claims, secret);
    expect(
      await verifyMomentsUploadToken(token, secret, 1_999_999_999)
    ).toEqual(claims);
    expect(await verifyMomentsUploadToken(token, "wrong-secret")).toBeNull();
    expect(
      await verifyMomentsUploadToken(token, secret, claims.expiresAt)
    ).toBeNull();
  });

  test("rejects tampered claims and signatures", async () => {
    const token = await createMomentsUploadToken(claims, secret);
    const [payload, signature] = token.split(".");
    const modifiedPayload = btoa(
      JSON.stringify({
        ...claims,
        postId: "44444444-4444-4444-8444-444444444444"
      })
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(
      await verifyMomentsUploadToken(`${modifiedPayload}.${signature}`, secret)
    ).toBeNull();
    expect(
      await verifyMomentsUploadToken(
        `${payload}.${signature.slice(0, -1)}x`,
        secret
      )
    ).toBeNull();
  });

  test("keeps an already-issued v1 WebP capability on the strict browser path", async () => {
    const legacyClaims = {
      v: legacyMomentsUploadTokenVersion,
      purpose: "moments-image-upload" as const,
      ownerUserId: claims.ownerUserId,
      postId: claims.postId,
      uploadId: claims.uploadId,
      quarantineKey: claims.quarantineKey,
      expiresAt: claims.expiresAt
    };
    const token = await createMomentsUploadToken(legacyClaims, secret);

    expect(
      await verifyMomentsUploadToken(token, secret, 1_999_999_999)
    ).toEqual(legacyClaims);
  });

  test("mints a v1 capability for browser-normalized WebP authorization", async () => {
    const issuedClaims =
      createMomentsUploadTokenAuthorizationClaims(authorizationInput);
    const token = await createMomentsUploadToken(issuedClaims, secret);

    expect(issuedClaims).toEqual({
      v: legacyMomentsUploadTokenVersion,
      purpose: authorizationInput.purpose,
      ownerUserId: authorizationInput.ownerUserId,
      postId: authorizationInput.postId,
      uploadId: authorizationInput.uploadId,
      quarantineKey: authorizationInput.quarantineKey,
      expiresAt: authorizationInput.expiresAt
    });
    expect(
      await verifyMomentsUploadToken(token, secret, 1_999_999_999)
    ).toEqual(issuedClaims);
  });

  test("mints a v2 capability with source and mode for server normalization", async () => {
    const issuedClaims = createMomentsUploadTokenAuthorizationClaims({
      ...authorizationInput,
      sourceContentType: "image/jpeg",
      normalization: "server"
    });
    const token = await createMomentsUploadToken(issuedClaims, secret);

    expect(issuedClaims).toEqual({
      ...authorizationInput,
      v: momentsUploadTokenVersion,
      sourceContentType: "image/jpeg",
      normalization: "server"
    });
    expect(
      await verifyMomentsUploadToken(token, secret, 1_999_999_999)
    ).toEqual(issuedClaims);
  });

  test("rejects invalid token versions, source types, and normalizations", async () => {
    const invalidClaims = [
      { ...claims, v: 3 },
      { ...claims, sourceContentType: "image/gif" },
      { ...claims, normalization: "client" }
    ];

    for (const invalid of invalidClaims) {
      const token = await createMomentsUploadToken(
        invalid as unknown as typeof claims,
        secret
      );
      expect(
        await verifyMomentsUploadToken(token, secret, 1_999_999_999)
      ).toBeNull();
    }
    expect(() =>
      createMomentsUploadTokenAuthorizationClaims({
        ...authorizationInput,
        sourceContentType: "image/jpeg"
      })
    ).toThrow("Browser normalization must upload WebP.");
  });
});
