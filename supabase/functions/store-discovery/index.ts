import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
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

function json(body: object, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function corsHeaders(request: Request, adminOrigin: string) {
  const origin = request.headers.get("origin");

  if (origin && origin !== adminOrigin) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": adminOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

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
    return json({ error: "Store discovery is not configured." }, 500);
  }

  const headers = corsHeaders(request, environment.data.ADMIN_APP_ORIGIN);

  if (!headers) {
    return json({ error: "Origin is not allowed." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, headers);
  }

  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request.json().catch(() => null)
    : null;

  if (!requestSchema.safeParse(body).success) {
    return json({ error: "Invalid request." }, 400, headers);
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return json({ error: "Authentication is required." }, 401, headers);
  }

  const userClient = createClient(
    environment.data.SUPABASE_URL,
    environment.data.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authorization } } }
  );
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: "Authentication is required." }, 401, headers);
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    return json({ error: "Administrator access is required." }, 403, headers);
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

    return json(result, 200, headers);
  } catch (error) {
    console.error(
      "Store discovery failed before it could be finalized.",
      error
    );
    return json(
      { error: "Store discovery could not be completed." },
      500,
      headers
    );
  }
});
