import {
  resolveUberEndpoints,
  resolveUberEnvironment,
  UberConfigurationError
} from "./config";
import type { Environment, UberEndpoints, UberEnvironment } from "./config";

export { UberConfigurationError } from "./config";
export type { Environment, UberEndpoints, UberEnvironment } from "./config";

export const UBER_STORE_SCOPE = "eats.store";
export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface UberCredentials {
  clientId: string;
  clientSecret: string;
}

export interface UberApplicationToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

export class UberOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "UberOAuthError";
  }
}

export function loadUberCredentials(env: Environment): UberCredentials {
  const clientId = env.UBER_EATS_CLIENT_ID?.trim();
  const clientSecret = env.UBER_EATS_CLIENT_SECRET?.trim();

  if (!clientId) {
    throw new UberConfigurationError(
      "UBER_EATS_CLIENT_ID is required in the local environment"
    );
  }

  if (!clientSecret) {
    throw new UberConfigurationError(
      "UBER_EATS_CLIENT_SECRET is required in the local environment"
    );
  }

  return { clientId, clientSecret };
}

export interface UberConfig extends UberCredentials, UberEndpoints {
  environment: UberEnvironment;
}

export function loadUberConfig(env: Environment): UberConfig {
  const credentials = loadUberCredentials(env);
  const environment = resolveUberEnvironment(env);

  return {
    ...credentials,
    environment,
    ...resolveUberEndpoints(environment)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeText(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 300);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function oauthErrorFromResponse(
  response: Response,
  payload: unknown
): UberOAuthError {
  const error = isRecord(payload) ? payload : {};
  const code = safeText(error.error, `http_${response.status}`);
  const message = safeText(
    error.error_description ?? error.message,
    response.statusText || "Uber OAuth request failed"
  );

  return new UberOAuthError(response.status, code, message);
}

function parseTokenResponse(
  response: Response,
  payload: unknown
): UberApplicationToken {
  if (!isRecord(payload)) {
    throw oauthErrorFromResponse(response, {
      error: "invalid_response",
      error_description: "Uber returned a non-JSON token response"
    });
  }

  const accessToken = payload.access_token;
  const expiresIn = payload.expires_in;

  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw oauthErrorFromResponse(response, {
      error: "invalid_response",
      error_description: "Uber returned an incomplete token response"
    });
  }

  return {
    accessToken,
    expiresIn,
    tokenType: safeText(payload.token_type, "Bearer"),
    scope: safeText(payload.scope, "")
  };
}

export async function requestApplicationToken(
  config: Pick<UberConfig, "clientId" | "clientSecret" | "authBaseUrl">,
  fetcher: Fetcher = (input, init) => fetch(input, init)
): Promise<UberApplicationToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
    scope: UBER_STORE_SCOPE
  });
  let response: Response;
  try {
    response = await fetcher(`${config.authBaseUrl}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
  } catch {
    throw new UberOAuthError(
      0,
      "network_error",
      "Uber OAuth request could not be completed"
    );
  }
  const payload = parseJson(await response.text());

  if (!response.ok) {
    throw oauthErrorFromResponse(response, payload);
  }

  return parseTokenResponse(response, payload);
}
