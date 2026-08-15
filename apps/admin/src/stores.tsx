import {
  brandOptionSchema,
  type BrandOption,
  storeManagementDetailSchema,
  storeManagementListItemSchema,
  updateStoreManagementSchema
} from "@wemilktea/validation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import {
  managedImageUrl,
  removeStoreImage,
  uploadStoreImage,
  type ManagedImage,
  ImageStorageError
} from "./image-storage";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import { filterManagedStores, type ManagedStore } from "./store-list";

const publicationFilters = ["all", "draft", "published", "archived"] as const;
type PublicationFilter = (typeof publicationFilters)[number];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function PageState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

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

function friendlyStoreError(message: string | undefined) {
  switch (message) {
    case "location_not_found":
      return "This location is no longer available.";
    case "brand_not_found":
      return "The selected brand is no longer available.";
    case "stale_location_update":
      return "This store changed elsewhere. Reload it before saving again.";
    case "invalid_location_data":
      return "Check the canonical store details and try again.";
    case "location_missing_publish_requirements":
      return "Add a valid brand, name, slug, address, suburb, and coordinates before publishing.";
    case "location_already_published":
      return "This store is already published.";
    case "location_not_published":
      return "This store is not currently published.";
    case "location_not_publishable":
      return "Only draft stores can be published.";
    default:
      return message?.includes("duplicate key")
        ? "That slug is already in use. Choose a unique store slug."
        : "The store could not be updated. Please try again.";
  }
}

export function StoresPage() {
  const [stores, setStores] = useState<ManagedStore[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [query, setQuery] = useState("");
  const [publicationStatus, setPublicationStatus] =
    useState<PublicationFilter>("all");
  const [brandId, setBrandId] = useState("");
  const [suburb, setSuburb] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const [locationsResult, brandsResult] = await Promise.all([
        client
          .from("locations")
          .select(
            "id, brand_id, display_name, slug, suburb, publication_status, created_at, updated_at"
          )
          .order("updated_at", { ascending: false }),
        client.from("brands").select("id, name, slug").order("name")
      ]);
      const parsedLocations = storeManagementListItemSchema
        .array()
        .safeParse(locationsResult.data);
      const parsedBrands = brandOptionSchema
        .array()
        .safeParse(brandsResult.data);

      if (import.meta.env.DEV) {
        if (locationsResult.error) {
          console.error(
            "Stores locations request failed:",
            locationsResult.error.message
          );
        }
        if (brandsResult.error) {
          console.error(
            "Stores brands request failed:",
            brandsResult.error.message
          );
        }
        if (!parsedLocations.success) {
          console.error(
            "Invalid locations response:",
            parsedLocations.error.flatten()
          );
        }
        if (!parsedBrands.success) {
          console.error(
            "Invalid brands response:",
            parsedBrands.error.flatten()
          );
        }
      }

      if (
        locationsResult.error ||
        brandsResult.error ||
        !parsedLocations.success ||
        !parsedBrands.success
      ) {
        setErrorMessage("Stores could not be loaded. Please try again.");
      } else {
        const brandNames = new Map(
          parsedBrands.data.map((brand) => [brand.id, brand.name])
        );
        setBrands(parsedBrands.data);
        setStores(
          parsedLocations.data.map((location) => ({
            ...location,
            brandName: brandNames.get(location.brand_id) ?? "Unknown brand"
          }))
        );
      }

      setIsLoading(false);
    };

    void load();
  }, []);

  const suburbs = useMemo(
    () => [...new Set(stores.map((store) => store.suburb))].sort(),
    [stores]
  );
  const visibleStores = useMemo(
    () =>
      filterManagedStores(stores, {
        query,
        publicationStatus,
        brandId,
        suburb
      }),
    [stores, query, publicationStatus, brandId, suburb]
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold">Stores</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage canonical WeMilktea locations. Google content is not used here.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <label
          className="text-sm font-medium md:col-span-2"
          htmlFor="store-search"
        >
          Search stores
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="store-search"
            placeholder="Name, brand, suburb, or slug"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium" htmlFor="store-status-filter">
          Publication status
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="store-status-filter"
            value={publicationStatus}
            onChange={(event) =>
              setPublicationStatus(event.target.value as PublicationFilter)
            }
          >
            {publicationFilters.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="store-brand-filter">
          Brand
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="store-brand-filter"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="store-suburb-filter">
          Area
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id="store-suburb-filter"
            value={suburb}
            onChange={(event) => setSuburb(event.target.value)}
          >
            <option value="">All areas</option>
            {suburbs.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? <PageState message="Loading stores…" /> : null}
        {errorMessage ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleStores.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No canonical stores match these filters.
          </p>
        ) : null}
        {!isLoading && !errorMessage && visibleStores.length > 0 ? (
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleStores.map((store) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={store.id}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{store.display_name}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {store.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3">{store.brandName}</td>
                  <td className="px-4 py-3">{store.suburb}</td>
                  <td className="px-4 py-3 capitalize">
                    {statusLabel(store.publication_status)}
                  </td>
                  <td className="px-4 py-3">{formatDate(store.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                      to={`/stores/${store.id}`}
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

type StoreForm = {
  brandId: string;
  displayName: string;
  slug: string;
  suburb: string;
  address: string;
  latitude: string;
  longitude: string;
  sourceReference: string;
};

function formFromDetail(detail: {
  brand_id: string;
  display_name: string;
  slug: string;
  suburb: string;
  address: string;
  latitude: number;
  longitude: number;
  source_reference: string | null;
}): StoreForm {
  return {
    brandId: detail.brand_id,
    displayName: detail.display_name,
    slug: detail.slug,
    suburb: detail.suburb,
    address: detail.address,
    latitude: String(detail.latitude),
    longitude: String(detail.longitude),
    sourceReference: detail.source_reference ?? ""
  };
}

export function StoreManagementPage() {
  const { locationId } = useParams();
  const [detail, setDetail] = useState<ReturnType<
    typeof storeManagementDetailSchema.parse
  > | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [form, setForm] = useState<StoreForm | null>(null);
  const [initialForm, setInitialForm] = useState<StoreForm | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPublication, setIsChangingPublication] = useState(false);
  const [image, setImage] = useState<ManagedImage | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageAltText, setImageAltText] = useState("");
  const [isChangingImage, setIsChangingImage] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !locationId) {
      setErrorMessage(
        locationId ? supabaseConfigurationError : "Store not found."
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [detailResult, brandsResult, imageResult] = await Promise.all([
      supabase.rpc("get_location_management_detail", {
        p_location_id: locationId
      }),
      supabase.from("brands").select("id, name, slug").order("name"),
      supabase
        .from("location_images")
        .select(
          "image_id, is_primary, image_assets(id, storage_key, alt_text, content_type, byte_size)"
        )
        .eq("location_id", locationId)
        .eq("is_primary", true)
        .maybeSingle()
    ]);
    const parsedDetails = storeManagementDetailSchema
      .array()
      .safeParse(detailResult.data);
    const parsedBrands = brandOptionSchema.array().safeParse(brandsResult.data);
    const managedImage = imageResult.data
      ? normalizeManagedImage(imageResult.data)
      : null;

    if (
      detailResult.error ||
      brandsResult.error ||
      imageResult.error ||
      !parsedDetails.success ||
      !parsedBrands.success ||
      (imageResult.data && !managedImage)
    ) {
      setErrorMessage("Store details could not be loaded. Please try again.");
    } else if (!parsedDetails.data[0]) {
      setErrorMessage("Store not found or access is unavailable.");
    } else {
      const nextDetail = parsedDetails.data[0];
      const nextForm = formFromDetail(nextDetail);
      setDetail(nextDetail);
      setBrands(parsedBrands.data);
      setImage(managedImage);
      setImageAltText(managedImage?.altText ?? "");
      setForm(nextForm);
      setInitialForm(nextForm);
      setErrorMessage(null);
    }

    setIsLoading(false);
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = Boolean(
    form && initialForm && JSON.stringify(form) !== JSON.stringify(initialForm)
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

  const setField = (field: keyof StoreForm, value: string) => {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !detail || !form) return;

    const parsed = updateStoreManagementSchema.safeParse({
      locationId: detail.id,
      expectedUpdatedAt: detail.updated_at,
      brandId: form.brandId,
      location: {
        displayName: form.displayName,
        slug: form.slug,
        suburb: form.suburb,
        address: form.address,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        ...(form.sourceReference
          ? { sourceReference: form.sourceReference }
          : {})
      }
    });

    if (!parsed.success) {
      setErrorMessage("Check the canonical store details and try again.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    const input = parsed.data;
    const { error } = await supabase.rpc("update_location_management", {
      p_location_id: input.locationId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_brand_id: input.brandId,
      p_display_name: input.location.displayName,
      p_location_slug: input.location.slug,
      p_suburb: input.location.suburb,
      p_address: input.location.address,
      p_latitude: input.location.latitude,
      p_longitude: input.location.longitude,
      p_source_reference: input.location.sourceReference ?? null
    });
    setIsSaving(false);

    if (error) {
      setErrorMessage(friendlyStoreError(error.message));
      return;
    }

    setSuccessMessage("Canonical store data saved.");
    await load();
  };

  const changePublication = async (action: "publish" | "unpublish") => {
    if (!supabase || !detail) return;
    const message =
      action === "publish"
        ? "Publish this store? It will become available to the public WeMilktea application."
        : "Unpublish this store? It will no longer appear in public store results.";

    if (!window.confirm(message)) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingPublication(true);
    const { error } = await supabase.rpc(
      action === "publish" ? "publish_location" : "unpublish_location",
      { p_location_id: detail.id }
    );
    setIsChangingPublication(false);

    if (error) {
      setErrorMessage(friendlyStoreError(error.message));
      return;
    }

    setSuccessMessage(
      action === "publish" ? "Store published." : "Store unpublished to draft."
    );
    await load();
  };

  const uploadImage = async () => {
    if (!detail || !selectedImageFile) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image first.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingImage(true);
    try {
      await uploadStoreImage({
        locationId: detail.id,
        file: selectedImageFile,
        altText: imageAltText
      });
      setSelectedImageFile(null);
      setSuccessMessage("Store image saved.");
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof ImageStorageError
          ? error.message
          : "The store image could not be saved. Please try again."
      );
    } finally {
      setIsChangingImage(false);
    }
  };

  const removeImage = async () => {
    if (!detail || !image) return;
    if (
      !window.confirm(
        "Remove this store image? The public fallback will be used."
      )
    ) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsChangingImage(true);
    try {
      await removeStoreImage(detail.id);
      setImage(null);
      setImageAltText("");
      setSuccessMessage("Store image removed.");
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof ImageStorageError
          ? error.message
          : "The store image could not be removed. Please try again."
      );
    } finally {
      setIsChangingImage(false);
    }
  };

  if (isLoading) return <PageState message="Loading store…" />;
  if (!detail || !form)
    return <PageState message={errorMessage ?? "Store not found."} />;

  return (
    <section className="max-w-4xl">
      <Link
        className="text-sm font-medium text-primary hover:underline"
        to="/stores"
      >
        ← Stores
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{detail.display_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.brand_name}
          </p>
        </div>
        <p className="rounded-full bg-muted px-3 py-1 text-sm font-medium capitalize">
          {statusLabel(detail.publication_status)}
        </p>
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
          CANONICAL STORE DATA
        </p>
        <h2 className="mt-1 text-lg font-semibold">Store details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These are independently maintained WeMilktea values, not Google data.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="store-brand">
            Brand
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-brand"
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
          <label className="text-sm font-medium" htmlFor="store-display-name">
            Location name
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-display-name"
              placeholder="Enter location name"
              value={form.displayName}
              onChange={(event) => setField("displayName", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="store-slug">
            Slug
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-slug"
              placeholder="Enter store slug"
              value={form.slug}
              onChange={(event) => setField("slug", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="store-suburb">
            Suburb / area
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-suburb"
              placeholder="Enter suburb or area"
              value={form.suburb}
              onChange={(event) => setField("suburb", event.target.value)}
            />
          </label>
          <label
            className="text-sm font-medium sm:col-span-2"
            htmlFor="store-address"
          >
            Address
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-address"
              placeholder="Enter verified street address"
              value={form.address}
              onChange={(event) => setField("address", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="store-latitude">
            Latitude
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-latitude"
              inputMode="decimal"
              placeholder="Enter latitude"
              value={form.latitude}
              onChange={(event) => setField("latitude", event.target.value)}
            />
          </label>
          <label className="text-sm font-medium" htmlFor="store-longitude">
            Longitude
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-longitude"
              inputMode="decimal"
              placeholder="Enter longitude"
              value={form.longitude}
              onChange={(event) => setField("longitude", event.target.value)}
            />
          </label>
          <label
            className="text-sm font-medium sm:col-span-2"
            htmlFor="store-source-reference"
          >
            Independent verification URL (optional)
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-source-reference"
              value={form.sourceReference}
              onChange={(event) =>
                setField("sourceReference", event.target.value)
              }
            />
          </label>
        </div>
        <button
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={!isDirty || isSaving || isChangingPublication}
          type="submit"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          STORE IMAGE
        </p>
        <h2 className="mt-1 text-lg font-semibold">Owned image</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a WeMilktea-owned or explicitly permitted image. Google photos
          are not copied into R2.
        </p>
        {image ? (
          <div className="mt-4 flex flex-wrap items-start gap-4">
            {managedImageUrl(image) ? (
              <img
                alt={image.altText ?? `${detail.display_name} store`}
                className="h-32 w-48 rounded-md border border-border object-cover"
                src={managedImageUrl(image) ?? undefined}
              />
            ) : (
              <div className="grid h-32 w-48 place-items-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
                Image URL is not configured
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              <p>{image.contentType ?? "Image"}</p>
              {image.byteSize ? (
                <p>{Math.round(image.byteSize / 1024)} KB</p>
              ) : null}
              <button
                className="mt-3 rounded-md border border-destructive px-3 py-2 font-medium text-destructive disabled:opacity-60"
                disabled={isChangingImage || isSaving}
                type="button"
                onClick={() => void removeImage()}
              >
                {isChangingImage ? "Removing…" : "Remove image"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No owned image attached. The public app will use its safe fallback.
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="store-image-file">
            {image ? "Replace image" : "Choose image"}
            <input
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-sm"
              id="store-image-file"
              type="file"
              onChange={(event) =>
                setSelectedImageFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <label className="text-sm font-medium" htmlFor="store-image-alt">
            Alt text (optional)
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="store-image-alt"
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
          disabled={!selectedImageFile || isChangingImage || isSaving}
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
          PUBLICATION
        </p>
        <h2 className="mt-1 text-lg font-semibold">Public visibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.publication_status === "published"
            ? "This location is available to the public app."
            : "Publishing requires canonical brand, location, address, suburb, slug, and coordinates. Products and images are not required."}
        </p>
        {detail.publication_status === "draft" ? (
          <button
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={isChangingPublication || isSaving || isDirty}
            type="button"
            onClick={() => changePublication("publish")}
          >
            {isChangingPublication ? "Publishing…" : "Publish store"}
          </button>
        ) : null}
        {detail.publication_status === "published" ? (
          <button
            className="mt-4 rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive disabled:opacity-60"
            disabled={isChangingPublication || isSaving || isDirty}
            type="button"
            onClick={() => changePublication("unpublish")}
          >
            {isChangingPublication ? "Unpublishing…" : "Unpublish store"}
          </button>
        ) : null}
        {isDirty ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Save canonical changes before changing publication.
          </p>
        ) : null}
      </section>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          EXTERNAL IDENTITY
        </p>
        <h2 className="mt-1 text-lg font-semibold">Google Place ID</h2>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {detail.google_place_id ?? "No external Place ID associated"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Read only. Change only through a future identity-reconciliation
          workflow.
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          OPERATIONAL METADATA
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Canonical provenance</dt>
            <dd className="mt-1 capitalize text-muted-foreground">
              {detail.source_provenance}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Last updated</dt>
            <dd className="mt-1 text-muted-foreground">
              {formatDate(detail.updated_at)}
            </dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
