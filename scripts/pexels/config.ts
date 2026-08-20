import { z } from "zod";

export const operatorEnvironmentSchema = z.object({
  PEXELS_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1)
});

export const assignmentEnvironmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export function parseEnvironment<T extends z.ZodType>(schema: T) {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Missing or invalid server-only configuration: ${result.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`
    );
  }
  return result.data as z.infer<T>;
}
