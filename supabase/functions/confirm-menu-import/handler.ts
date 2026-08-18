import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminCorsHeaders,
  jsonResponse,
  requireAdmin
} from "../_shared/admin-auth.ts";
import {
  ConfirmMenuRepositoryError,
  createConfirmMenuRepository,
  type ConfirmMenuRepository
} from "./repository.ts";

const itemSchema = z
  .object({
    externalItemId: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).nullable(),
    targetCategoryId: z.string().uuid()
  })
  .strict();

export const requestSchema = z
  .object({
    locationId: z.string().uuid(),
    provider: z.literal("uber_eats"),
    items: z.array(itemSchema).max(100)
  })
  .strict();

export const responseSchema = z.object({
  status: z.enum(["success", "validation_failed"]),
  created: z.array(
    z.object({
      externalItemId: z.string(),
      name: z.string(),
      productId: z.string().uuid()
    })
  ),
  reused: z.array(
    z.object({
      externalItemId: z.string(),
      name: z.string(),
      productId: z.string().uuid()
    })
  ),
  failed: z.array(
    z.object({
      externalItemId: z.string(),
      reason: z.string()
    })
  )
});

export type ConfirmMenuRequest = z.infer<typeof requestSchema>;
export type ConfirmMenuResponse = z.infer<typeof responseSchema>;

type AdminAuthorization = Awaited<ReturnType<typeof requireAdmin>>;
type AuthorizeAdmin = (
  request: Request,
  environment: { supabaseUrl: string; supabaseAnonKey: string },
  headers: HeadersInit
) => Promise<AdminAuthorization>;

export interface ConfirmMenuEnvironment {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ADMIN_APP_ORIGIN: string;
}

export interface ConfirmMenuHandlerDependencies {
  authorizeAdmin?: AuthorizeAdmin;
  repository?: ConfirmMenuRepository;
  repositoryFactory?: (client: SupabaseClient) => ConfirmMenuRepository;
}

export function createConfirmMenuHandler(
  environment: ConfirmMenuEnvironment,
  dependencies: ConfirmMenuHandlerDependencies = {}
) {
  const authorizeAdmin = dependencies.authorizeAdmin ?? requireAdmin;

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
      return jsonResponse({ error: "Invalid import request." }, 400, headers);
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

    const resolvedRepository =
      dependencies.repository ??
      dependencies.repositoryFactory?.(admin.client) ??
      createConfirmMenuRepository(admin.client);
    if (!resolvedRepository) {
      return jsonResponse(
        { error: "The menu import is not configured." },
        500,
        headers
      );
    }

    try {
      const result = responseSchema.safeParse(
        await resolvedRepository.confirmImport(parsedRequest.data)
      );
      if (!result.success) {
        console.error("External menu confirmation returned an invalid result.");
        return jsonResponse(
          { error: "The menu import returned an invalid result." },
          500,
          headers
        );
      }
      return jsonResponse(result.data, 200, headers);
    } catch (error) {
      if (error instanceof ConfirmMenuRepositoryError) {
        if (error.code === "external_identity_conflict") {
          return jsonResponse(
            {
              error:
                "An external item changed while it was being reviewed. Refresh the menu and retry."
            },
            409,
            headers
          );
        }
        if (error.code === "location_not_found") {
          return jsonResponse(
            { error: "The selected store is no longer available." },
            409,
            headers
          );
        }
      }

      console.error("External menu confirmation failed.");
      return jsonResponse(
        { error: "The menu import could not be completed." },
        500,
        headers
      );
    }
  };
}
