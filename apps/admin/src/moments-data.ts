import { z } from "zod";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

export const ADMIN_MOMENTS_PAGE_SIZE = 100;

export const momentViews = ["reported", "recent", "hidden"] as const;
export type MomentView = (typeof momentViews)[number];
export type MomentStatus = "draft" | "active" | "hidden" | "removed";

const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();
const nullableStringSchema = z.string().nullable();

const reportSchema = z.object({
  id: uuidSchema,
  post_id: uuidSchema,
  reason: z.enum(["spam", "harassment", "copyright", "unsafe", "other"]),
  details: nullableStringSchema,
  status: z.enum(["pending", "actioned", "dismissed"]),
  created_at: z.string(),
  resolved_at: nullableStringSchema,
  resolved_by: nullableUuidSchema
});

const postSchema = z.object({
  id: uuidSchema,
  owner_user_id: uuidSchema,
  image_asset_id: nullableUuidSchema,
  caption: z.string(),
  location_id: nullableUuidSchema,
  location_text: nullableStringSchema,
  product_id: nullableUuidSchema,
  product_text: nullableStringSchema,
  display_name: nullableStringSchema,
  status: z.enum(["draft", "active", "hidden", "removed"]),
  created_at: z.string(),
  submitted_at: nullableStringSchema,
  deleted_at: nullableStringSchema,
  moderated_at: nullableStringSchema,
  moderation_reason: nullableStringSchema
});

const imageSchema = z.object({
  id: uuidSchema,
  storage_key: z.string().min(1),
  content_type: nullableStringSchema,
  byte_size: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable()
});

const locationSchema = z.object({
  id: uuidSchema,
  display_name: z.string().min(1),
  slug: z.string().min(1)
});

const productSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1)
});

export type MomentReport = z.infer<typeof reportSchema>;

export type MomentImage = {
  id: string;
  storageKey: string;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

export type AdminMoment = {
  id: string;
  ownerUserId: string;
  image: MomentImage | null;
  caption: string;
  locationId: string | null;
  locationText: string | null;
  locationName: string | null;
  locationSlug: string | null;
  productId: string | null;
  productText: string | null;
  productName: string | null;
  productSlug: string | null;
  displayName: string | null;
  status: MomentStatus;
  createdAt: string;
  submittedAt: string | null;
  deletedAt: string | null;
  moderatedAt: string | null;
  moderationReason: string | null;
  reports: MomentReport[];
};

export class MomentsDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentsDataError";
  }
}

function getClient() {
  if (!supabase) {
    throw new MomentsDataError(
      supabaseConfigurationError ?? "The admin application is not configured."
    );
  }
  return supabase;
}

function parseRows<T>(
  value: unknown,
  schema: z.ZodType<T>,
  message: string
): T[] {
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) throw new MomentsDataError(message);
  return parsed.data;
}

async function fetchPostsByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const client = getClient();
  const result = await client
    .from("community_posts")
    .select(
      "id, owner_user_id, image_asset_id, caption, location_id, location_text, product_id, product_text, display_name, status, created_at, submitted_at, deleted_at, moderated_at, moderation_reason"
    )
    .in("id", ids);
  if (result.error) throw new MomentsDataError("Moments could not be loaded.");
  return parseRows(
    result.data,
    postSchema,
    "Moments returned an invalid response."
  );
}

async function fetchPostsForView(view: Exclude<MomentView, "reported">) {
  const client = getClient();
  let query = client
    .from("community_posts")
    .select(
      "id, owner_user_id, image_asset_id, caption, location_id, location_text, product_id, product_text, display_name, status, created_at, submitted_at, deleted_at, moderated_at, moderation_reason"
    )
    .eq("status", view === "recent" ? "active" : "hidden")
    .is("deleted_at", null)
    .not("image_asset_id", "is", null)
    .limit(ADMIN_MOMENTS_PAGE_SIZE);

  query = query.order(view === "recent" ? "submitted_at" : "moderated_at", {
    ascending: false,
    nullsFirst: false
  });
  query = query.order("id", { ascending: false });

  const result = await query;
  if (result.error) throw new MomentsDataError("Moments could not be loaded.");
  return parseRows(
    result.data,
    postSchema,
    "Moments returned an invalid response."
  );
}

async function fetchPendingReports() {
  const client = getClient();
  const result = await client
    .from("community_post_reports")
    .select(
      "id, post_id, reason, details, status, created_at, resolved_at, resolved_by",
      { count: "exact" }
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, ADMIN_MOMENTS_PAGE_SIZE - 1);
  if (result.error) throw new MomentsDataError("Reports could not be loaded.");
  return {
    reports: parseRows(
      result.data,
      reportSchema,
      "Reports returned an invalid response."
    ),
    totalCount: result.count ?? 0
  };
}

async function fetchReferences(posts: z.infer<typeof postSchema>[]) {
  const client = getClient();
  const imageIds = posts.flatMap((post) =>
    post.image_asset_id ? [post.image_asset_id] : []
  );
  const locationIds = posts.flatMap((post) =>
    post.location_id ? [post.location_id] : []
  );
  const productIds = posts.flatMap((post) =>
    post.product_id ? [post.product_id] : []
  );

  const [imagesResult, locationsResult, productsResult] = await Promise.all([
    imageIds.length
      ? client
          .from("image_assets")
          .select("id, storage_key, content_type, byte_size, width, height")
          .in("id", imageIds)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? client
          .from("locations")
          .select("id, display_name, slug")
          .in("id", locationIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? client.from("products").select("id, name, slug").in("id", productIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (imagesResult.error || locationsResult.error || productsResult.error) {
    throw new MomentsDataError("Moment references could not be loaded.");
  }

  return {
    images: new Map(
      parseRows(
        imagesResult.data,
        imageSchema,
        "Images returned an invalid response."
      ).map((image) => [image.id, image] as const)
    ),
    locations: new Map(
      parseRows(
        locationsResult.data,
        locationSchema,
        "Locations returned an invalid response."
      ).map((location) => [location.id, location] as const)
    ),
    products: new Map(
      parseRows(
        productsResult.data,
        productSchema,
        "Products returned an invalid response."
      ).map((product) => [product.id, product] as const)
    )
  };
}

function buildMoments(
  posts: z.infer<typeof postSchema>[],
  reports: MomentReport[],
  references: Awaited<ReturnType<typeof fetchReferences>>
): AdminMoment[] {
  const reportByPost = new Map<string, MomentReport[]>();
  for (const report of reports) {
    const existing = reportByPost.get(report.post_id) ?? [];
    existing.push(report);
    reportByPost.set(report.post_id, existing);
  }

  return posts.map((post) => {
    const image = post.image_asset_id
      ? references.images.get(post.image_asset_id)
      : undefined;
    const location = post.location_id
      ? references.locations.get(post.location_id)
      : undefined;
    const product = post.product_id
      ? references.products.get(post.product_id)
      : undefined;

    return {
      id: post.id,
      ownerUserId: post.owner_user_id,
      image: image
        ? {
            id: image.id,
            storageKey: image.storage_key,
            contentType: image.content_type,
            byteSize: image.byte_size,
            width: image.width,
            height: image.height
          }
        : null,
      caption: post.caption,
      locationId: post.location_id,
      locationText: post.location_text,
      locationName: location?.display_name ?? null,
      locationSlug: location?.slug ?? null,
      productId: post.product_id,
      productText: post.product_text,
      productName: product?.name ?? null,
      productSlug: product?.slug ?? null,
      displayName: post.display_name,
      status: post.status,
      createdAt: post.created_at,
      submittedAt: post.submitted_at,
      deletedAt: post.deleted_at,
      moderatedAt: post.moderated_at,
      moderationReason: post.moderation_reason,
      reports: reportByPost.get(post.id) ?? []
    };
  });
}

async function enrich(
  posts: z.infer<typeof postSchema>[],
  reports: MomentReport[]
) {
  const references = await fetchReferences(posts);
  return buildMoments(posts, reports, references);
}

export async function fetchUnresolvedReportCount() {
  const client = getClient();
  const result = await client
    .from("community_post_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (result.error) throw new MomentsDataError("Report count unavailable.");
  return result.count ?? 0;
}

export async function fetchMoments(view: MomentView) {
  if (view === "reported") {
    const { reports } = await fetchPendingReports();
    const postIds = [...new Set(reports.map((report) => report.post_id))];
    const posts = await fetchPostsByIds(postIds);
    const postsById = new Map(posts.map((post) => [post.id, post] as const));
    return enrich(
      postIds.flatMap((postId) => {
        const post = postsById.get(postId);
        return post ? [post] : [];
      }),
      reports
    );
  }

  return enrich(await fetchPostsForView(view), []);
}

export async function moderateMoment(
  postId: string,
  status: "active" | "hidden" | "removed",
  reason: string | null
) {
  const client = getClient();
  const result = await client.rpc("moderate_community_post", {
    p_post_id: postId,
    p_status: status,
    p_reason: reason
  });
  if (result.error) throw new MomentsDataError(result.error.message);
}

export async function resolveMomentReport(
  reportId: string,
  status: "actioned" | "dismissed"
) {
  const client = getClient();
  const result = await client.rpc("resolve_community_post_report", {
    p_report_id: reportId,
    p_status: status
  });
  if (result.error) throw new MomentsDataError(result.error.message);
}

export function normalizeMomentView(value: string | null): MomentView {
  return momentViews.includes(value as MomentView)
    ? (value as MomentView)
    : "reported";
}

export function groupPendingReports(reports: MomentReport[]) {
  return reports.reduce((groups, report) => {
    const existing = groups.get(report.post_id) ?? [];
    existing.push(report);
    groups.set(report.post_id, existing);
    return groups;
  }, new Map<string, MomentReport[]>());
}
