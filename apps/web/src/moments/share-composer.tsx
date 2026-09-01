import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject
} from "react";
import {
  loadPublicSearchResults,
  type PublicSearchResult
} from "../discovery/data";
import { supabase } from "../lib/supabase";
import {
  MomentImageError,
  normalizeMomentImage
} from "../moments-image-normalization";
import {
  MomentImageUploadError,
  uploadMomentImage
} from "../moments-image-upload";
import { ensurePublicWriteIdentity } from "./identity";

type Selection = {
  id: string;
  label: string;
  brandSlug: string;
};

type DraftState = {
  id: string;
  signature: string;
};

type OwnMomentState = {
  status: string;
  imageAssetId: string | null;
  deletedAt: string | null;
};

type NormalizedMomentImage = Awaited<ReturnType<typeof normalizeMomentImage>>;

type ValidationError = {
  message: string;
  target: "photo" | "caption" | "drink" | "store" | "display-name";
};

const MAX_CAPTION_LENGTH = 280;
const MAX_CATALOGUE_TEXT_LENGTH = 160;
const MAX_DISPLAY_NAME_LENGTH = 40;

function formSignature(values: {
  caption: string;
  location: string;
  product: string;
  displayName: string;
  locationSelection: Selection | null;
  productSelection: Selection | null;
}) {
  return JSON.stringify([
    values.caption,
    values.location,
    values.product,
    values.displayName,
    values.locationSelection?.id ?? null,
    values.productSelection?.id ?? null
  ]);
}

function searchLabel(kind: "drink" | "store", result: Selection) {
  return kind === "drink"
    ? `${result.label} · Drink`
    : `${result.label} · Store`;
}

function searchSelection(
  kind: "drink" | "store",
  value: PublicSearchResult
): Selection[] {
  if (kind === "drink") {
    return value.drinks.map((item) => ({
      id: item.id,
      label: item.name,
      brandSlug: item.brandSlug
    }));
  }
  return value.stores.map((item) => ({
    id: item.id,
    label: item.displayName,
    brandSlug: item.brandSlug
  }));
}

function isSelection(value: Selection | null, input: string) {
  return value?.label === input ? value : null;
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p className="text-xs leading-5 text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

function MetadataCombobox({
  kind,
  label,
  value,
  selection,
  onChange,
  onSelect,
  disabled,
  inputRef
}: {
  kind: "drink" | "store";
  label: string;
  value: string;
  selection: Selection | null;
  onChange: (value: string) => void;
  onSelect: (selection: Selection) => void;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const inputId = useId();
  const listId = `${inputId}-options`;
  const [options, setOptions] = useState<Selection[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!expanded || !value.trim()) {
      setOptions([]);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      void loadPublicSearchResults(value).then((result) => {
        if (requestId !== requestRef.current) return;
        setOptions(result.data ? searchSelection(kind, result.data) : []);
        setActiveIndex(-1);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [expanded, kind, value]);

  const showOptions = expanded && options.length > 0;

  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium" htmlFor={inputId}>
        {label} · optional
      </label>
      <input
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={showOptions ? listId : undefined}
        aria-expanded={showOptions}
        aria-haspopup="listbox"
        className="h-12 rounded-lg border border-border bg-card px-3 text-base text-foreground"
        disabled={disabled}
        id={inputId}
        maxLength={MAX_CATALOGUE_TEXT_LENGTH}
        ref={inputRef}
        role="combobox"
        value={value}
        onBlur={() => window.setTimeout(() => setExpanded(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setExpanded(Boolean(event.target.value.trim()));
        }}
        onFocus={() => setExpanded(Boolean(value.trim()))}
        onKeyDown={(event) => {
          if (!showOptions) {
            if (event.key === "ArrowDown" && value.trim()) setExpanded(true);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) =>
              Math.min(options.length - 1, current + 1)
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            onSelect(options[activeIndex]);
            setExpanded(false);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setExpanded(false);
          }
        }}
      />
      {selection && selection.label === value ? (
        <p className="text-xs text-muted-foreground">
          Canonical {searchLabel(kind, selection)} selected.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Free text is fine if we cannot match a canonical {kind}.
        </p>
      )}
      {showOptions ? (
        <ul
          className="z-10 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          id={listId}
          role="listbox"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              aria-selected={index === activeIndex}
              className={`min-h-11 cursor-pointer rounded-md px-3 py-2 text-sm ${index === activeIndex ? "bg-accent" : "hover:bg-accent"}`}
              id={`${listId}-${index}`}
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(option);
                setExpanded(false);
              }}
            >
              <span className="block break-words">{option.label}</span>
              <span className="block text-xs text-muted-foreground">
                {option.brandSlug}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

async function loadOwnMomentState(
  postId: string
): Promise<OwnMomentState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("community_posts")
    .select("status, image_asset_id, deleted_at")
    .eq("id", postId)
    .maybeSingle();
  if (error || !data || typeof data.status !== "string") return null;
  return {
    status: data.status,
    imageAssetId:
      typeof data.image_asset_id === "string" ? data.image_asset_id : null,
    deletedAt: typeof data.deleted_at === "string" ? data.deleted_at : null
  };
}

export function ShareMomentComposer({
  open,
  onClose,
  onSuccess,
  returnFocusRef
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoPickerRef = useRef<HTMLButtonElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const [normalized, setNormalized] = useState<NormalizedMomentImage | null>(
    null
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [product, setProduct] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [locationSelection, setLocationSelection] = useState<Selection | null>(
    null
  );
  const [productSelection, setProductSelection] = useState<Selection | null>(
    null
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const signature = formSignature({
    caption,
    location,
    product,
    displayName,
    locationSelection,
    productSelection
  });

  const revokePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  };

  const reset = () => {
    revokePreview();
    setNormalized(null);
    setCaption("");
    setLocation("");
    setProduct("");
    setDisplayName("");
    setLocationSelection(null);
    setProductSelection(null);
    setDetailsOpen(false);
    setNameOpen(false);
    setDraft(null);
    setError(null);
    setFieldError(null);
    setSubmitting(false);
    setSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const abandonDraft = () => {
    const postId = draft?.id;
    setDraft(null);
    if (postId && supabase) {
      void supabase.rpc("delete_own_community_post", { p_post_id: postId });
    }
  };

  const close = () => {
    if (submitting) return;
    if (draft && !success) abandonDraft();
    reset();
    onClose();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };
  closeRef.current = close;

  useEffect(() => {
    if (!open) {
      revokePreview();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button[aria-label="Close Share your moment"]'
        )
        ?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!submitting) closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button, input, textarea, [href], select"
        )
      ).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex >= 0
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, submitting]);

  useEffect(() => () => revokePreview(), []);

  if (!open) return null;

  const setChangedValue = (
    setter: (value: string) => void,
    value: string,
    clearSelection: () => void
  ) => {
    if (draft) abandonDraft();
    setter(value);
    clearSelection();
    setFieldError(null);
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || submitting) return;
    if (draft) abandonDraft();
    setError(null);
    setFieldError(null);
    try {
      const next = await normalizeMomentImage(file);
      revokePreview();
      const nextUrl = URL.createObjectURL(next.file);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setNormalized(next);
    } catch (reason) {
      setNormalized(null);
      revokePreview();
      setError(
        reason instanceof MomentImageError
          ? reason.message
          : "The selected file could not be decoded as an image."
      );
    }
  };

  const validate = (): ValidationError | null => {
    if (!normalized)
      return {
        message: "Add a photo to share your Moment.",
        target: "photo"
      };
    if (caption.length > MAX_CAPTION_LENGTH)
      return {
        message: "Caption must be 280 characters or fewer.",
        target: "caption"
      };
    if (location.length > MAX_CATALOGUE_TEXT_LENGTH)
      return {
        message: "Store text must be 160 characters or fewer.",
        target: "store"
      };
    if (product.length > MAX_CATALOGUE_TEXT_LENGTH)
      return {
        message: "Drink text must be 160 characters or fewer.",
        target: "drink"
      };
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH)
      return {
        message: "Your name must be 40 characters or fewer.",
        target: "display-name"
      };
    if (
      locationSelection &&
      productSelection &&
      locationSelection.brandSlug !== productSelection.brandSlug
    )
      return {
        message:
          "Choose a Store and Drink from the same brand, or use free text for one of them.",
        target: "drink"
      };
    return null;
  };

  const focusValidationTarget = (target: ValidationError["target"]) => {
    if (target === "photo") {
      photoPickerRef.current?.focus();
      return;
    }
    if (target === "caption") {
      captionRef.current?.focus();
      return;
    }
    if (target === "display-name") {
      setNameOpen(true);
      window.requestAnimationFrame(() => displayNameRef.current?.focus());
      return;
    }
    setDetailsOpen(true);
    window.requestAnimationFrame(() => {
      (target === "drink"
        ? productInputRef
        : locationInputRef
      ).current?.focus();
    });
  };

  const commitSelection = (
    kind: "drink" | "store",
    nextSelection: Selection
  ) => {
    const currentValue = kind === "drink" ? product : location;
    const currentSelection =
      kind === "drink" ? productSelection : locationSelection;
    if (
      currentValue !== nextSelection.label ||
      currentSelection?.id !== nextSelection.id
    ) {
      if (draft) abandonDraft();
      setFieldError(null);
      setError(null);
    }
    if (kind === "drink") {
      setProduct(nextSelection.label);
      setProductSelection(nextSelection);
    } else {
      setLocation(nextSelection.label);
      setLocationSelection(nextSelection);
    }
  };

  const createDraft = async () => {
    if (!supabase) throw new Error("Sharing is temporarily unavailable.");
    const identity = await ensurePublicWriteIdentity();
    if (identity.error) throw new Error("Sharing is temporarily unavailable.");
    const result = await supabase.rpc("create_community_post_draft", {
      p_caption: caption,
      p_display_name: displayName.trim() || null,
      p_location_id: isSelection(locationSelection, location)?.id ?? null,
      p_location_text: isSelection(locationSelection, location)
        ? null
        : location.trim() || null,
      p_product_id: isSelection(productSelection, product)?.id ?? null,
      p_product_text: isSelection(productSelection, product)
        ? null
        : product.trim() || null
    });
    if (result.error || typeof result.data !== "string") {
      throw new Error("Your Moment could not be started. Please try again.");
    }
    const nextDraft = { id: result.data, signature };
    setDraft(nextDraft);
    return nextDraft.id;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFieldError(null);
    setError(null);
    const validationError = validate();
    if (validationError) {
      setFieldError(validationError.message);
      focusValidationTarget(validationError.target);
      return;
    }
    setSubmitting(true);
    let attemptedPostId: string | null = null;
    try {
      attemptedPostId =
        draft?.signature === signature ? draft.id : await createDraft();
      if (!normalized) throw new Error("Add a photo to share your Moment.");
      await uploadMomentImage(attemptedPostId, normalized);
      setSuccess(true);
      onSuccess();
    } catch (reason) {
      const state = attemptedPostId
        ? await loadOwnMomentState(attemptedPostId)
        : null;
      if (
        state?.status === "active" &&
        state.imageAssetId &&
        !state.deletedAt
      ) {
        setSuccess(true);
        onSuccess();
      } else if (state?.deletedAt) {
        setDraft(null);
        setError(
          "This draft is no longer available. Please try sharing again."
        );
      } else {
        if (attemptedPostId) {
          setDraft({ id: attemptedPostId, signature });
        }
        setError(
          reason instanceof MomentImageUploadError
            ? "Your photo could not be uploaded. Try again."
            : reason instanceof Error
              ? reason.message
              : "Your Moment could not be shared. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <form
      className="grid gap-6 sm:grid sm:grid-cols-2 sm:items-start sm:gap-6"
      onSubmit={submit}
    >
      <div className="grid gap-3" data-testid="share-photo-section">
        <div className="relative grid min-h-44 place-items-center overflow-hidden rounded-xl bg-accent sm:min-h-72">
          {previewUrl ? (
            <img
              alt="Selected Moment preview"
              className="h-full max-h-[360px] w-full object-contain"
              src={previewUrl}
            />
          ) : (
            <button
              ref={photoPickerRef}
              className="min-h-44 w-full rounded-xl text-sm font-medium text-primary sm:min-h-72"
              disabled={submitting}
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Add a photo
            </button>
          )}
        </div>
        <div className="flex gap-4 text-xs font-medium">
          <button
            className="min-h-11 rounded-lg px-1 text-primary hover:bg-accent disabled:opacity-60"
            disabled={submitting}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Change
          </button>
          <button
            className="min-h-11 rounded-lg px-1 text-muted-foreground hover:bg-accent disabled:opacity-60"
            disabled={!normalized || submitting}
            type="button"
            onClick={() => {
              if (draft) abandonDraft();
              setNormalized(null);
              revokePreview();
              setError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            Remove
          </button>
        </div>
        <input
          aria-label="Moment photo"
          ref={fileInputRef}
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={submitting}
          tabIndex={-1}
          type="file"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      <div className="grid gap-4" data-testid="share-details-section">
        <label
          className="grid gap-1.5 text-xs font-medium"
          htmlFor="moment-caption"
        >
          Caption · optional
          <textarea
            className="min-h-20 resize-y rounded-lg border border-border bg-card p-3 text-base font-normal text-foreground"
            id="moment-caption"
            maxLength={MAX_CAPTION_LENGTH}
            placeholder="Say something..."
            ref={captionRef}
            value={caption}
            onChange={(event) =>
              setChangedValue(setCaption, event.target.value, () => undefined)
            }
          />
        </label>
        <button
          className="min-h-11 rounded-lg bg-accent px-3 text-left text-xs font-medium text-primary"
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {detailsOpen
            ? "− Hide drink or store details"
            : "+ Add drink or store details"}
        </button>
        {detailsOpen ? (
          <div className="grid gap-4 rounded-lg border border-border bg-card p-3">
            <MetadataCombobox
              disabled={submitting}
              kind="drink"
              label="What are you drinking?"
              inputRef={productInputRef}
              selection={productSelection}
              value={product}
              onChange={(value) =>
                setChangedValue(setProduct, value, () =>
                  setProductSelection(null)
                )
              }
              onSelect={(value) => commitSelection("drink", value)}
            />
            <MetadataCombobox
              disabled={submitting}
              kind="store"
              label="Where did you get it?"
              inputRef={locationInputRef}
              selection={locationSelection}
              value={location}
              onChange={(value) =>
                setChangedValue(setLocation, value, () =>
                  setLocationSelection(null)
                )
              }
              onSelect={(value) => commitSelection("store", value)}
            />
          </div>
        ) : null}
        <button
          className="min-h-11 rounded-lg px-1 text-left text-xs font-medium text-foreground hover:bg-accent"
          type="button"
          onClick={() => setNameOpen((value) => !value)}
        >
          {nameOpen ? "− Hide your name" : "+ Add your name"}
        </button>
        {nameOpen ? (
          <label
            className="grid gap-1.5 text-xs font-medium"
            htmlFor="moment-display-name"
          >
            Your name · optional
            <input
              className="h-12 rounded-lg border border-border bg-card px-3 text-base font-normal text-foreground"
              id="moment-display-name"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              ref={displayNameRef}
              value={displayName}
              onChange={(event) =>
                setChangedValue(
                  setDisplayName,
                  event.target.value,
                  () => undefined
                )
              }
            />
          </label>
        ) : null}
        <ErrorText message={fieldError} />
        <ErrorText message={error} />
        <button
          className="min-h-11 w-fit rounded-xl bg-primary px-6 py-4 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Sharing…" : "Share"}
        </button>
      </div>
    </form>
  );

  return (
    <div
      aria-hidden={false}
      className="fixed inset-0 z-30 bg-black/25"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) close();
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby="share-moment-title"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-84px)] overflow-y-auto rounded-t-[20px] border border-border bg-background sm:inset-8 sm:mx-auto sm:max-w-5xl sm:rounded-[20px]"
        role="dialog"
      >
        <div className="flex h-6 items-center justify-center sm:hidden">
          <div
            aria-hidden="true"
            className="h-1 w-9 rounded-full bg-muted-foreground/50"
          />
        </div>
        <div className="flex min-h-16 items-center gap-3 border-b border-border bg-background px-4 py-2">
          <h2 className="text-base font-semibold" id="share-moment-title">
            Share your moment
          </h2>
          <div className="flex-1" />
          <button
            aria-label="Close Share your moment"
            className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-accent text-xs font-medium text-primary"
            disabled={submitting}
            type="button"
            onClick={close}
          >
            ×
          </button>
        </div>
        {success ? (
          <div
            aria-live="polite"
            className="grid min-h-80 place-items-center gap-5 p-8 text-center"
            role="status"
          >
            <div>
              <p className="text-xl font-semibold">Your Moment is live 🧋</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Thanks for sharing it with the WeMilktea community.
              </p>
            </div>
            <button
              className="min-h-11 rounded-xl bg-primary px-6 py-4 text-xs font-medium text-primary-foreground"
              type="button"
              onClick={close}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="bg-background p-5 sm:p-8">
            <div className="rounded-[20px] border border-border bg-card p-5 sm:p-6">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
