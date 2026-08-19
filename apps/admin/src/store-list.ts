import type { StoreManagementListItem } from "@wemilktea/validation";
import { formatStatusLabel } from "./lib/status-label";

export type ManagedStore = StoreManagementListItem & { brandName: string };

export const publicationFilters = [
  "all",
  "draft",
  "published",
  "archived"
] as const;
export type PublicationFilter = (typeof publicationFilters)[number];

export function publicationFilterLabel(status: PublicationFilter) {
  return status === "all" ? "All statuses" : formatStatusLabel(status);
}

export function filterManagedStores(
  stores: ManagedStore[],
  {
    query,
    publicationStatus,
    brandId,
    suburb
  }: {
    query: string;
    publicationStatus: PublicationFilter;
    brandId: string;
    suburb: string;
  }
) {
  const normalizedQuery = query.trim().toLowerCase();

  return stores.filter((store) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      `${store.display_name} ${store.brandName} ${store.suburb} ${store.slug}`
        .toLowerCase()
        .includes(normalizedQuery);

    return (
      matchesQuery &&
      (publicationStatus === "all" ||
        store.publication_status === publicationStatus) &&
      (!brandId || store.brand_id === brandId) &&
      (!suburb || store.suburb === suburb)
    );
  });
}
