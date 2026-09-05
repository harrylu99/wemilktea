import { describe, expect, test } from "bun:test";
import {
  buildFinalKey,
  buildQuarantineKey,
  communityImageRequestSchema,
  parseOwnedQuarantineKey
} from "./storage-policy";

const userId = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";

describe("Moments upload key policy", () => {
  test("authorizes non-WebP source bytes only for server normalization", () => {
    expect(
      communityImageRequestSchema.parse({ action: "authorize", postId })
    ).toMatchObject({
      sourceContentType: "image/webp",
      normalization: "browser"
    });
    expect(
      communityImageRequestSchema.safeParse({
        action: "authorize",
        postId,
        sourceContentType: "image/jpeg",
        normalization: "browser"
      }).success
    ).toBe(false);
    expect(
      communityImageRequestSchema.safeParse({
        action: "authorize",
        postId,
        sourceContentType: "image/jpeg",
        normalization: "server"
      }).success
    ).toBe(true);
  });

  test("derives a final key only from the authenticated owner and post", () => {
    const quarantine = buildQuarantineKey(userId, postId, uploadId);
    expect(parseOwnedQuarantineKey(quarantine, userId, postId)).toBe(
      buildFinalKey(userId, postId, uploadId)
    );
  });

  test("rejects arbitrary, cross-user, and final object keys", () => {
    const quarantine = buildQuarantineKey(userId, postId, uploadId);
    expect(
      parseOwnedQuarantineKey(
        quarantine,
        userId,
        "44444444-4444-4444-8444-444444444444"
      )
    ).toBeNull();
    expect(
      parseOwnedQuarantineKey(
        quarantine,
        "44444444-4444-4444-8444-444444444444",
        postId
      )
    ).toBeNull();
    expect(
      parseOwnedQuarantineKey(
        buildFinalKey(userId, postId, uploadId),
        userId,
        postId
      )
    ).toBeNull();
    expect(
      parseOwnedQuarantineKey(
        "community/user/post/quarantine/file.webp",
        userId,
        postId
      )
    ).toBeNull();
  });
});
