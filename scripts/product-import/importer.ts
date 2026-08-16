import type {
  ImportApplyResult,
  ImportIssue,
  ImportPlan,
  ImportPlanRow,
  ImportSnapshot,
  ProductImportRow,
  ReferenceBrand,
  ReferenceCategory,
  ReferenceLocation,
  ReferenceProduct
} from "./types";
import type { ProductCreateInput, ProductImportRepository } from "./repository";

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function productChanged(
  product: ReferenceProduct,
  input: ProductImportRow,
  category: ReferenceCategory
): boolean {
  return (
    product.categoryId !== category.id ||
    product.name !== input.name ||
    (product.description ?? undefined) !== input.description ||
    !sameStringArray(product.tags, input.tags) ||
    product.seasonal !== input.seasonal
  );
}

function issue(rowNumber: number, kind: ImportIssue["kind"], message: string) {
  return { rowNumber, kind, message } satisfies ImportIssue;
}

function resolveLocations(
  input: ProductImportRow,
  brand: ReferenceBrand,
  locations: ReferenceLocation[]
): { locations: ReferenceLocation[]; issues: ImportIssue[] } {
  if (input.availability.mode === "unknown") {
    return { locations: [], issues: [] };
  }

  if (input.availability.mode === "all-current-brand-locations") {
    return {
      locations: locations.filter(
        (location) =>
          location.brandId === brand.id &&
          location.publicationStatus !== "archived"
      ),
      issues: []
    };
  }

  const resolved: ReferenceLocation[] = [];
  const issues: ImportIssue[] = [];
  for (const slug of input.availability.locationSlugs) {
    const location = locations.find((candidate) => candidate.slug === slug);
    if (!location) {
      issues.push(
        issue(input.rowNumber, "reference", `location "${slug}" does not exist`)
      );
      continue;
    }
    if (location.brandId !== brand.id) {
      issues.push(
        issue(
          input.rowNumber,
          "reference",
          `location "${slug}" belongs to a different brand`
        )
      );
      continue;
    }
    if (location.publicationStatus === "archived") {
      issues.push(
        issue(input.rowNumber, "reference", `location "${slug}" is archived`)
      );
      continue;
    }
    if (!resolved.some((candidate) => candidate.id === location.id)) {
      resolved.push(location);
    }
  }
  return { locations: resolved, issues };
}

function locationLinks(
  product: ReferenceProduct | null,
  locations: ReferenceLocation[],
  snapshot: ImportSnapshot
) {
  return locations.map((location) => ({
    location,
    action:
      product &&
      snapshot.locationProducts.some(
        (link) =>
          link.productId === product.id && link.locationId === location.id
      )
        ? ("skip" as const)
        : ("create" as const)
  }));
}

function productInput(
  input: ProductImportRow,
  brand: ReferenceBrand,
  category: ReferenceCategory
): ProductCreateInput {
  return {
    brandId: brand.id,
    categoryId: category.id,
    name: input.name,
    slug: input.slug ?? "",
    description: input.description ?? null,
    tags: input.tags,
    seasonal: input.seasonal,
    isPublished: false
  };
}

export function planImport(
  inputs: ProductImportRow[],
  snapshot: ImportSnapshot,
  initialIssues: ImportIssue[] = []
): ImportPlan {
  const rows: ImportPlanRow[] = [];
  const seenIdentity = new Set<string>();
  const issuesByRow = new Map<number, ImportIssue[]>();
  for (const inputIssue of initialIssues) {
    const rowIssues = issuesByRow.get(inputIssue.rowNumber) ?? [];
    rowIssues.push(inputIssue);
    issuesByRow.set(inputIssue.rowNumber, rowIssues);
  }

  for (const input of inputs) {
    const issues = [...(issuesByRow.get(input.rowNumber) ?? [])];
    const brand =
      snapshot.brands.find((candidate) => candidate.slug === input.brandSlug) ??
      null;
    const category =
      snapshot.categories.find(
        (candidate) => candidate.slug === input.categorySlug
      ) ?? null;
    const identity = `${input.brandSlug}:${input.slug}`;
    const existingProduct = brand
      ? (snapshot.products.find(
          (candidate) =>
            candidate.brandId === brand.id && candidate.slug === input.slug
        ) ?? null)
      : null;

    if (!brand) {
      issues.push(
        issue(
          input.rowNumber,
          "reference",
          `brand "${input.brandSlug}" does not exist`
        )
      );
    }
    if (!category) {
      issues.push(
        issue(
          input.rowNumber,
          "reference",
          `category "${input.categorySlug}" does not exist`
        )
      );
    }
    if (seenIdentity.has(identity)) {
      issues.push(
        issue(
          input.rowNumber,
          "duplicate",
          `duplicate import identity "${identity}" appears more than once`
        )
      );
    }
    seenIdentity.add(identity);

    if (brand) {
      const sameNameDifferentSlug = snapshot.products.find(
        (candidate) =>
          candidate.brandId === brand.id &&
          normalized(candidate.name) === normalized(input.name) &&
          candidate.slug !== input.slug
      );
      if (sameNameDifferentSlug) {
        issues.push(
          issue(
            input.rowNumber,
            "duplicate",
            `another ${brand.slug} product already uses this name with slug "${sameNameDifferentSlug.slug}"`
          )
        );
      }
    }

    const resolved = brand
      ? resolveLocations(input, brand, snapshot.locations)
      : { locations: [], issues: [] };
    issues.push(...resolved.issues);

    const action: ImportPlanRow["action"] = issues.length
      ? "error"
      : !existingProduct
        ? "create"
        : category && productChanged(existingProduct, input, category)
          ? "update"
          : "skip";

    rows.push({
      rowNumber: input.rowNumber,
      input,
      action,
      brand,
      category,
      existingProduct,
      locations: resolved.locations,
      locationLinks:
        action === "error"
          ? []
          : locationLinks(existingProduct, resolved.locations, snapshot),
      issues
    });
  }

  return {
    rows,
    issues: initialIssues,
    counts: {
      create: rows.filter((row) => row.action === "create").length,
      update: rows.filter((row) => row.action === "update").length,
      skip: rows.filter((row) => row.action === "skip").length,
      error:
        initialIssues.length +
        rows.filter((row) => row.action === "error").length,
      locationLinks: rows.reduce(
        (count, row) =>
          count +
          row.locationLinks.filter((link) => link.action === "create").length,
        0
      )
    }
  };
}

function ensureNoPlanErrors(plan: ImportPlan): void {
  if (plan.counts.error > 0) {
    throw new Error("Import cannot be applied while validation errors remain");
  }
}

export async function applyImport(
  plan: ImportPlan,
  repository: ProductImportRepository
): Promise<ImportApplyResult> {
  ensureNoPlanErrors(plan);
  const result: ImportApplyResult = {
    createdProducts: 0,
    updatedProducts: 0,
    skippedProducts: 0,
    locationRelationshipsCreated: 0
  };

  for (const row of plan.rows) {
    if (!row.brand || !row.category) {
      throw new Error(`row ${row.rowNumber}: resolved references are missing`);
    }

    let productId = row.existingProduct?.id;
    const input = productInput(row.input, row.brand, row.category);
    if (row.action === "create") {
      productId = await repository.createProduct(input);
      result.createdProducts += 1;
    } else if (row.action === "update" && productId) {
      await repository.updateProduct({ ...input, productId });
      result.updatedProducts += 1;
    } else if (row.action === "skip") {
      result.skippedProducts += 1;
    }

    if (!productId) {
      throw new Error(`row ${row.rowNumber}: product ID was not resolved`);
    }

    for (const link of row.locationLinks) {
      if (link.action !== "create") continue;
      await repository.createLocationProduct({
        brandId: row.brand.id,
        productId,
        locationId: link.location.id,
        sourceReference: row.input.source?.url
      });
      result.locationRelationshipsCreated += 1;
    }
  }

  return result;
}
