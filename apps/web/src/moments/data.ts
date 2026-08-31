import { publicImageUrl } from "@wemilktea/config";
import { z } from "zod";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

export const MOMENTS_PAGE_SIZE = 20;

const uuidSchema = z.string().uuid();
const momentCursorRowSchema = z.object({
  id: uuidSchema,
  submitted_at: z.string().min(1)
});

const publicMomentRowSchema = z.object({
  id: uuidSchema,
  image_asset_id: uuidSchema,
  storage_key: z.string().min(1),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  caption: z.string(),
  display_name: z.string().nullable(),
  location_id: uuidSchema.nullable(),
  location_text: z.string().nullable(),
  location_name: z.string().nullable(),
  location_slug: z.string().nullable(),
  product_id: uuidSchema.nullable(),
  product_text: z.string().nullable(),
  product_name: z.string().nullable(),
  product_slug: z.string().nullable(),
  product_brand_slug: z.string().nullable().optional(),
  created_at: z.string().min(1),
  submitted_at: z.string().min(1),
  like_count: z.coerce.number().int().nonnegative(),
  liked_by_me: z.boolean(),
  must_try_by_me: z.boolean()
});

const r2PublicBaseUrl =
  typeof import.meta.env.VITE_R2_PUBLIC_BASE_URL === "string"
    ? import.meta.env.VITE_R2_PUBLIC_BASE_URL
    : "";

export type MomentsCursor = {
  submittedAt: string;
  id: string;
};

export type PublicMoment = {
  id: string;
  imageAssetId: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  caption: string;
  displayName: string | null;
  location: {
    id: string | null;
    name: string | null;
    slug: string | null;
    text: string | null;
  };
  product: {
    id: string | null;
    name: string | null;
    slug: string | null;
    brandSlug: string | null;
    text: string | null;
  };
  createdAt: string;
  submittedAt: string;
  likeCount: number;
  likedByMe: boolean;
  mustTryByMe: boolean;
};

export type MomentsPageResult =
  | {
      data: PublicMoment[];
      nextCursor: MomentsCursor | null;
      hasMore: boolean;
      error: null;
    }
  | {
      data: null;
      nextCursor: null;
      hasMore: false;
      error: string;
    };

export function normalizePublicMoment(
  value: unknown,
  imageBaseUrl = r2PublicBaseUrl
): PublicMoment | null {
  const parsed = publicMomentRowSchema.safeParse(value);
  if (!parsed.success) return null;

  return {
    id: parsed.data.id,
    imageAssetId: parsed.data.image_asset_id,
    imageUrl: publicImageUrl(imageBaseUrl, parsed.data.storage_key),
    width: parsed.data.width,
    height: parsed.data.height,
    caption: parsed.data.caption,
    displayName: parsed.data.display_name,
    location: {
      id: parsed.data.location_id,
      name: parsed.data.location_name,
      slug: parsed.data.location_slug,
      text: parsed.data.location_text
    },
    product: {
      id: parsed.data.product_id,
      name: parsed.data.product_name,
      slug: parsed.data.product_slug,
      brandSlug: parsed.data.product_brand_slug ?? null,
      text: parsed.data.product_text
    },
    createdAt: parsed.data.created_at,
    submittedAt: parsed.data.submitted_at,
    likeCount: parsed.data.like_count,
    likedByMe: parsed.data.liked_by_me,
    mustTryByMe: parsed.data.must_try_by_me
  };
}

export async function loadPublicMomentsPage(
  cursor: MomentsCursor | null = null,
  client = supabase
): Promise<MomentsPageResult> {
  if (!client) {
    return {
      data: null,
      nextCursor: null,
      hasMore: false,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const { data, error } = await client.rpc("list_public_community_posts", {
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: MOMENTS_PAGE_SIZE + 1
  });
  if (error) {
    return {
      data: null,
      nextCursor: null,
      hasMore: false,
      error: "query_failed"
    };
  }

  const rawRows = z.array(z.unknown()).safeParse(data);
  if (!rawRows.success) {
    return {
      data: null,
      nextCursor: null,
      hasMore: false,
      error: "invalid_data"
    };
  }

  const consumedRows = rawRows.data.slice(0, MOMENTS_PAGE_SIZE + 1);
  const hasLookAhead = consumedRows.length > MOMENTS_PAGE_SIZE;
  const pageRows = consumedRows.slice(0, MOMENTS_PAGE_SIZE);
  const moments = pageRows
    .map((row) => normalizePublicMoment(row))
    .filter((moment): moment is PublicMoment => moment !== null);
  const cursorRow = momentCursorRowSchema.safeParse(pageRows.at(-1));

  if (hasLookAhead && !cursorRow.success) {
    return {
      data: null,
      nextCursor: null,
      hasMore: false,
      error: "invalid_data"
    };
  }

  return {
    data: moments,
    nextCursor: cursorRow.success
      ? {
          submittedAt: cursorRow.data.submitted_at,
          id: cursorRow.data.id
        }
      : null,
    hasMore: cursorRow.success && hasLookAhead,
    error: null
  };
}

export async function loadOwnMomentIds(
  client = supabase
): Promise<Set<string>> {
  if (!client) return new Set();

  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();
  if (userError || !user) return new Set();

  const { data, error } = await client
    .from("community_posts")
    .select("id")
    .eq("owner_user_id", user.id);
  if (error || !Array.isArray(data)) return new Set();

  return new Set(
    data.flatMap((row) => {
      const parsed = uuidSchema.safeParse(row.id);
      return parsed.success ? [parsed.data] : [];
    })
  );
}

export const momentReportReasons = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["copyright", "Copyright"],
  ["unsafe", "Unsafe content"],
  ["other", "Other"]
] as const;

export type MomentReportReason = (typeof momentReportReasons)[number][0];
