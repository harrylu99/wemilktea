import { slugify } from "@wemilktea/config";
import { z } from "zod";
import type { RawProductRecord } from "./parse";
import type {
  ProductImportAvailability,
  ProductImportRow,
  ProductImportSource
} from "./types";

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const urlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "source_url must use http:// or https://"
  });

const productImportSchema = z.object({
  brandSlug: slugSchema,
  name: z.string().trim().min(1).max(160),
  slug: slugSchema,
  categorySlug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  seasonal: z.boolean(),
  availability: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("all-current-brand-locations") }),
    z.object({
      mode: z.literal("selected"),
      locationSlugs: z.array(slugSchema).min(1)
    }),
    z.object({ mode: z.literal("unknown") })
  ]),
  source: z
    .object({
      provider: z.string().trim().min(1).max(80).optional(),
      url: urlSchema.optional(),
      externalId: z.string().trim().min(1).max(200).optional()
    })
    .optional()
});

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

function availabilityValue(
  value: unknown,
  locationSlugs: string[]
): ProductImportAvailability {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const objectValue = value as {
      mode?: unknown;
      locationSlugs?: unknown;
      location_slugs?: unknown;
    };
    const mode = stringValue(objectValue.mode);
    const selectedLocations = stringArrayValue(
      objectValue.locationSlugs ?? objectValue.location_slugs
    );
    if (mode === "all-current-brand-locations") {
      return { mode };
    }
    if (mode === "selected") {
      return { mode, locationSlugs: selectedLocations };
    }
    return { mode: "unknown" };
  }

  const mode = stringValue(value)?.toLowerCase();
  if (mode === "all-current-brand-locations") {
    return { mode };
  }
  if (mode === "selected") {
    return { mode, locationSlugs };
  }
  return { mode: "unknown" };
}

function sourceValue(
  values: Record<string, unknown>
): ProductImportSource | undefined {
  const rawSource = values.source;
  const sourceObject =
    typeof rawSource === "object" &&
    rawSource !== null &&
    !Array.isArray(rawSource)
      ? (rawSource as Record<string, unknown>)
      : {};
  const provider = stringValue(sourceObject.provider ?? values.source_provider);
  const url = stringValue(sourceObject.url ?? values.source_url);
  const externalId = stringValue(
    sourceObject.externalId ??
      sourceObject.external_id ??
      values.source_external_id
  );

  if (!provider && !url && !externalId) return undefined;
  return { provider, url, externalId };
}

export function normalizeProductImport(record: RawProductRecord): {
  value: ProductImportRow | null;
  message?: string;
} {
  const brandSlug = stringValue(record.values.brand_slug);
  const name = stringValue(record.values.product_name);
  const categorySlug = stringValue(record.values.category_slug);
  const suppliedSlug = stringValue(record.values.product_slug);
  const generatedSlug = name ? slugify(name) : "";
  const tags = stringArrayValue(record.values.tags);
  const locationSlugs = stringArrayValue(record.values.location_slugs);
  const availability = availabilityValue(
    record.values.availability,
    locationSlugs
  );
  const description = stringValue(record.values.description);
  const source = sourceValue(record.values);
  const candidate = {
    brandSlug,
    name,
    slug: suppliedSlug ?? generatedSlug,
    categorySlug,
    description,
    tags,
    seasonal: booleanValue(record.values.seasonal),
    availability,
    source
  };
  const parsed = productImportSchema.safeParse(candidate);

  if (!parsed.success) {
    return {
      value: null,
      message: parsed.error.issues.map((issue) => issue.message).join("; ")
    };
  }

  return { value: { ...parsed.data, rowNumber: record.rowNumber } };
}

export function normalizeProductImports(records: RawProductRecord[]) {
  const rows: ProductImportRow[] = [];
  const issues = records.flatMap((record) => {
    const result = normalizeProductImport(record);
    if (result.value) {
      rows.push(result.value);
      return [];
    }
    return [
      {
        rowNumber: record.rowNumber,
        kind: "validation" as const,
        message: result.message ?? "invalid product import row"
      }
    ];
  });

  return { rows, issues };
}
