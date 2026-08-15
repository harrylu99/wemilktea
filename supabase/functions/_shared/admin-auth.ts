import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

export function adminCorsHeaders(request: Request, adminOrigin: string) {
  const origin = request.headers.get("origin");

  if (origin && origin !== adminOrigin) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": adminOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

export async function requireAdmin(
  request: Request,
  environment: { supabaseUrl: string; supabaseAnonKey: string },
  headers: HeadersInit
): Promise<{ client: SupabaseClient; userId: string } | Response> {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return jsonResponse({ error: "Authentication is required." }, 401, headers);
  }

  const client = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    { global: { headers: { Authorization: authorization } } }
  );
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData.user) {
    return jsonResponse({ error: "Authentication is required." }, 401, headers);
  }

  const { data: isAdmin, error: adminError } = await client.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    return jsonResponse(
      { error: "Administrator access is required." },
      403,
      headers
    );
  }

  return { client, userId: userData.user.id };
}
