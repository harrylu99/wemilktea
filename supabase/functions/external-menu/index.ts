import { z } from "zod";
import { jsonResponse } from "../_shared/admin-auth.ts";
import { createExternalMenuHandler } from "./handler.ts";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url(),
  UBER_EATS_CLIENT_ID: z.string().min(1),
  UBER_EATS_CLIENT_SECRET: z.string().min(1),
  UBER_EATS_ENV: z.enum(["sandbox", "production"])
});

const environment = environmentSchema.safeParse({
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  ADMIN_APP_ORIGIN: Deno.env.get("ADMIN_APP_ORIGIN"),
  UBER_EATS_CLIENT_ID: Deno.env.get("UBER_EATS_CLIENT_ID"),
  UBER_EATS_CLIENT_SECRET: Deno.env.get("UBER_EATS_CLIENT_SECRET"),
  UBER_EATS_ENV: Deno.env.get("UBER_EATS_ENV")
});

if (!environment.success) {
  console.error("External menu function is missing required configuration.");
  Deno.serve(() =>
    jsonResponse({ error: "External menu is not configured." }, 500)
  );
} else {
  Deno.serve(createExternalMenuHandler(environment.data));
}
