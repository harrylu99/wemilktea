import { z } from "zod";
import { jsonResponse } from "../_shared/admin-auth.ts";
import {
  createConfirmMenuHandler,
  type ConfirmMenuEnvironment
} from "./handler.ts";
import { createConfirmMenuRepository } from "./repository.ts";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url()
});

const environment = environmentSchema.safeParse({
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  ADMIN_APP_ORIGIN: Deno.env.get("ADMIN_APP_ORIGIN")
});

if (!environment.success) {
  console.error(
    "Confirm menu import function is missing required configuration."
  );
  Deno.serve(() =>
    jsonResponse({ error: "Menu import confirmation is not configured." }, 500)
  );
} else {
  const functionEnvironment: ConfirmMenuEnvironment = environment.data;
  Deno.serve((request) =>
    createConfirmMenuHandler(functionEnvironment, {
      repositoryFactory: createConfirmMenuRepository
    })(request)
  );
}
