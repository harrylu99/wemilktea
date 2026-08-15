import { z } from "zod";
import {
  adminCorsHeaders,
  jsonResponse,
  requireAdmin
} from "../_shared/admin-auth.ts";
import {
  CandidateDetailError,
  getCandidateGoogleDetail
} from "./candidate-detail.ts";
import {
  createGooglePlaceDetailClient,
  GooglePlaceDetailError
} from "./google-place-detail.ts";

const requestSchema = z.object({ candidateId: z.string().uuid() }).strict();

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  GOOGLE_PLACES_API_KEY: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url()
});

Deno.serve(async (request) => {
  const environment = environmentSchema.safeParse({
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    GOOGLE_PLACES_API_KEY: Deno.env.get("GOOGLE_PLACES_API_KEY"),
    ADMIN_APP_ORIGIN: Deno.env.get("ADMIN_APP_ORIGIN")
  });

  if (!environment.success) {
    console.error(
      "Candidate detail function is missing required configuration."
    );
    return jsonResponse({ error: "Candidate detail is not configured." }, 500);
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
  const parsedRequest = requestSchema.safeParse(body);

  if (!parsedRequest.success) {
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
    const detail = await getCandidateGoogleDetail({
      candidateId: parsedRequest.data.candidateId,
      repository: {
        async findCandidate(candidateId) {
          const { data, error } = await admin.client
            .from("store_candidates")
            .select("google_place_id, status")
            .eq("id", candidateId)
            .maybeSingle();

          if (error) {
            throw new Error("Candidate lookup failed.");
          }

          return data &&
            typeof data.google_place_id === "string" &&
            typeof data.status === "string"
            ? { googlePlaceId: data.google_place_id, status: data.status }
            : null;
        }
      },
      googleClient: createGooglePlaceDetailClient(
        environment.data.GOOGLE_PLACES_API_KEY
      )
    });

    return jsonResponse(detail, 200, headers);
  } catch (error) {
    if (error instanceof CandidateDetailError) {
      return jsonResponse(
        {
          error:
            error.code === "candidate_not_found"
              ? "Candidate not found."
              : "This candidate has already been reviewed."
        },
        error.code === "candidate_not_found" ? 404 : 409,
        headers
      );
    }

    if (error instanceof GooglePlaceDetailError && error.status === 404) {
      return jsonResponse(
        { error: "Google no longer has reference data for this place." },
        404,
        headers
      );
    }

    console.error("Candidate Google detail lookup failed.", error);
    return jsonResponse(
      { error: "Google reference data is temporarily unavailable." },
      502,
      headers
    );
  }
});
