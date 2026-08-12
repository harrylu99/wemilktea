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

export const storeSuggestionSchema: z.ZodType<StoreSuggestion> = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  sourceUrl: z.string().url().optional()
});
