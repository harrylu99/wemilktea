import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  adminCorsHeaders,
  jsonResponse,
  requireAdmin
} from "../_shared/admin-auth.ts";
import { runStoreDiscovery } from "./discovery.ts";
import { createGooglePlacesClient } from "./google-places.ts";
import { createDiscoveryRepository } from "./repository.ts";

const requestSchema = z.object({}).strict();

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_PLACES_API_KEY: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url()
});

Deno.serve(async (request) => {
  const environment = environmentSchema.safeParse({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    GOOGLE_PLACES_API_KEY: Deno.env.get("GOOGLE_PLACES_API_KEY"),
    ADMIN_APP_ORIGIN: Deno.env.get("ADMIN_APP_ORIGIN")
  });

  if (!environment.success) {
    console.error(
      "Store discovery function is missing required configuration."
    );
    return jsonResponse({ error: "Store discovery is not configured." }, 500);
  }

  const headers = adminCorsHeaders(request, environment.data.ADMIN_APP_ORIGIN);

  if (!headers) {
    return jsonResponse({ error: "Origin is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, headers);
  }

  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json().catch(() => null)
    : null;

  if (!requestSchema.safeParse(body).success) {
    return jsonResponse({ error: "Invalid request." }, 400, headers);
  }

  const admin = await requireAdmin(
    request,
    {
      supabaseUrl: environment.data.SUPABASE_URL,
      supabaseAnonKey: environment.data.SUPABASE_ANON_KEY
    },
    headers
  );

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const serviceClient = createClient(
      environment.data.SUPABASE_URL,
      environment.data.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const result = await runStoreDiscovery({
      repository: createDiscoveryRepository(serviceClient),
      placesClient: createGooglePlacesClient(
        environment.data.GOOGLE_PLACES_API_KEY
      ),
      triggerType: "manual"
    });

    return jsonResponse(result, 200, headers);
  } catch (error) {
    console.error(
      "Store discovery failed before it could be finalized.",
      error
    );
    return jsonResponse(
      { error: "Store discovery could not be completed." },
      500,
      headers
    );
  }
});
