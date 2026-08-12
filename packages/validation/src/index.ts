import type { StoreSuggestion } from "@wemilktea/domain";
import { z } from "zod";

export const browserEnvironmentSchema = z
  .object({
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_ANON_KEY: z.string().min(1).optional()
  })
  .refine(
    ({ VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY }) =>
      Boolean(VITE_SUPABASE_URL) === Boolean(VITE_SUPABASE_ANON_KEY),
    {
      message:
        "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set together"
    }
  );

export type BrowserEnvironment = z.infer<typeof browserEnvironmentSchema>;

export const storeDiscoveryResultSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["succeeded", "failed"]),
  queryCount: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative(),
  newCandidateCount: z.number().int().nonnegative(),
  knownCount: z.number().int().nonnegative(),
  possibleDuplicateCount: z.number().int().nonnegative(),
  errorSummary: z.string().nullable()
});

export type StoreDiscoveryResult = z.infer<typeof storeDiscoveryResultSchema>;

const uuidSchema = z.string().uuid();
const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const storeCandidateStatusSchema = z.enum([
  "new",
  "known",
  "possible_duplicate",
  "approved",
  "rejected"
]);

export const storeCandidateSummarySchema = z.object({
  id: uuidSchema,
  google_place_id: z.string().min(1),
  status: storeCandidateStatusSchema,
  source_provenance: z.string().min(1),
  first_seen_at: z.string().datetime(),
  last_seen_at: z.string().datetime(),
  reviewed_at: z.string().datetime().nullable(),
  possible_location_id: uuidSchema.nullable(),
  resolved_location_id: uuidSchema.nullable(),
  rejection_reason: z.string().nullable()
});

export type StoreCandidateSummary = z.infer<typeof storeCandidateSummarySchema>;

export const brandOptionSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: slugSchema
});

export type BrandOption = z.infer<typeof brandOptionSchema>;

export const locationOptionSchema = z.object({
  id: uuidSchema,
  display_name: z.string().min(1),
  slug: slugSchema,
  suburb: z.string().min(1),
  publication_status: z.enum(["draft", "published", "archived"]),
  google_place_id: z.string().nullable()
});

export type LocationOption = z.infer<typeof locationOptionSchema>;

export const canonicalLocationInputSchema = z.object({
  displayName: z.string().trim().min(1),
  slug: slugSchema,
  suburb: z.string().trim().min(1),
  address: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sourceReference: z.string().url().optional()
});

export const approveStoreCandidateSchema = z.object({
  candidateId: uuidSchema,
  brand: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), brandId: uuidSchema }),
    z.object({
      mode: z.literal("new"),
      name: z.string().trim().min(1),
      slug: slugSchema
    })
  ]),
  location: canonicalLocationInputSchema
});

export type ApproveStoreCandidateInput = z.infer<
  typeof approveStoreCandidateSchema
>;

export const mergeStoreCandidateSchema = z.object({
  candidateId: uuidSchema,
  targetLocationId: uuidSchema
});

export const rejectionReasonSchema = z.enum([
  "not_milk_tea",
  "duplicate",
  "incorrect_location",
  "permanently_closed",
  "outside_scope",
  "other"
]);

export const rejectStoreCandidateSchema = z.object({
  candidateId: uuidSchema,
  reason: rejectionReasonSchema
});

export const candidateGoogleDetailSchema = z.object({
  placeId: z.string().min(1),
  displayName: z.string().min(1),
  formattedAddress: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  businessStatus: z.string().nullable(),
  websiteUri: z.string().url().nullable(),
  googleMapsUri: z.string().url().nullable(),
  attributionLabel: z.literal("Google Maps")
});

export type CandidateGoogleDetail = z.infer<typeof candidateGoogleDetailSchema>;

export const storeSuggestionSchema: z.ZodType<StoreSuggestion> = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  sourceUrl: z.string().url().optional()
});
