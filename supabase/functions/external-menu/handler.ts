import { z } from "zod";
import {
  adminCorsHeaders,
  jsonResponse,
  requireAdmin
} from "../_shared/admin-auth.ts";
import {
  createExternalStoreMappingRepository,
  type ExternalStoreMappingRepository
} from "./repository.ts";
import {
  fetchMenuForLocation,
  ExternalMenuServiceError,
  type ExternalMenuProviderClient
} from "./menu-service.ts";
import { UberClientError, UberEatsClient } from "./uber-client.ts";

export const requestSchema = z
  .object({ locationId: z.string().uuid() })
  .strict();

export interface ExternalMenuEnvironment {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ADMIN_APP_ORIGIN: string;
  UBER_EATS_CLIENT_ID: string;
  UBER_EATS_CLIENT_SECRET: string;
  UBER_EATS_ENV: "sandbox" | "production";
}

type AdminAuthorization = Awaited<ReturnType<typeof requireAdmin>>;
type AuthorizeAdmin = (
  request: Request,
  environment: { supabaseUrl: string; supabaseAnonKey: string },
  headers: HeadersInit
) => Promise<AdminAuthorization>;

export interface ExternalMenuHandlerDependencies {
  authorizeAdmin?: AuthorizeAdmin;
  mappingRepository?: ExternalStoreMappingRepository;
  providerClient?: ExternalMenuProviderClient;
}

function retryHeaders(error: UberClientError): HeadersInit {
  return error.retryAfterSeconds === null
    ? {}
    : { "Retry-After": String(error.retryAfterSeconds) };
}

function providerErrorResponse(
  error: UberClientError,
  headers: HeadersInit
): Response {
  if (error.status === 404) {
    return jsonResponse(
      { error: "Uber Eats menu was not found." },
      404,
      headers
    );
  }

  if (error.status === 429) {
    return jsonResponse(
      { error: "Uber Eats is temporarily rate limited." },
      503,
      { ...headers, ...retryHeaders(error) }
    );
  }

  if (
    error.kind === "timeout" ||
    error.kind === "network" ||
    error.status >= 500
  ) {
    return jsonResponse(
      { error: "Uber Eats is temporarily unavailable." },
      503,
      headers
    );
  }

  return jsonResponse(
    { error: "Uber Eats store access is unavailable." },
    502,
    headers
  );
}

export function createExternalMenuHandler(
  environment: ExternalMenuEnvironment,
  dependencies: ExternalMenuHandlerDependencies = {}
) {
  const authorizeAdmin = dependencies.authorizeAdmin ?? requireAdmin;
  const providerClient =
    dependencies.providerClient ??
    new UberEatsClient({
      clientId: environment.UBER_EATS_CLIENT_ID,
      clientSecret: environment.UBER_EATS_CLIENT_SECRET,
      environment: environment.UBER_EATS_ENV
    });

  return async (request: Request): Promise<Response> => {
    const headers = adminCorsHeaders(request, environment.ADMIN_APP_ORIGIN);
    if (!headers) {
      return jsonResponse({ error: "Origin is not allowed." }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, headers);
    }

    const body = request.headers
      .get("content-type")
      ?.includes("application/json")
      ? await request.json().catch(() => null)
      : null;
    const parsedRequest = requestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return jsonResponse({ error: "Invalid request." }, 400, headers);
    }

    const admin = await authorizeAdmin(
      request,
      {
        supabaseUrl: environment.SUPABASE_URL,
        supabaseAnonKey: environment.SUPABASE_ANON_KEY
      },
      headers
    );
    if (admin instanceof Response) return admin;

    const mappingRepository =
      dependencies.mappingRepository ??
      createExternalStoreMappingRepository(admin.client);

    try {
      const result = await fetchMenuForLocation({
        locationId: parsedRequest.data.locationId,
        mappingRepository,
        providerClient
      });
      return jsonResponse(result, 200, headers);
    } catch (error) {
      if (error instanceof ExternalMenuServiceError) {
        if (error.code === "mapping_not_found") {
          return jsonResponse(
            { error: "This store is not connected to Uber Eats." },
            404,
            headers
          );
        }
        if (error.code === "invalid_menu") {
          return jsonResponse(
            { error: "Uber Eats returned an invalid menu." },
            502,
            headers
          );
        }
        console.error("External store mapping lookup failed.");
        return jsonResponse(
          { error: "The external store connection could not be checked." },
          500,
          headers
        );
      }

      if (error instanceof UberClientError) {
        console.error("Uber menu provider request failed.", {
          stage: error.stage,
          kind: error.kind,
          status: error.status,
          code: error.code
        });
        return providerErrorResponse(error, headers);
      }

      console.error("External menu request failed.");
      return jsonResponse(
        { error: "The external menu could not be loaded." },
        500,
        headers
      );
    }
  };
}
