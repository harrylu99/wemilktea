import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ConfirmDialog } from "./confirm-dialog";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import { slugify } from "./lib/slug";
import { ManagementTableSkeleton } from "./loading";

const categoryRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  is_published: z.boolean()
});

const productCategoryReferenceSchema = z.object({
  category_id: z.string().uuid()
});

const categoryInputSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().trim().nullable(),
  sort_order: z.number().int().min(0).max(32767),
  is_published: z.boolean()
});

type CategoryRow = z.infer<typeof categoryRowSchema>;
type ManagedCategory = CategoryRow & { productCount: number };

type CategoryForm = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isPublished: boolean;
};

const emptyForm: CategoryForm = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  isPublished: true
};

function friendlyCategoryError(
  error: {
    code?: string;
    message?: string;
  } | null
) {
  const message = error?.message?.toLowerCase() ?? "";
  if (
    message.includes("categories_name_key") ||
    (message.includes("duplicate key") && message.includes("name"))
  ) {
    return "A category with that name already exists.";
  }
  if (
    message.includes("categories_slug_key") ||
    (message.includes("duplicate key") && message.includes("slug"))
  ) {
    return "That category slug is already in use.";
  }
  if (error?.code === "23514" || message.includes("categories_slug_format")) {
    return "Use lowercase letters, numbers, and hyphens for the slug.";
  }
  if (error?.code === "22003") {
    return "Sort order must be a valid whole number.";
  }
  return "The category could not be saved. Please try again.";
}

function categoryFormFromRow(category: CategoryRow): CategoryForm {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    sortOrder: String(category.sort_order),
    isPublished: category.is_published
  };
}

export function ProductCategoriesPage() {
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"new" | "edit" | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUnpublish, setPendingUnpublish] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const [categoriesResult, productsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, slug, description, sort_order, is_published")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("products").select("category_id")
    ]);
    const parsedCategories = categoryRowSchema
      .array()
      .safeParse(categoriesResult.data);
    const parsedProductReferences = productCategoryReferenceSchema
      .array()
      .safeParse(productsResult.data);

    if (
      categoriesResult.error ||
      productsResult.error ||
      !parsedCategories.success ||
      !parsedProductReferences.success
    ) {
      setErrorMessage(
        "Product categories could not be loaded. Please try again."
      );
      setIsLoading(false);
      return;
    }

    const productCounts = new Map<string, number>();
    parsedProductReferences.data.forEach(({ category_id }) => {
      productCounts.set(category_id, (productCounts.get(category_id) ?? 0) + 1);
    });
    setCategories(
      parsedCategories.data.map((category) => ({
        ...category,
        productCount: productCounts.get(category.id) ?? 0
      }))
    );
    setErrorMessage(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeForm = () => {
    setFormMode(null);
    setEditingCategoryId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsSlugManuallyEdited(false);
    setPendingUnpublish(false);
  };

  const openNewForm = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setFormMode("new");
    setEditingCategoryId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsSlugManuallyEdited(false);
  };

  const openEditForm = (category: ManagedCategory) => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setFormMode("edit");
    setEditingCategoryId(category.id);
    setForm(categoryFormFromRow(category));
    setFormError(null);
    setIsSlugManuallyEdited(true);
  };

  const setCategoryName = (name: string) => {
    setForm((current) => ({
      ...current,
      name,
      slug:
        formMode === "new" && !isSlugManuallyEdited
          ? slugify(name)
          : current.slug
    }));
  };

  const saveCategory = async (skipUnpublishConfirmation = false) => {
    if (!supabase) {
      setFormError(supabaseConfigurationError);
      return false;
    }

    const parsed = categoryInputSchema.safeParse({
      name: form.name,
      slug: form.slug,
      description: form.description.trim() || null,
      sort_order: Number(form.sortOrder),
      is_published: form.isPublished
    });
    if (!parsed.success) {
      setFormError(
        "Check the category name, slug, description, and sort order."
      );
      return false;
    }

    const existingCategory = editingCategoryId
      ? categories.find((category) => category.id === editingCategoryId)
      : null;
    if (
      !skipUnpublishConfirmation &&
      existingCategory?.is_published &&
      !parsed.data.is_published &&
      existingCategory.productCount > 0
    ) {
      setPendingUnpublish(true);
      return false;
    }

    setIsSaving(true);
    setFormError(null);
    const result =
      formMode === "edit" && editingCategoryId
        ? await supabase
            .from("categories")
            .update(parsed.data)
            .eq("id", editingCategoryId)
        : await supabase.from("categories").insert(parsed.data);
    setIsSaving(false);

    if (result.error) {
      setFormError(friendlyCategoryError(result.error));
      return false;
    }

    setSuccessMessage(
      formMode === "edit"
        ? "Product category saved."
        : "Product category created."
    );
    closeForm();
    await load();
    return true;
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveCategory();
  };

  const confirmUnpublish = async () => {
    if (!pendingUnpublish) return;
    const saved = await saveCategory(true);
    if (saved) setPendingUnpublish(false);
  };

  const pendingCategory = editingCategoryId
    ? categories.find((category) => category.id === editingCategoryId)
    : null;

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
            to="/products"
          >
            ← Products
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">Product categories</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the categories used by products and public drink filters.
          </p>
        </div>
        <button
          className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          type="button"
          onClick={openNewForm}
        >
          + Add category
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            type="button"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {successMessage ? (
        <p className="mt-4 text-sm text-primary" role="status">
          {successMessage}
        </p>
      ) : null}

      {formMode ? (
        <form
          className="mt-6 rounded-lg border border-border bg-card p-5"
          onSubmit={submitForm}
        >
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            PRODUCT TAXONOMY
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {formMode === "new"
              ? "Add product category"
              : "Edit product category"}
          </h2>
          {formError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium" htmlFor="category-name">
              Name *
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSaving}
                id="category-name"
                required
                value={form.name}
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium" htmlFor="category-slug">
              Slug *
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                disabled={isSaving}
                id="category-slug"
                required
                value={form.slug}
                onChange={(event) => {
                  setIsSlugManuallyEdited(true);
                  setForm((current) => ({
                    ...current,
                    slug: event.target.value
                  }));
                }}
              />
            </label>
            <label
              className="text-sm font-medium sm:col-span-2"
              htmlFor="category-description"
            >
              Description
              <textarea
                className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSaving}
                id="category-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
            <label
              className="text-sm font-medium"
              htmlFor="category-sort-order"
            >
              Sort order *
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isSaving}
                id="category-sort-order"
                inputMode="numeric"
                min="0"
                required
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: event.target.value
                  }))
                }
              />
            </label>
            <label
              className="flex items-center gap-3 self-end pb-2 text-sm font-medium"
              htmlFor="category-published"
            >
              <input
                checked={form.isPublished}
                disabled={isSaving}
                id="category-published"
                type="checkbox"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isPublished: event.target.checked
                  }))
                }
              />
              Published
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving…" : "Save category"}
            </button>
            <button
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        {isLoading ? (
          <ManagementTableSkeleton
            label="Loading product categories"
            minWidth="48rem"
          />
        ) : null}
        {!isLoading && !errorMessage && categories.length === 0 ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              No product categories yet.
            </p>
            <button
              className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              type="button"
              onClick={openNewForm}
            >
              + Add category
            </button>
          </div>
        ) : null}
        {!isLoading && !errorMessage && categories.length > 0 ? (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Products</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr
                  className="border-b border-border last:border-0"
                  key={category.id}
                >
                  <td className="px-4 py-3 font-medium">{category.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {category.slug}
                  </td>
                  <td className="px-4 py-3">{category.productCount}</td>
                  <td className="px-4 py-3">{category.sort_order}</td>
                  <td className="px-4 py-3">
                    {category.is_published ? "Published" : "Unpublished"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="rounded-md border border-border px-3 py-2 font-medium hover:bg-muted"
                      type="button"
                      onClick={() => openEditForm(category)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {pendingUnpublish && pendingCategory ? (
        <ConfirmDialog
          confirmLabel="Unpublish"
          description={`${pendingCategory.productCount} ${pendingCategory.productCount === 1 ? "product currently uses" : "products currently use"} this category. Products assigned to an unpublished category will no longer be visible in the public catalogue under the current publication rules.`}
          isPending={isSaving}
          pendingLabel="Unpublishing…"
          title={`Unpublish ${form.name}?`}
          open
          onCancel={() => setPendingUnpublish(false)}
          onConfirm={() => void confirmUnpublish()}
        />
      ) : null}
    </section>
  );
}
