import { slugify } from "@wemilktea/config";
import { z } from "zod";

const externalMenuItemSchema = z.object({
  provider: z.literal("uber_eats"),
  externalItemId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sourceCategory: z.string().nullable(),
  price: z
    .object({
      amountMinor: z.number().int().nonnegative(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable()
    })
    .nullable(),
  imageUrl: z.string().url().nullable()
});

export const externalMenuResponseSchema = z.object({
  locationId: z.string().uuid(),
  provider: z.literal("uber_eats"),
  items: z.array(externalMenuItemSchema),
  warnings: z.array(z.string())
});

export type ExternalMenuResponse = z.infer<typeof externalMenuResponseSchema>;
export type ExternalMenuItem = z.infer<typeof externalMenuItemSchema>;

export type ReviewCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ReviewProduct = {
  id: string;
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
};

export type DuplicateStatus = "new" | "existing" | "possible-match";

export type MenuReviewItem = ExternalMenuItem & {
  selected: boolean;
  duplicateStatus: DuplicateStatus;
  matchedProductId: string | null;
  matchedProductName: string | null;
  targetCategoryId: string | null;
};

export const confirmMenuResponseSchema = z.object({
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

export type ConfirmMenuResponse = z.infer<typeof confirmMenuResponseSchema>;

export function confirmMenuErrorMessage(status: number | undefined) {
  switch (status) {
    case 401:
      return "Your admin session has expired. Sign in again and retry.";
    case 403:
      return "You do not have permission to confirm menu imports.";
    case 409:
      return "The catalogue changed while this menu was being reviewed. Refresh the menu and retry.";
    default:
      return "The menu import could not be completed. Please retry.";
  }
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function exactCategoryMatch(
  sourceCategory: string | null,
  categories: ReviewCategory[]
) {
  if (!sourceCategory) return null;
  const sourceSlug = slugify(sourceCategory);
  return categories.find((category) => category.slug === sourceSlug) ?? null;
}

export function buildMenuReviewItems(
  items: ExternalMenuItem[],
  brandId: string,
  products: ReviewProduct[],
  categories: ReviewCategory[]
): MenuReviewItem[] {
  const brandProducts = products.filter(
    (product) => product.brandId === brandId
  );

  return items.map((item) => {
    const generatedSlug = slugify(item.name);
    const exactProduct = brandProducts.find(
      (product) => product.slug === generatedSlug
    );
    const sameNameProduct = brandProducts.find(
      (product) => normalized(product.name) === normalized(item.name)
    );
    const matchedProduct = exactProduct ?? sameNameProduct ?? null;
    const duplicateStatus: DuplicateStatus = exactProduct
      ? "existing"
      : sameNameProduct
        ? "possible-match"
        : "new";
    const sourceCategory = exactCategoryMatch(item.sourceCategory, categories);

    return {
      ...item,
      selected: duplicateStatus === "new",
      duplicateStatus,
      matchedProductId: matchedProduct?.id ?? null,
      matchedProductName: matchedProduct?.name ?? null,
      targetCategoryId:
        duplicateStatus === "existing"
          ? (matchedProduct?.categoryId ?? null)
          : (sourceCategory?.id ?? null)
    };
  });
}

export function toggleMenuReviewItem(
  items: MenuReviewItem[],
  externalItemId: string
) {
  return items.map((item) =>
    item.externalItemId === externalItemId
      ? { ...item, selected: !item.selected }
      : item
  );
}

export function setAllMenuReviewSelection(
  items: MenuReviewItem[],
  selected: boolean
) {
  return items.map((item) => ({ ...item, selected }));
}

export function reviewValidation(items: MenuReviewItem[]) {
  const selectedItems = items.filter((item) => item.selected);
  const selectedWithoutCategory = selectedItems.filter(
    (item) => !item.targetCategoryId
  );

  return {
    selectedCount: selectedItems.length,
    selectedWithoutCategory,
    isReady: selectedWithoutCategory.length === 0
  };
}

export function formatSourcePrice(
  price: ExternalMenuItem["price"],
  locale = "en-NZ"
) {
  if (!price) return "Not provided";

  const amount = price.amountMinor / 100;
  if (!price.currency) return `${amount.toFixed(2)} (currency unavailable)`;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency
  }).format(amount);
}

export function externalMenuErrorMessage(status: number | undefined) {
  switch (status) {
    case 401:
      return "Your admin session has expired. Sign in again and retry.";
    case 403:
      return "You do not have permission to load external menus.";
    case 404:
      return "This store is not connected to Uber Eats.";
    case 502:
      return "Uber Eats returned a menu that could not be used. Try again later.";
    case 503:
      return "Uber Eats is temporarily unavailable. Please retry shortly.";
    default:
      return "The external menu could not be loaded. Please try again.";
  }
}
