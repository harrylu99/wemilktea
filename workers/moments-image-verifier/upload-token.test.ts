import { describe, expect, test } from "bun:test";
import {
  createMomentsUploadToken,
  verifyMomentsUploadToken
} from "../../supabase/functions/_shared/moments-upload-token";

const secret = "token-test-secret";
const claims = {
  v: 1 as const,
  purpose: "moments-image-upload" as const,
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  postId: "22222222-2222-4222-8222-222222222222",
  uploadId: "33333333-3333-4333-8333-333333333333",
  quarantineKey:
    "community-quarantine/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
  expiresAt: 2_000_000_000
};

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
});
