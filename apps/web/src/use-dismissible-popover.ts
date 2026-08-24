import { useEffect, type RefObject } from "react";

type DismissiblePopoverOptions = {
  open: boolean;
  onClose: () => void;
  popoverRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
};

export function useDismissiblePopover({
  open,
  onClose,
  popoverRef,
  triggerRef
}: DismissiblePopoverOptions) {
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (
        popoverRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, popoverRef, triggerRef]);
}
