import {
  brandOptionSchema,
  productLocationManagementRowSchema,
  productManagementInputSchema,
  productManagementListItemSchema,
  type BrandOption
} from "@wemilktea/validation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import {
  ImageStorageError,
  managedImageUrl,
  removeProductImage,
  uploadProductImage,
  type ManagedImage
} from "./image-storage";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1)
});
type CategoryOption = z.infer<typeof categorySchema>;

const productDetailSchema = productManagementListItemSchema.extend({
  discovery_tags: z.array(z.string()),
  brands: z.object({ name: z.string().min(1), slug: z.string().min(1) }),
  categories: z.object({ name: z.string().min(1), slug: z.string().min(1) })
});

const locationOptionSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  display_name: z.string().min(1),
  suburb: z.string().min(1),
  publication_status: z.enum(["draft", "published", "archived"])
});
type LocationOption = z.infer<typeof locationOptionSchema>;

const managedImageRowSchema = z.object({
  image_id: z.string().uuid(),
  is_primary: z.boolean(),
  image_assets: z.union([
    z.object({
      id: z.string().uuid(),
      storage_key: z.string().min(1),
      alt_text: z.string().nullable(),
      content_type: z.string().nullable(),
      byte_size: z.number().nullable()
    }),
    z.array(
      z.object({
        id: z.string().uuid(),
        storage_key: z.string().min(1),
        alt_text: z.string().nullable(),
        content_type: z.string().nullable(),
        byte_size: z.number().nullable()
      })
    )
  ])
});

type ProductForm = {
  brandId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  discoveryTags: string;
  isSeasonal: boolean;
};

type AvailabilityDraft = {
  status: "available" | "unavailable" | "unknown";
  price: string;
  exists: boolean;
};

function friendlyProductError(message: string | undefined) {
  switch (message) {
    case "product_not_found":
      return "This product is no longer available.";
    case "brand_not_found":
      return "The selected brand is no longer available.";
    case "category_not_found":
      return "The selected category is no longer available.";
    case "product_slug_already_exists":
      return "That product slug is already in use for this brand.";
    case "stale_product_update":
      return "This product changed elsewhere. Reload it before saving again.";
    case "product_missing_publish_requirements":
      return "Add a valid brand, category, name, and slug before publishing.";
    case "product_already_published":
      return "This product is already published.";
    case "product_not_published":
      return "This product is not currently published.";
    case "product_location_brand_mismatch":
      return "Only locations belonging to the product brand can be linked.";
    case "invalid_product_location_data":
      return "Check the availability and price values and try again.";
    default:
      return message?.includes("foreign key")
        ? "Save the product after resolving its existing location relationships."
        : "The product could not be updated. Please try again.";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function PageState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function formFromProduct(
  product: z.infer<typeof productDetailSchema>
): ProductForm {
  return {
    brandId: product.brand_id,
    categoryId: product.category_id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    discoveryTags: product.discovery_tags.join(", "),
    isSeasonal: product.is_seasonal
  };
}

function parseProductForm(form: ProductForm) {
  return productManagementInputSchema.safeParse({
    brandId: form.brandId,
    categoryId: form.categoryId,
    name: form.name,
    slug: form.slug,
    description: form.description || undefined,
    discoveryTags: form.discoveryTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    isSeasonal: form.isSeasonal
  });
}

function normalizeManagedImage(value: unknown): ManagedImage | null {
  const parsed = managedImageRowSchema.safeParse(value);
  if (!parsed.success || !parsed.data.is_primary) return null;
  const asset = Array.isArray(parsed.data.image_assets)
    ? parsed.data.image_assets[0]
    : parsed.data.image_assets;
  if (!asset) return null;
  return {
    id: asset.id,
    storageKey: asset.storage_key,
    altText: asset.alt_text,
    contentType: asset.content_type,
    byteSize: asset.byte_size
  };
}

export function ProductsPage() {
  const [products, setProducts] = useState<
    z.infer<typeof productManagementListItemSchema>[]
  >([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await supabase
      .from("products")
      .select(
        "id, brand_id, category_id, name, slug, description, is_seasonal, is_published, created_at, updated_at, brands!inner(name, slug), categories!inner(name, slug)"
      )
      .order("updated_at", { ascending: false });
    const parsed = productManagementListItemSchema
      .array()
      .safeParse(result.data);
    if (result.error || !parsed.success) {
      setErrorMessage("Products could not be loaded. Please try again.");
    } else {
      setProducts(parsed.data);
      setErrorMessage(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !normalizedQuery ||
        `${product.name} ${product.slug} ${product.brands.name} ${product.categories.name}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus =
        status === "all" ||
        (status === "published" ? product.is_published : !product.is_published);
      return matchesQuery && matchesStatus;
    });
  }, [products, query, status]);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the canonical drink catalogue used by future public
            experiences.
          </p>
        </div>
        <Link
          className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          to="/products/new"
        >
          + Add product
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <label
          className="min-w-[18rem] flex-1 text-sm font-medium"
          htmlFor="product-search"
        >
          Search products
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="product-search"
            placeholder="Name, brand, category, or slug"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="w-44 text-sm font-medium" htmlFor="product-status">
          Status
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="product-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? <PageState message="Loading products…" /> : null}
        {errorMessage ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleProducts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No products match these filters.
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleProducts.length > 0 ? (
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={product.id}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {product.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3">{product.brands.name}</td>
                  <td className="px-4 py-3">{product.categories.name}</td>
                  <td className="px-4 py-3 capitalize">
                    {product.is_published ? "Published" : "Draft"}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(product.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                      to={`/products/${product.id}`}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}

export function ProductManagementPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const isNew = productId === "new";
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [product, setProduct] = useState<z.infer<
    typeof productDetailSchema
  > | null>(null);
  const [form, setForm] = useState<ProductForm>({
    brandId: "",
    categoryId: "",
    name: "",
    slug: "",
    description: "",
    discoveryTags: "",
    isSeasonal: false
  });
  const [initialForm, setInitialForm] = useState<ProductForm>(form);
  const [image, setImage] = useState<ManagedImage | null>(null);
  const [imageAltText, setImageAltText] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [availability, setAvailability] = useState<
    Record<string, AvailabilityDraft>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isChangingImage, setIsChangingImage] = useState(false);
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [brandsResult, categoriesResult, locationsResult] = await Promise.all(
      [
        supabase.from("brands").select("id, name, slug").order("name"),
        supabase
          .from("categories")
          .select("id, name, slug")
          .order("sort_order"),
        supabase
          .from("locations")
          .select("id, brand_id, display_name, suburb, publication_status")
          .order("display_name")
      ]
    );
    const parsedBrands = brandOptionSchema.array().safeParse(brandsResult.data);
    const parsedCategories = categorySchema
      .array()
      .safeParse(categoriesResult.data);
    const parsedLocations = locationOptionSchema
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
      setErrorMessage("Product options could not be loaded. Please try again.");
      setIsLoading(false);
      return;
    }
    setBrands(parsedBrands.data);
    setCategories(parsedCategories.data);
    setLocations(parsedLocations.data);

    if (isNew) {
      setForm((current) => ({
        ...current,
        brandId: current.brandId || parsedBrands.data[0]?.id || "",
        categoryId: current.categoryId || parsedCategories.data[0]?.id || ""
      }));
      setIsLoading(false);
      return;
    }

    if (!productId) {
      setErrorMessage("Product not found.");
      setIsLoading(false);
      return;
    }
    const [productResult, imageResult, relationshipResult] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, brand_id, category_id, name, slug, description, discovery_tags, is_seasonal, is_published, created_at, updated_at, brands!inner(name, slug), categories!inner(name, slug)"
        )
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("product_images")
        .select(
          "image_id, is_primary, image_assets(id, storage_key, alt_text, content_type, byte_size)"
        )
        .eq("product_id", productId)
        .eq("is_primary", true)
        .maybeSingle(),
      supabase
        .from("location_products")
        .select(
          "location_id, product_id, brand_id, price_cents, currency, availability_status, last_verified_at, source_provenance, source_reference, locations!inner(id, display_name, suburb, publication_status)"
        )
        .eq("product_id", productId)
    ]);
    const parsedProduct = productDetailSchema.safeParse(productResult.data);
    const parsedRelationships = productLocationManagementRowSchema
      .array()
      .safeParse(relationshipResult.data);
    const managedImage = imageResult.data
      ? normalizeManagedImage(imageResult.data)
      : null;
    if (
      productResult.error ||
      imageResult.error ||
      relationshipResult.error ||
      !parsedProduct.success ||
      !parsedRelationships.success ||
      (imageResult.data && !managedImage)
    ) {
      setErrorMessage("Product details could not be loaded. Please try again.");
    } else {
      const nextForm = formFromProduct(parsedProduct.data);
      const nextAvailability: Record<string, AvailabilityDraft> = {};
      parsedRelationships.data.forEach((row) => {
        nextAvailability[row.location_id] = {
          status: row.availability_status,
          price: row.price_cents === null ? "" : String(row.price_cents),
          exists: true
        };
      });
      setProduct(parsedProduct.data);
      setForm(nextForm);
      setInitialForm(nextForm);
      setAvailability(nextAvailability);
      setImage(managedImage);
      setImageAltText(managedImage?.altText ?? "");
      setErrorMessage(null);
    }
    setIsLoading(false);
  }, [isNew, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const selectedBrand = form.brandId;
  const eligibleLocations = useMemo(
    () => locations.filter((location) => location.brand_id === selectedBrand),
    [locations, selectedBrand]
  );

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const setField = <K extends keyof ProductForm>(
    field: K,
    value: ProductForm[K]
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const parsed = parseProductForm(form);
    if (!parsed.success) {
      setErrorMessage(
        "Check the product name, slug, brand, category, and description."
      );
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    const input = parsed.data;
    const result = isNew
      ? await supabase.rpc("create_product_management", {
          p_brand_id: input.brandId,
          p_category_id: input.categoryId,
          p_name: input.name,
          p_slug: input.slug,
          p_description: input.description ?? null,
          p_discovery_tags: input.discoveryTags,
          p_is_seasonal: input.isSeasonal
        })
      : await supabase.rpc("update_product_management", {
          p_product_id: product?.id,
          p_expected_updated_at: product?.updated_at,
          p_brand_id: input.brandId,
          p_category_id: input.categoryId,
          p_name: input.name,
          p_slug: input.slug,
          p_description: input.description ?? null,
          p_discovery_tags: input.discoveryTags,
          p_is_seasonal: input.isSeasonal
        });
    setIsSaving(false);
    if (result.error) {
      setErrorMessage(friendlyProductError(result.error.message));
      return;
    }
    if (isNew && typeof result.data === "string") {
      navigate(`/products/${result.data}`, { replace: true });
      return;
    }
    setSuccessMessage("Product saved.");
    await load();
  };

  const changePublication = async (action: "publish" | "unpublish") => {
    if (!supabase || !product) return;
    const message =
      action === "publish"
        ? "Publish this product? It will become available to public catalogue queries."
        : "Unpublish this product? It will no longer appear in public catalogue queries.";
    if (!window.confirm(message)) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsPublishing(true);
    const result = await supabase.rpc(
      action === "publish" ? "publish_product" : "unpublish_product",
      { p_product_id: product.id }
    );
    setIsPublishing(false);
    if (result.error) {
      setErrorMessage(friendlyProductError(result.error.message));
      return;
    }
    setSuccessMessage(
      action === "publish"
        ? "Product published."
        : "Product unpublished to draft."
    );
    await load();
  };

  const updateAvailability = (
    locationId: string,
    field: "status" | "price",
    value: string
  ) => {
    setAvailability((current) => ({
      ...current,
      [locationId]: {
        status: current[locationId]?.status ?? "unknown",
        price: current[locationId]?.price ?? "",
        exists: current[locationId]?.exists ?? false,
        [field]: value
      }
    }));
  };

  const saveAvailability = async (locationId: string) => {
    if (!supabase || !product) return;
    const draft = availability[locationId] ?? {
      status: "unknown",
      price: "",
      exists: false
    };
    if (!draft.exists && draft.status === "unknown" && !draft.price) return;
    const price = draft.price.trim() ? Number(draft.price) : null;
    if (
      price !== null &&
      (!Number.isInteger(price) || price < 0 || price > 100000)
    ) {
      setErrorMessage(
        "Enter a non-negative price in cents, for example 750 for $7.50."
      );
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavingLocationId(locationId);
    const result = await supabase.rpc("set_product_location_availability", {
      p_product_id: product.id,
      p_location_id: locationId,
      p_availability_status: draft.status,
      p_price_cents: price,
      p_currency: "NZD",
      p_source_provenance: "wemilktea",
      p_source_reference: null,
      p_last_verified_at: new Date().toISOString()
    });
    setSavingLocationId(null);
    if (result.error) {
      setErrorMessage(friendlyProductError(result.error.message));
      return;
    }
    setAvailability((current) => ({
      ...current,
      [locationId]: { ...draft, exists: true }
    }));
    setSuccessMessage("Location availability saved.");
  };

  const uploadImage = async () => {
    if (!product || !selectedImageFile) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image first.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingImage(true);
    try {
      await uploadProductImage({
        productId: product.id,
        file: selectedImageFile,
        altText: imageAltText
      });
      setSelectedImageFile(null);
      setSuccessMessage("Product image saved.");
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof ImageStorageError
          ? error.message
          : "The product image could not be saved."
      );
    } finally {
      setIsChangingImage(false);
    }
  };

  const removeImage = async () => {
    if (!product || !image) return;
    if (
      !window.confirm(
        "Remove this product image? The public fallback will be used."
      )
    )
      return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingImage(true);
    try {
      await removeProductImage(product.id);
      setImage(null);
      setImageAltText("");
      setSuccessMessage("Product image removed.");
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof ImageStorageError
          ? error.message
          : "The product image could not be removed."
      );
    } finally {
      setIsChangingImage(false);
    }
  };

  if (isLoading) return <PageState message="Loading product…" />;
  if (!isNew && !product)
    return <PageState message={errorMessage ?? "Product not found."} />;

  return (
    <section className="max-w-5xl">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        to="/products"
      >
        ← Products
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {isNew ? "Add product" : product?.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Canonical drink catalogue management.
          </p>
        </div>
        {product ? (
          <p className="rounded-full bg-muted px-3 py-1 text-sm font-medium capitalize">
            {product.is_published ? "Published" : "Draft"}
          </p>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 text-sm text-primary" role="status">
          {successMessage}
        </p>
      ) : null}

      <form
        className="mt-8 rounded-lg border border-border bg-card p-5"
        onSubmit={save}
      >
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          CANONICAL PRODUCT DATA
        </p>
        <h2 className="mt-1 text-lg font-semibold">Product information</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="product-brand">
            Brand
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-brand"
              value={form.brandId}
              onChange={(event) => setField("brandId", event.target.value)}
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="product-category">
            Category
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-category"
              value={form.categoryId}
              onChange={(event) => setField("categoryId", event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium" htmlFor="product-name">
            Product name
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-name"
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="product-slug">
            Slug
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-slug"
              value={form.slug}
              onChange={(event) => setField("slug", event.target.value)}
            />
          </label>
          <label
            className="text-sm font-medium sm:col-span-2"
            htmlFor="product-description"
          >
            Description
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-description"
              maxLength={2000}
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="product-tags">
            Discovery tags
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="product-tags"
              placeholder="brown-sugar, pearls"
              value={form.discoveryTags}
              onChange={(event) =>
                setField("discoveryTags", event.target.value)
              }
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Comma-separated catalogue tags.
            </span>
          </label>
          <label
            className="flex items-center gap-2 pt-7 text-sm font-medium"
            htmlFor="product-seasonal"
          >
            <input
              checked={form.isSeasonal}
              id="product-seasonal"
              type="checkbox"
              onChange={(event) => setField("isSeasonal", event.target.checked)}
            />{" "}
            Seasonal product
          </label>
        </div>
        <button
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={!isDirty || isSaving || isPublishing}
          type="submit"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </form>

      {!isNew && product ? (
        <>
          <section className="mt-8 rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              PRODUCT IMAGE
            </p>
            <h2 className="mt-1 text-lg font-semibold">Primary image</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a WeMilktea-owned or explicitly permitted image. Google photos
              are not copied into R2.
            </p>
            {image ? (
              <div className="mt-4 flex flex-wrap items-start gap-4">
                <div className="grid h-32 w-48 place-items-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
                  {managedImageUrl(image) ? (
                    <img
                      alt={image.altText ?? `${product.name} product`}
                      className="h-full w-full rounded-md object-cover"
                      src={managedImageUrl(image) ?? undefined}
                    />
                  ) : (
                    "Image URL is not configured"
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{image.contentType ?? "Image"}</p>
                  {image.byteSize ? (
                    <p>{Math.round(image.byteSize / 1024)} KB</p>
                  ) : null}
                  <button
                    className="mt-3 rounded-md border border-destructive px-3 py-2 font-medium text-destructive disabled:opacity-60"
                    disabled={isChangingImage}
                    type="button"
                    onClick={() => void removeImage()}
                  >
                    {isChangingImage ? "Removing…" : "Remove image"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No product image attached. Public consumers will use their
                fallback.
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label
                className="text-sm font-medium"
                htmlFor="product-image-file"
              >
                {image ? "Replace image" : "Choose image"}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-1 block w-full text-sm"
                  id="product-image-file"
                  type="file"
                  onChange={(event) =>
                    setSelectedImageFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <label
                className="text-sm font-medium"
                htmlFor="product-image-alt"
              >
                Alt text (optional)
                <input
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  id="product-image-alt"
                  maxLength={200}
                  value={imageAltText}
                  onChange={(event) => setImageAltText(event.target.value)}
                />
              </label>
            </div>
            {selectedImageFile ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Selected: {selectedImageFile.name} (
                {Math.round(selectedImageFile.size / 1024)} KB)
              </p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              disabled={!selectedImageFile || isChangingImage}
              type="button"
              onClick={() => void uploadImage()}
            >
              {isChangingImage
                ? "Uploading…"
                : image
                  ? "Replace image"
                  : "Upload image"}
            </button>
          </section>

          <section className="mt-8 rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              LOCATION AVAILABILITY
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Where is this drink offered?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Availability is catalogue information, not live inventory. Only
              canonical locations belonging to the selected brand are shown.
            </p>
            <div className="mt-5 space-y-3">
              {eligibleLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No canonical locations exist for this brand yet.
                </p>
              ) : (
                eligibleLocations.map((location) => {
                  const draft = availability[location.id] ?? {
                    status: "unknown",
                    price: "",
                    exists: false
                  };
                  return (
                    <div
                      className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_10rem_9rem_auto] md:items-end"
                      key={location.id}
                    >
                      <div>
                        <p className="font-medium">{location.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {location.suburb} ·{" "}
                          {statusLabel(location.publication_status)}
                        </p>
                      </div>
                      <label
                        className="text-sm font-medium"
                        htmlFor={`availability-${location.id}`}
                      >
                        Availability
                        <select
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          id={`availability-${location.id}`}
                          value={draft.status}
                          onChange={(event) =>
                            updateAvailability(
                              location.id,
                              "status",
                              event.target.value
                            )
                          }
                        >
                          <option value="unknown">Not listed</option>
                          <option value="available">Available</option>
                          <option value="unavailable">Unavailable</option>
                        </select>
                      </label>
                      <label
                        className="text-sm font-medium"
                        htmlFor={`price-${location.id}`}
                      >
                        Price (cents)
                        <input
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          id={`price-${location.id}`}
                          inputMode="numeric"
                          placeholder="750"
                          value={draft.price}
                          onChange={(event) =>
                            updateAvailability(
                              location.id,
                              "price",
                              event.target.value
                            )
                          }
                        />
                      </label>
                      <button
                        className="rounded-md border border-border px-3 py-2 text-sm font-medium disabled:opacity-60"
                        disabled={savingLocationId === location.id}
                        type="button"
                        onClick={() => void saveAvailability(location.id)}
                      >
                        {savingLocationId === location.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-8 rounded-lg border border-border bg-card p-5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">
              PUBLICATION
            </p>
            <h2 className="mt-1 text-lg font-semibold">Public visibility</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Publishing requires a valid brand, category, name, and slug.
              Images and location availability are not required.
            </p>
            {product.is_published ? (
              <button
                className="mt-4 rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive disabled:opacity-60"
                disabled={isPublishing || isDirty}
                type="button"
                onClick={() => void changePublication("unpublish")}
              >
                {isPublishing ? "Unpublishing…" : "Unpublish product"}
              </button>
            ) : (
              <button
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                disabled={isPublishing || isDirty}
                type="button"
                onClick={() => void changePublication("publish")}
              >
                {isPublishing ? "Publishing…" : "Publish product"}
              </button>
            )}
            {isDirty ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Save canonical changes before changing publication.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
