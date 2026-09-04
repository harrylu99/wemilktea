import { z } from "zod";
import {
  momentsUploadNormalizations,
  momentsUploadSourceContentTypes
} from "../_shared/moments-upload-token.ts";

export const communityImageRequestSchema = z
  .discriminatedUnion("action", [
    z.object({
      action: z.literal("authorize"),
      postId: z.string().uuid(),
      sourceContentType: z
        .enum(momentsUploadSourceContentTypes)
        .default("image/webp"),
      normalization: z.enum(momentsUploadNormalizations).default("browser")
    }),
    z.object({
      action: z.literal("finalize"),
      postId: z.string().uuid(),
      quarantineKey: z.string().min(1).max(300)
    })
  ])
  .superRefine((request, context) => {
    if (
      request.action === "authorize" &&
      request.normalization === "browser" &&
      request.sourceContentType !== "image/webp"
    ) {
      context.addIssue({
        code: "custom",
        message: "Browser normalization must upload WebP."
      });
    }
  });

const uuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export function buildQuarantineKey(
  userId: string,
  postId: string,
  uploadId: string
) {
  return `community-quarantine/${userId}/${postId}/${uploadId}.webp`;
}

export function buildFinalKey(
  userId: string,
  postId: string,
  uploadId: string
) {
  return `community/${userId}/${postId}/${uploadId}.webp`;
}

export function parseOwnedQuarantineKey(
  key: string,
  userId: string,
  postId: string
) {
  const match = new RegExp(
    `^community-quarantine/${userId}/${postId}/(${uuid})\\.webp$`
  ).exec(key);
  return match ? buildFinalKey(userId, postId, match[1]) : null;
}
