import type { Fetcher, UberConfig } from "./auth";

export type UberRequestStage = "stores" | "store-details" | "menu";

export interface AuthorizedStore {
  storeId: string;
  name: string;
}

export interface UberStoreDetails extends AuthorizedStore {
  status: string;
  location: {
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
  };
  rootKeys: string[];
}

export class UberApiError extends Error {
  constructor(
    readonly stage: UberRequestStage,
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "UberApiError";
  }
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

function apiErrorFromResponse(
  response: Response,
  stage: UberRequestStage,
  payload: unknown
): UberApiError {
  const error = isRecord(payload) ? payload : {};
  const code = safeText(
    error.code ?? error.error_code ?? error.error,
    `http_${response.status}`
  );
  const message = safeText(
    error.message ?? error.error_message ?? error.error_description,
    response.statusText || "Uber API request failed"
  );

  return new UberApiError(stage, response.status, code, message);
}

async function requestJson(
  url: string,
  accessToken: string,
  stage: UberRequestStage,
  fetcher: Fetcher
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch {
    throw new UberApiError(
      stage,
      0,
      "network_error",
      "Uber API request could not be completed"
    );
  }
  const payload = parseJson(await response.text());

  if (!response.ok) {
    throw apiErrorFromResponse(response, stage, payload);
  }

  return payload;
}

function parseStore(value: unknown): AuthorizedStore | null {
  if (!isRecord(value) || typeof value.store_id !== "string") {
    return null;
  }

  return {
    storeId: value.store_id,
    name: safeText(value.name, "(unnamed store)")
  };
}

function safeOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? safeText(value, "") : null;
}

function parseStoreDetails(payload: unknown): UberStoreDetails {
  if (!isRecord(payload) || typeof payload.store_id !== "string") {
    throw new UberApiError(
      "store-details",
      200,
      "invalid_response",
      "Uber returned store details without a store_id"
    );
  }

  const location = isRecord(payload.location) ? payload.location : {};

  return {
    storeId: payload.store_id,
    name: safeText(payload.name, "(unnamed store)"),
    status: safeText(payload.status, "(status unavailable)"),
    location: {
      address: safeOptionalText(location.address),
      city: safeOptionalText(location.city),
      state: safeOptionalText(location.state),
      country: safeOptionalText(location.country),
      postalCode: safeOptionalText(location.postal_code)
    },
    rootKeys: Object.keys(payload)
  };
}

function parseStorePage(payload: unknown): {
  stores: AuthorizedStore[];
  nextKey: string | null;
} {
  if (!isRecord(payload) || !Array.isArray(payload.stores)) {
    throw new UberApiError(
      "stores",
      200,
      "invalid_response",
      "Uber returned an invalid stores response"
    );
  }

  const stores = payload.stores.map(parseStore);
  if (stores.some((store) => store === null)) {
    throw new UberApiError(
      "stores",
      200,
      "invalid_response",
      "Uber returned a store without a store_id"
    );
  }

  return {
    stores: stores.filter((store): store is AuthorizedStore => store !== null),
    nextKey:
      typeof payload.next_key === "string" && payload.next_key
        ? payload.next_key
        : null
  };
}

type MenuArrayKey = "menus" | "categories" | "items" | "modifierGroups";

function emptyMenuCounts(): Record<MenuArrayKey, number> {
  return {
    menus: 0,
    categories: 0,
    items: 0,
    modifierGroups: 0
  };
}

function menuKeyFor(value: string): MenuArrayKey | null {
  const normalized = value.replace(/[-_]/g, "").toLowerCase();
  if (normalized === "menus" || normalized === "menu") return "menus";
  if (normalized === "categories" || normalized === "category") {
    return "categories";
  }
  if (normalized === "items" || normalized === "item") return "items";
  if (
    normalized === "modifiergroups" ||
    normalized === "modifiergroup" ||
    normalized === "modifiers"
  ) {
    return "modifierGroups";
  }
  return null;
}

function collectMenuStructure(
  value: unknown,
  path: string,
  structure: Array<Record<string, unknown>>,
  counts: Record<MenuArrayKey, number>,
  depth = 0
): void {
  if (structure.length >= 80 || depth > 4) return;

  if (Array.isArray(value)) {
    const keys =
      value.length > 0 && isRecord(value[0])
        ? Object.keys(value[0]).sort()
        : undefined;
    structure.push({
      path,
      type: "array",
      length: value.length,
      ...(keys ? { firstObjectKeys: keys } : {})
    });
    return;
  }

  if (!isRecord(value)) {
    structure.push({ path, type: typeof value });
    return;
  }

  structure.push({ path, type: "object", keys: Object.keys(value).sort() });
  for (const [key, child] of Object.entries(value)) {
    const menuKey = menuKeyFor(key);
    if (menuKey && Array.isArray(child)) {
      counts[menuKey] += child.length;
    }
    collectMenuStructure(child, `${path}.${key}`, structure, counts, depth + 1);
    if (structure.length >= 80) return;
  }
}

export function summarizeMenu(menu: unknown) {
  const counts = emptyMenuCounts();
  const structure: Array<Record<string, unknown>> = [];
  collectMenuStructure(menu, "$", structure, counts);

  return {
    rootKeys: isRecord(menu) ? Object.keys(menu) : [],
    counts,
    structure
  } as const;
}

export async function listAuthorizedStores(
  accessToken: string,
  apiBaseUrl: UberConfig["apiBaseUrl"],
  fetcher: Fetcher = (input, init) => fetch(input, init)
): Promise<AuthorizedStore[]> {
  const stores: AuthorizedStore[] = [];
  const seenKeys = new Set<string>();
  let nextKey: string | null = null;

  do {
    const params = new URLSearchParams({ limit: "50" });
    if (nextKey) {
      params.set("start_key", nextKey);
    }

    const payload = await requestJson(
      `${apiBaseUrl}/v1/eats/stores?${params.toString()}`,
      accessToken,
      "stores",
      fetcher
    );
    const page = parseStorePage(payload);
    stores.push(...page.stores);
    nextKey = page.nextKey;

    if (nextKey) {
      if (seenKeys.has(nextKey)) {
        throw new UberApiError(
          "stores",
          200,
          "invalid_pagination",
          "Uber returned a repeated stores pagination key"
        );
      }
      seenKeys.add(nextKey);
    }
  } while (nextKey);

  return stores;
}

export async function retrieveStoreDetails(
  storeId: string,
  accessToken: string,
  apiBaseUrl: UberConfig["apiBaseUrl"],
  fetcher: Fetcher = (input, init) => fetch(input, init)
): Promise<UberStoreDetails> {
  const normalizedStoreId = storeId.trim();
  if (!normalizedStoreId) {
    throw new UberApiError(
      "store-details",
      0,
      "invalid_store_id",
      "A store ID is required"
    );
  }

  const payload = await requestJson(
    `${apiBaseUrl}/v1/eats/stores/${encodeURIComponent(normalizedStoreId)}`,
    accessToken,
    "store-details",
    fetcher
  );

  return parseStoreDetails(payload);
}

export async function retrieveMenu(
  storeId: string,
  accessToken: string,
  apiBaseUrl: UberConfig["apiBaseUrl"],
  fetcher: Fetcher = (input, init) => fetch(input, init)
): Promise<unknown> {
  const normalizedStoreId = storeId.trim();
  if (!normalizedStoreId) {
    throw new UberApiError(
      "menu",
      0,
      "invalid_store_id",
      "A store ID is required"
    );
  }

  const payload = await requestJson(
    `${apiBaseUrl}/v2/eats/stores/${encodeURIComponent(normalizedStoreId)}/menus`,
    accessToken,
    "menu",
    fetcher
  );

  return payload;
}
