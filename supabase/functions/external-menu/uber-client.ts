export type UberEnvironment = "sandbox" | "production";

export const UBER_STORE_SCOPE = "eats.store";
export const UBER_ENDPOINTS: Record<
  UberEnvironment,
  { authBaseUrl: string; apiBaseUrl: string }
> = {
  sandbox: {
    authBaseUrl: "https://sandbox-login.uber.com",
    apiBaseUrl: "https://test-api.uber.com"
  },
  production: {
    authBaseUrl: "https://auth.uber.com",
    apiBaseUrl: "https://api.uber.com"
  }
};

export type UberFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type UberClock = () => number;

export interface UberClientConfig {
  clientId: string;
  clientSecret: string;
  environment: UberEnvironment;
  timeoutMs?: number;
  safetyWindowMs?: number;
}

type UberRequestStage = "oauth" | "menu";
type UberErrorKind = "http" | "network" | "timeout" | "invalid_response";

export class UberClientError extends Error {
  constructor(
    readonly stage: UberRequestStage,
    readonly kind: UberErrorKind,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super("Uber Eats request failed.");
    this.name = "UberClientError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeCode(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 120);
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function abortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class UberEatsClient {
  private cachedToken: CachedToken | null = null;
  private refreshPromise: Promise<CachedToken> | null = null;
  private readonly endpoints: (typeof UBER_ENDPOINTS)[UberEnvironment];
  private readonly timeoutMs: number;
  private readonly safetyWindowMs: number;

  constructor(
    private readonly config: UberClientConfig,
    private readonly fetcher: UberFetcher = (input, init) => fetch(input, init),
    private readonly clock: UberClock = () => Date.now()
  ) {
    this.endpoints = UBER_ENDPOINTS[config.environment];
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.safetyWindowMs = config.safetyWindowMs ?? 30_000;
  }

  async getAccessToken(): Promise<string> {
    const now = this.clock();
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt > now + this.safetyWindowMs
    ) {
      return this.cachedToken.accessToken;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.requestApplicationToken().finally(() => {
        this.refreshPromise = null;
      });
    }

    const token = await this.refreshPromise;
    this.cachedToken = token;
    return token.accessToken;
  }

  async fetchMenu(storeId: string): Promise<unknown> {
    const normalizedStoreId = storeId.trim();
    if (!normalizedStoreId) {
      throw new UberClientError(
        "menu",
        "invalid_response",
        0,
        "invalid_store_id"
      );
    }

    const accessToken = await this.getAccessToken();
    return this.requestJson(
      `${this.endpoints.apiBaseUrl}/v2/eats/stores/${encodeURIComponent(normalizedStoreId)}/menus`,
      {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        Authorization: `Bearer ${accessToken}`
      },
      "menu"
    );
  }

  private async requestApplicationToken(): Promise<CachedToken> {
    const payload = await this.requestJson(
      `${this.endpoints.authBaseUrl}/oauth/v2/token`,
      { "Content-Type": "application/x-www-form-urlencoded" },
      "oauth",
      new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
        scope: UBER_STORE_SCOPE
      })
    );

    if (!isRecord(payload)) {
      throw new UberClientError(
        "oauth",
        "invalid_response",
        200,
        "invalid_token_response"
      );
    }

    const accessToken = payload.access_token;
    const expiresIn = payload.expires_in;
    const scope = typeof payload.scope === "string" ? payload.scope : "";
    const scopes = scope.split(/\s+/).filter(Boolean);

    if (
      typeof accessToken !== "string" ||
      !accessToken ||
      typeof expiresIn !== "number" ||
      !Number.isSafeInteger(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new UberClientError(
        "oauth",
        "invalid_response",
        200,
        "invalid_token_response"
      );
    }

    if (!scopes.includes(UBER_STORE_SCOPE)) {
      throw new UberClientError(
        "oauth",
        "invalid_response",
        200,
        "required_scope_unavailable"
      );
    }

    return {
      accessToken,
      expiresAt: this.clock() + expiresIn * 1000
    };
  }

  private async requestJson(
    url: string,
    headers: HeadersInit,
    stage: UberRequestStage,
    body?: BodyInit
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        method: body ? "POST" : "GET",
        headers,
        ...(body ? { body } : {}),
        signal: controller.signal
      });
      const payload = parseJson(await response.text());

      if (!response.ok) {
        const error = isRecord(payload) ? payload : {};
        throw new UberClientError(
          stage,
          "http",
          response.status,
          safeCode(
            error.error_code ?? error.code ?? error.error,
            `http_${response.status}`
          ),
          retryAfterSeconds(response)
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof UberClientError) throw error;
      if (controller.signal.aborted || abortError(error)) {
        throw new UberClientError(stage, "timeout", 0, "timeout");
      }
      throw new UberClientError(stage, "network", 0, "network_error");
    } finally {
      clearTimeout(timeout);
    }
  }
}
