import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { storeSuggestionSchema } from "@wemilktea/validation";
import { supabase, supabaseConfigurationError } from "../lib/supabase";

type SuggestStoreValues = {
  storeName: string;
  suburb: string;
  googleMapsUrl: string;
  officialUrl: string;
  notes: string;
  submitterEmail: string;
  honeypot: string;
};

type SuggestStoreField = keyof Omit<SuggestStoreValues, "honeypot">;

const initialValues: SuggestStoreValues = {
  storeName: "",
  suburb: "",
  googleMapsUrl: "",
  officialUrl: "",
  notes: "",
  submitterEmail: "",
  honeypot: ""
};

const fieldLabels: Record<SuggestStoreField, string> = {
  storeName: "Store name",
  suburb: "Suburb or area",
  googleMapsUrl: "Google Maps link",
  officialUrl: "Website, Instagram, or menu link",
  notes: "Notes",
  submitterEmail: "Your email"
};

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function fieldErrorMap(values: SuggestStoreValues) {
  const result = storeSuggestionSchema.safeParse({
    storeName: values.storeName,
    suburb: values.suburb,
    googleMapsUrl: optionalValue(values.googleMapsUrl),
    officialUrl: optionalValue(values.officialUrl),
    notes: optionalValue(values.notes),
    submitterEmail: optionalValue(values.submitterEmail)
  });

  if (result.success) return { errors: {}, payload: result.data };

  const errors: Partial<Record<SuggestStoreField, string>> = {};
  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (
      typeof field === "string" &&
      field in fieldLabels &&
      !errors[field as SuggestStoreField]
    ) {
      errors[field as SuggestStoreField] = issue.message;
    }
  });
  return { errors, payload: null };
}

function ErrorMessage({
  field,
  message
}: {
  field: SuggestStoreField;
  message?: string;
}) {
  return message ? (
    <p className="suggest-store-error" id={`suggest-${field}-error`}>
      {message}
    </p>
  ) : null;
}

function FormField({
  field,
  label,
  value,
  onChange,
  error,
  required,
  type = "text",
  placeholder
}: {
  field: SuggestStoreField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  type?: "email" | "text" | "url";
  placeholder?: string;
}) {
  const inputId = `suggest-${field}`;
  return (
    <div className="suggest-store-field">
      <label htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {!required ? (
          <span className="suggest-store-optional"> (optional)</span>
        ) : null}
      </label>
      <input
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-invalid={Boolean(error)}
        id={inputId}
        name={field}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <ErrorMessage field={field} message={error} />
    </div>
  );
}

export function SuggestStoreCta({
  onClick,
  compact = false
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={
        compact
          ? "suggest-store-cta suggest-store-cta-compact"
          : "suggest-store-cta"
      }
      type="button"
      onClick={onClick}
    >
      <span>
        <strong>Can&apos;t find your favourite milk tea spot?</strong>
        <small>Suggest a store</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function SuggestStoreDialog({
  open,
  onClose,
  returnFocusRef
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: { current: HTMLElement | null };
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<
    Partial<Record<SuggestStoreField, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("input, textarea, button")
        ?.focus();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        const trigger = returnFocusRef.current;
        onClose();
        trigger?.focus();
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
  }, [onClose, open, returnFocusRef]);

  const close = () => {
    if (isSubmitting) return;
    const trigger = returnFocusRef.current;
    onClose();
    trigger?.focus();
  };

  const updateField = (field: SuggestStoreField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const validation = fieldErrorMap(values);
    setErrors(validation.errors);
    if (!validation.payload) {
      const firstInvalidField = (
        Object.keys(validation.errors) as SuggestStoreField[]
      )[0];
      if (firstInvalidField) {
        window.requestAnimationFrame(() =>
          document.getElementById(`suggest-${firstInvalidField}`)?.focus()
        );
      }
      return;
    }

    if (values.honeypot.trim()) {
      setIsSuccess(true);
      return;
    }

    if (!supabase) {
      setFormError(
        supabaseConfigurationError ??
          "Suggestions are unavailable right now. Please try again later."
      );
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("store_submissions").insert({
      store_name: validation.payload.storeName,
      suburb: validation.payload.suburb,
      google_maps_url: validation.payload.googleMapsUrl ?? null,
      official_url: validation.payload.officialUrl ?? null,
      notes: validation.payload.notes ?? null,
      submitter_email: validation.payload.submitterEmail ?? null,
      moderation_status: "pending",
      reviewed_at: null,
      reviewed_by: null
    });
    setIsSubmitting(false);

    if (error) {
      setFormError("We couldn’t send that suggestion. Please try again.");
      return;
    }

    setIsSuccess(true);
    setValues(initialValues);
  };

  if (!open) return null;

  return (
    <div
      className="suggest-store-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby="suggest-store-title"
        aria-modal="true"
        className="suggest-store-dialog"
        role="dialog"
      >
        <div className="suggest-store-dialog-header">
          <div>
            <p className="suggest-store-eyebrow">HELP US GROW</p>
            <h2 id="suggest-store-title">Suggest a store</h2>
          </div>
          <button
            aria-label="Close suggest a store dialog"
            className="suggest-store-close"
            type="button"
            onClick={close}
          >
            ×
          </button>
        </div>

        {isSuccess ? (
          <div aria-live="polite" className="suggest-store-success">
            <div aria-hidden="true" className="suggest-store-success-icon">
              ✓
            </div>
            <h3>Thanks for the suggestion!</h3>
            <p>We&apos;ll take a look and see if it belongs on WeMilktea.</p>
            <button
              className="suggest-store-submit"
              type="button"
              onClick={close}
            >
              Back to stores
            </button>
          </div>
        ) : (
          <form
            className="suggest-store-form"
            noValidate
            onSubmit={handleSubmit}
          >
            <p className="suggest-store-intro">
              Know a milk-tea spot we&apos;re missing? Send us the details and
              we&apos;ll review it.
            </p>
            <FormField
              error={errors.storeName}
              field="storeName"
              label={fieldLabels.storeName}
              required
              value={values.storeName}
              onChange={(value) => updateField("storeName", value)}
              placeholder="e.g. Gong cha"
            />
            <FormField
              error={errors.suburb}
              field="suburb"
              label={fieldLabels.suburb}
              required
              value={values.suburb}
              onChange={(value) => updateField("suburb", value)}
              placeholder="e.g. Newmarket"
            />
            <FormField
              error={errors.googleMapsUrl}
              field="googleMapsUrl"
              label={fieldLabels.googleMapsUrl}
              type="url"
              value={values.googleMapsUrl}
              onChange={(value) => updateField("googleMapsUrl", value)}
              placeholder="https://maps.google.com/..."
            />
            <FormField
              error={errors.officialUrl}
              field="officialUrl"
              label={fieldLabels.officialUrl}
              type="url"
              value={values.officialUrl}
              onChange={(value) => updateField("officialUrl", value)}
              placeholder="https://..."
            />
            <div className="suggest-store-field">
              <label htmlFor="suggest-notes">
                {fieldLabels.notes}
                <span className="suggest-store-optional"> (optional)</span>
              </label>
              <textarea
                aria-describedby={
                  errors.notes ? "suggest-notes-error" : undefined
                }
                aria-invalid={Boolean(errors.notes)}
                id="suggest-notes"
                name="notes"
                rows={3}
                value={values.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Anything else we should know?"
              />
              <ErrorMessage field="notes" message={errors.notes} />
            </div>
            <FormField
              error={errors.submitterEmail}
              field="submitterEmail"
              label={fieldLabels.submitterEmail}
              type="email"
              value={values.submitterEmail}
              onChange={(value) => updateField("submitterEmail", value)}
              placeholder="Only if you'd like us to follow up"
            />
            <label className="suggest-store-honeypot" htmlFor="suggest-company">
              Company
              <input
                autoComplete="off"
                id="suggest-company"
                tabIndex={-1}
                value={values.honeypot}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    honeypot: event.target.value
                  }))
                }
              />
            </label>
            {formError ? (
              <p className="suggest-store-form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <button
              className="suggest-store-submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Sending…" : "Send suggestion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
