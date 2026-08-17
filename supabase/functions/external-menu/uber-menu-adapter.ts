import {
  normalizedExternalMenuSchema,
  type ExternalMenuItem,
  type NormalizedExternalMenu
} from "./types.ts";

export class MenuPayloadError extends Error {
  constructor(readonly code: string) {
    super("Uber menu payload could not be normalized.");
    this.name = "MenuPayloadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(value: unknown, maxLength = 2_000): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function readLocalizedText(value: unknown): string | null {
  const direct = readText(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;

  const translations = isRecord(value.translations)
    ? value.translations
    : value;
  const preferredKeys = ["default", "en", "en_us", "en-US"];

  for (const key of preferredKeys) {
    const preferred = readText(translations[key]);
    if (preferred) return preferred;
  }

  for (const key of Object.keys(translations).sort()) {
    const translated = readText(translations[key]);
    if (translated) return translated;
  }

  return null;
}

function readCollection(
  value: unknown,
  field: string,
  allowEmptyObject: boolean
): unknown[] {
  if (Array.isArray(value)) return value;
  if (allowEmptyObject && isRecord(value) && Object.keys(value).length === 0) {
    return [];
  }
  throw new MenuPayloadError(`invalid_${field}`);
}

function readPrice(value: unknown): ExternalMenuItem["price"] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.price === undefined) return null;

  if (
    typeof value.price !== "number" ||
    !Number.isSafeInteger(value.price) ||
    value.price < 0
  ) {
    throw new MenuPayloadError("invalid_price");
  }

  return {
    amountMinor: value.price,
    currency: null
  };
}

function readImageUrl(value: unknown): string | null {
  const imageUrl = readText(value, 2_000);
  if (!imageUrl) return null;
  try {
    new URL(imageUrl);
    return imageUrl;
  } catch {
    return null;
  }
}

function categoryNamesByItem(payload: Record<string, unknown>) {
  const categoriesValue = payload.categories;
  if (categoriesValue === undefined || categoriesValue === null) {
    return new Map<string, string | null>();
  }

  const categories = readCollection(categoriesValue, "categories", true);
  const names = new Map<string, string | null>();

  for (const categoryValue of categories) {
    if (!isRecord(categoryValue) || typeof categoryValue.id !== "string") {
      throw new MenuPayloadError("invalid_category");
    }

    const entitiesValue = categoryValue.entities;
    if (entitiesValue === undefined || entitiesValue === null) continue;
    if (!Array.isArray(entitiesValue)) {
      throw new MenuPayloadError("invalid_category_entities");
    }

    const categoryName = readLocalizedText(categoryValue.title);
    for (const entity of entitiesValue) {
      if (!isRecord(entity) || typeof entity.id !== "string") {
        throw new MenuPayloadError("invalid_category_entity");
      }
      if (!names.has(entity.id)) names.set(entity.id, categoryName);
    }
  }

  return names;
}

function modifierWarning(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    return value.length > 0
      ? "Modifier groups were returned but are not normalized by WM-52."
      : null;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0
      ? "Modifier groups were returned but are not normalized by WM-52."
      : null;
  }
  throw new MenuPayloadError("invalid_modifier_groups");
}

export function normalizeUberMenu(payload: unknown): NormalizedExternalMenu {
  if (!isRecord(payload)) throw new MenuPayloadError("invalid_menu");
  if (!("items" in payload)) throw new MenuPayloadError("missing_items");

  const itemValues = readCollection(payload.items, "items", true);
  const categories = categoryNamesByItem(payload);
  const warnings = modifierWarning(payload.modifier_groups);
  const items: ExternalMenuItem[] = [];

  for (const itemValue of itemValues) {
    if (!isRecord(itemValue) || typeof itemValue.id !== "string") {
      throw new MenuPayloadError("invalid_item_id");
    }

    const name = readLocalizedText(itemValue.title);
    if (!name) throw new MenuPayloadError("invalid_item_title");

    items.push({
      provider: "uber_eats",
      externalItemId: itemValue.id,
      name,
      description: readLocalizedText(itemValue.description),
      sourceCategory: categories.get(itemValue.id) ?? null,
      price: readPrice(itemValue.price_info),
      imageUrl: readImageUrl(itemValue.image_url)
    });
  }

  return normalizedExternalMenuSchema.parse({
    provider: "uber_eats",
    items,
    warnings: warnings ? [warnings] : []
  });
}
