export type ProductImportAvailability =
  | { mode: "all-current-brand-locations" }
  | { mode: "selected"; locationSlugs: string[] }
  | { mode: "unknown" };

export type ProductImportSource = {
  provider?: string;
  url?: string;
  externalId?: string;
};

export type ProductImport = {
  brandSlug: string;
  name: string;
  slug?: string;
  categorySlug: string;
  description?: string;
  tags: string[];
  seasonal: boolean;
  availability: ProductImportAvailability;
  source?: ProductImportSource;
};

export type ProductImportRow = ProductImport & { rowNumber: number };

export type ImportIssueKind =
  "parse" | "validation" | "reference" | "duplicate" | "database";

export type ImportIssue = {
  rowNumber: number;
  kind: ImportIssueKind;
  message: string;
};

export type ReferenceBrand = {
  id: string;
  slug: string;
  name: string;
};

export type ReferenceCategory = {
  id: string;
  slug: string;
  name: string;
};

export type ReferenceLocation = {
  id: string;
  brandId: string;
  slug: string;
  displayName: string;
  publicationStatus: "draft" | "published" | "archived";
};

export type ReferenceProduct = {
  id: string;
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  seasonal: boolean;
  isPublished: boolean;
};

export type ExistingLocationProduct = {
  locationId: string;
  productId: string;
};

export type ImportSnapshot = {
  brands: ReferenceBrand[];
  categories: ReferenceCategory[];
  locations: ReferenceLocation[];
  products: ReferenceProduct[];
  locationProducts: ExistingLocationProduct[];
};

export type ProductPlanAction = "create" | "update" | "skip" | "error";

export type LocationLinkPlan = {
  location: ReferenceLocation;
  action: "create" | "skip";
};

export type ImportPlanRow = {
  rowNumber: number;
  input: ProductImportRow;
  action: ProductPlanAction;
  brand: ReferenceBrand | null;
  category: ReferenceCategory | null;
  existingProduct: ReferenceProduct | null;
  locations: ReferenceLocation[];
  locationLinks: LocationLinkPlan[];
  issues: ImportIssue[];
};

export type ImportPlan = {
  rows: ImportPlanRow[];
  issues: ImportIssue[];
  counts: {
    create: number;
    update: number;
    skip: number;
    error: number;
    locationLinks: number;
  };
};

export type ImportApplyResult = {
  createdProducts: number;
  updatedProducts: number;
  skippedProducts: number;
  locationRelationshipsCreated: number;
};
