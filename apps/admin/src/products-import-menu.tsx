import {
  brandOptionSchema,
  locationOptionSchema,
  type BrandOption
} from "@wemilktea/validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import {
  buildMenuReviewItems,
  confirmMenuErrorMessage,
  confirmMenuResponseSchema,
  externalMenuErrorMessage,
  externalMenuResponseSchema,
  formatSourcePrice,
  reviewValidation,
  setAllMenuReviewSelection,
  toggleMenuReviewItem,
  type ExternalMenuResponse,
  type MenuReviewItem,
  type ReviewCategory,
  type ReviewProduct
} from "./menu-review";
import { LoadingRegion, ManagementTableSkeleton, Skeleton } from "./loading";

const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1)
});

const locationWithBrandSchema = locationOptionSchema.extend({
  brand_id: z.string().uuid()
});

const productSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1)
});

type AdminLocation = z.infer<typeof locationWithBrandSchema>;

function functionErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; context?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (
    candidate.context &&
    typeof candidate.context === "object" &&
    "status" in candidate.context &&
    typeof candidate.context.status === "number"
  ) {
    return candidate.context.status;
  }
  return undefined;
}

function duplicateLabel(status: MenuReviewItem["duplicateStatus"]) {
  switch (status) {
    case "existing":
      return "Existing product";
    case "possible-match":
      return "Possible match";
    default:
      return "New product";
  }
}

function SourceImage({ item }: { item: MenuReviewItem }) {
  const [failed, setFailed] = useState(false);

  if (!item.imageUrl || failed) {
    return (
      <span className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-border bg-muted px-1 text-center text-[0.65rem] text-muted-foreground">
        No preview
      </span>
    );
  }

  return (
    <img
      alt={`Source preview for ${item.name}`}
      className="h-16 w-16 rounded-md border border-border object-cover"
      src={item.imageUrl}
      onError={() => setFailed(true)}
    />
  );
}

function ReferenceSkeleton() {
  return (
    <LoadingRegion label="Loading import options" className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </LoadingRegion>
  );
}

export function ProductsImportMenuPage() {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [categories, setCategories] = useState<ReviewCategory[]>([]);
  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [brandId, setBrandId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [source, setSource] = useState<"uber_eats">("uber_eats");
  const [menu, setMenu] = useState<ExternalMenuResponse | null>(null);
  const [reviewItems, setReviewItems] = useState<MenuReviewItem[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isFetchingMenu, setIsFetchingMenu] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(
    null
  );
  const [confirmationResult, setConfirmationResult] = useState<ReturnType<
    typeof confirmMenuResponseSchema.parse
  > | null>(null);
  const productsRequestId = useRef(0);

  const loadReferences = useCallback(async () => {
    if (!supabase) {
      setReferenceError(supabaseConfigurationError);
      setIsLoadingReferences(false);
      return;
    }

    setIsLoadingReferences(true);
    const [brandsResult, categoriesResult, locationsResult] = await Promise.all(
      [
        supabase.from("brands").select("id, name, slug").order("name"),
        supabase
          .from("categories")
          .select("id, name, slug")
          .order("sort_order"),
        supabase
          .from("locations")
          .select(
            "id, display_name, slug, suburb, publication_status, google_place_id, brand_id"
          )
          .order("display_name")
      ]
    );
    const parsedBrands = brandOptionSchema.array().safeParse(brandsResult.data);
    const parsedCategories = categorySchema
      .array()
      .safeParse(categoriesResult.data);
    const parsedLocations = locationWithBrandSchema
      .array()
      .safeParse(locationsResult.data);

    if (
      brandsResult.error ||
      categoriesResult.error ||
      locationsResult.error ||
      !parsedBrands.success ||
      !parsedCategories.success ||
      !parsedLocations.success
    ) {
      setReferenceError(
        "Import options could not be loaded. Please try again."
      );
    } else {
      setBrands(parsedBrands.data);
      setCategories(parsedCategories.data);
      setLocations(parsedLocations.data);
      setReferenceError(null);
    }
    setIsLoadingReferences(false);
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  const loadProducts = useCallback(async () => {
    const requestId = productsRequestId.current + 1;
    productsRequestId.current = requestId;
    if (!supabase || !brandId) {
      setProducts([]);
      setProductsError(null);
      setIsLoadingProducts(false);
      return [] as ReviewProduct[];
    }

    setIsLoadingProducts(true);
    setProductsError(null);
    const result = await supabase
      .from("products")
      .select("id, brand_id, category_id, name, slug")
      .eq("brand_id", brandId)
      .order("slug");
    if (requestId !== productsRequestId.current) return null;
    const parsed = productSchema.array().safeParse(result.data);

    if (result.error || !parsed.success) {
      setProductsError(
        "Existing products could not be checked. Please try again."
      );
      setProducts([]);
      setIsLoadingProducts(false);
      return null;
    }

    const nextProducts = parsed.data.map((product) => ({
      id: product.id,
      brandId: product.brand_id,
      categoryId: product.category_id,
      name: product.name,
      slug: product.slug
    }));
    setProducts(nextProducts);
    setProductsError(null);
    setIsLoadingProducts(false);
    return nextProducts;
  }, [brandId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const eligibleLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.brand_id === brandId &&
          location.publication_status !== "archived"
      ),
    [brandId, locations]
  );
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const selectedLocation = eligibleLocations.find(
    (location) => location.id === locationId
  );
  const validation = reviewValidation(reviewItems);

  const resetReview = () => {
    setMenu(null);
    setReviewItems([]);
    setMenuError(null);
    setConfirmationError(null);
    setConfirmationResult(null);
  };

  const handleBrandChange = (nextBrandId: string) => {
    setBrandId(nextBrandId);
    setLocationId("");
    setProducts([]);
    setProductsError(null);
    resetReview();
  };

  const handleLocationChange = (nextLocationId: string) => {
    setLocationId(nextLocationId);
    resetReview();
  };

  const fetchMenu = async () => {
    if (!supabase || !brandId || !locationId || isFetchingMenu) return;

    setIsFetchingMenu(true);
    setMenuError(null);
    setConfirmationError(null);
    setConfirmationResult(null);
    setMenu(null);
    setReviewItems([]);
    const result = await supabase.functions.invoke("external-menu", {
      body: { locationId }
    });
    const parsed = externalMenuResponseSchema.safeParse(result.data);

    if (result.error) {
      setMenuError(externalMenuErrorMessage(functionErrorStatus(result.error)));
    } else if (!parsed.success || parsed.data.locationId !== locationId) {
      setMenuError(
        "The external menu response was not usable. Please try again."
      );
    } else {
      setMenu(parsed.data);
      setReviewItems(
        buildMenuReviewItems(parsed.data.items, brandId, products, categories)
      );
    }
    setIsFetchingMenu(false);
  };

  const confirmImport = async () => {
    if (
      !supabase ||
      !menu ||
      !locationId ||
      validation.selectedCount === 0 ||
      !validation.isReady ||
      isConfirming
    ) {
      return;
    }

    setIsConfirming(true);
    setConfirmationError(null);
    setConfirmationResult(null);
    try {
      const selectedItems = reviewItems
        .filter((item) => item.selected)
        .map((item) => ({
          externalItemId: item.externalItemId,
          name: item.name,
          description: item.description,
          targetCategoryId: item.targetCategoryId
        }));
      const result = await supabase.functions.invoke("confirm-menu-import", {
        body: {
          locationId,
          provider: source,
          items: selectedItems
        }
      });
      const parsed = confirmMenuResponseSchema.safeParse(result.data);

      if (result.error) {
        setConfirmationError(
          confirmMenuErrorMessage(functionErrorStatus(result.error))
        );
      } else if (!parsed.success) {
        setConfirmationError("The menu import returned an invalid result.");
      } else {
        setConfirmationResult(parsed.data);
        if (parsed.data.status === "success") {
          const refreshedProducts = await loadProducts();
          if (refreshedProducts) {
            setReviewItems(
              buildMenuReviewItems(
                menu.items,
                brandId,
                refreshedProducts,
                categories
              )
            );
          }
        }
      }
    } catch {
      setConfirmationError(
        "The menu import could not be completed. Please retry."
      );
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoadingReferences) return <ReferenceSkeleton />;

  return (
    <section className="max-w-6xl">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        to="/products"
      >
        ← Products
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Import menu</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Review a connected provider menu before WM-54 prepares canonical
            products. Fetching and reviewing never writes catalogue data.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
          Review only
        </span>
      </div>

      {referenceError ? (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-card p-4">
          <p className="text-sm text-destructive" role="alert">
            {referenceError}
          </p>
          <button
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
            type="button"
            onClick={() => void loadReferences()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          1. MENU SOURCE
        </p>
        <h2 className="mt-1 text-lg font-semibold">Choose a store</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium" htmlFor="import-brand">
            Brand
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isFetchingMenu || isConfirming}
              id="import-brand"
              value={brandId}
              onChange={(event) => handleBrandChange(event.target.value)}
            >
              <option value="">Choose a brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="import-store">
            Store
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!brandId || isFetchingMenu || isConfirming}
              id="import-store"
              value={locationId}
              onChange={(event) => handleLocationChange(event.target.value)}
            >
              <option value="">
                {brandId ? "Choose a store" : "Choose a brand first"}
              </option>
              {eligibleLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.display_name} · {location.suburb}
                </option>
              ))}
            </select>
            {brandId && eligibleLocations.length === 0 ? (
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                No active canonical stores are available for this brand.
              </span>
            ) : null}
          </label>
          <label className="text-sm font-medium" htmlFor="import-source">
            Source
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isFetchingMenu || isConfirming}
              id="import-source"
              value={source}
              onChange={(event) => {
                const nextSource = event.target.value as typeof source;
                setSource(nextSource);
                resetReview();
              }}
            >
              <option value="uber_eats">Uber Eats</option>
            </select>
          </label>
        </div>
        {productsError ? (
          <div className="mt-4 rounded-md border border-destructive/40 p-3">
            <p className="text-sm text-destructive" role="alert">
              {productsError}
            </p>
            <button
              className="mt-2 rounded-md border border-border px-3 py-2 text-sm font-medium"
              type="button"
              onClick={() => void loadProducts()}
            >
              Retry product check
            </button>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              !brandId ||
              !locationId ||
              source !== "uber_eats" ||
              isFetchingMenu ||
              isLoadingProducts ||
              Boolean(productsError)
            }
            type="button"
            onClick={() => void fetchMenu()}
          >
            {isFetchingMenu
              ? "Fetching menu…"
              : menu
                ? "Fetch again"
                : "Fetch menu"}
          </button>
          {selectedBrand && selectedLocation ? (
            <span className="text-sm text-muted-foreground">
              {selectedBrand.name} · {selectedLocation.display_name}
            </span>
          ) : null}
        </div>
      </section>

      {menuError ? (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-card p-4">
          <p className="text-sm text-destructive" role="alert">
            {menuError}
          </p>
          <button
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
            disabled={isFetchingMenu}
            type="button"
            onClick={() => void fetchMenu()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {isFetchingMenu ? (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
          <ManagementTableSkeleton
            label="Fetching normalized Uber Eats menu"
            columnCount={6}
            minWidth="58rem"
            rows={5}
          />
        </div>
      ) : null}

      {menu && !isFetchingMenu ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                2. REVIEW NORMALIZED ITEMS
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {menu.items.length === 0
                  ? "No menu items returned"
                  : `${menu.items.length} menu item${menu.items.length === 1 ? "" : "s"}`}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing and possible matches start unselected. Confirmed items
                become draft canonical products only.
              </p>
            </div>
            {reviewItems.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                  type="button"
                  disabled={isConfirming}
                  onClick={() =>
                    setReviewItems((items) =>
                      setAllMenuReviewSelection(items, true)
                    )
                  }
                >
                  Select all
                </button>
                <button
                  className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                  type="button"
                  disabled={isConfirming}
                  onClick={() =>
                    setReviewItems((items) =>
                      setAllMenuReviewSelection(items, false)
                    )
                  }
                >
                  Deselect all
                </button>
              </div>
            ) : null}
          </div>

          {menu.warnings.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Review warning</p>
              <ul className="mt-1 list-disc pl-5">
                {menu.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {menu.items.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              This connected store returned an empty normalized menu. No
              products were created.
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-md border border-border bg-card p-4 text-sm">
                <span className="font-medium">Selected for WM-54: </span>
                {validation.selectedCount} of {reviewItems.length}
                {validation.selectedWithoutCategory.length > 0 ? (
                  <p className="mt-1 text-destructive" role="alert">
                    {validation.selectedWithoutCategory.length} selected item
                    {validation.selectedWithoutCategory.length === 1
                      ? ""
                      : "s"}{" "}
                    need a canonical category before they can proceed.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {reviewItems.map((item) => {
                  const categoryError = item.selected && !item.targetCategoryId;
                  const categoryErrorId = `category-error-${item.externalItemId}`;
                  return (
                    <article
                      className={`grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[auto_4.5rem_minmax(14rem,1.5fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(12rem,1fr)] md:items-start ${categoryError ? "border-destructive" : "border-border"}`}
                      key={item.externalItemId}
                    >
                      <div className="pt-1">
                        <input
                          aria-label={`Select ${item.name}`}
                          checked={item.selected}
                          type="checkbox"
                          disabled={isConfirming}
                          onChange={() =>
                            setReviewItems((items) =>
                              toggleMenuReviewItem(items, item.externalItemId)
                            )
                          }
                        />
                      </div>
                      <SourceImage item={item} />
                      <div>
                        <h3 className="font-medium">{item.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.description ?? "No description provided."}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {duplicateLabel(item.duplicateStatus)}
                          {item.matchedProductName
                            ? ` · ${item.matchedProductName}`
                            : null}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium">Source category</p>
                        <p className="mt-1 text-muted-foreground">
                          {item.sourceCategory ?? "Not provided"}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium">Source price</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatSourcePrice(item.price)}
                        </p>
                      </div>
                      <label
                        className="text-sm font-medium"
                        htmlFor={`category-${item.externalItemId}`}
                      >
                        WeMilktea category
                        <select
                          aria-describedby={
                            categoryError ? categoryErrorId : undefined
                          }
                          aria-invalid={categoryError}
                          className={`mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm ${categoryError ? "border-destructive" : "border-input"}`}
                          id={`category-${item.externalItemId}`}
                          value={item.targetCategoryId ?? ""}
                          disabled={isConfirming}
                          onChange={(event) => {
                            const targetCategoryId = event.target.value || null;
                            setReviewItems((items) =>
                              items.map((reviewItem) =>
                                reviewItem.externalItemId ===
                                item.externalItemId
                                  ? { ...reviewItem, targetCategoryId }
                                  : reviewItem
                              )
                            );
                          }}
                        >
                          <option value="">Choose a category</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                        {categoryError ? (
                          <span
                            className="mt-1 block text-xs font-normal text-destructive"
                            id={categoryErrorId}
                          >
                            Select a canonical category.
                          </span>
                        ) : null}
                      </label>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {confirmationError ? (
            <div className="mt-5 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive" role="alert">
                {confirmationError}
              </p>
            </div>
          ) : null}

          {confirmationResult ? (
            <div className="mt-5 rounded-md border border-border bg-card p-4 text-sm">
              <p className="font-medium">
                {confirmationResult.status === "success"
                  ? "Import complete"
                  : "Import needs review"}
              </p>
              <p className="mt-1 text-muted-foreground">
                Created: {confirmationResult.created.length} · Existing/reused:{" "}
                {confirmationResult.reused.length} · Failed:{" "}
                {confirmationResult.failed.length}
              </p>
              <p className="mt-1 text-muted-foreground">
                Newly created products remain drafts. Source prices and images
                are not stored.
              </p>
              {confirmationResult.failed.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-destructive">
                  {confirmationResult.failed.map((failure) => (
                    <li key={failure.externalItemId}>
                      {failure.externalItemId}: {failure.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <button
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              validation.selectedCount === 0 ||
              !validation.isReady ||
              isConfirming
            }
            type="button"
            onClick={() => void confirmImport()}
          >
            {isConfirming
              ? "Confirming import…"
              : `Import ${validation.selectedCount} draft product${validation.selectedCount === 1 ? "" : "s"}`}
          </button>

          <p className="mt-6 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Cancel or leave this page at any time. Confirming creates only the
            selected draft products and missing location relationships.
          </p>
        </section>
      ) : null}
    </section>
  );
}
