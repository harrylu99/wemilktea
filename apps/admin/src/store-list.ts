import type { StoreManagementListItem } from "@wemilktea/validation";

export type ManagedStore = StoreManagementListItem & { brandName: string };

export function filterManagedStores(
  stores: ManagedStore[],
  {
    query,
    publicationStatus,
    brandId,
    suburb
  }: {
    query: string;
    publicationStatus: "all" | "draft" | "published" | "archived";
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
