import { type KeyboardEvent, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function focusableElements(dialog: HTMLDivElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  isPending,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelButtonRef.current?.focus();

    return () => {
      previousActiveElementRef.current?.focus();
      previousActiveElementRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isPending) onCancel();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) return;

    const elements = focusableElements(dialogRef.current);
    if (elements.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        aria-describedby="confirm-dialog-description"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl"
        role="dialog"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-semibold" id="confirm-dialog-title">
          {title}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-muted-foreground"
          id="confirm-dialog-description"
        >
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
