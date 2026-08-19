import { GlobalWindow } from "happy-dom";

const browserWindow = new GlobalWindow();
const browserGlobals = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLButtonElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "KeyboardEvent"
] as const;
const originalGlobalDescriptors = new Map(
  browserGlobals.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property)
  ])
);
for (const property of browserGlobals) {
  Object.defineProperty(globalThis, property, {
    configurable: true,
    value: browserWindow[property]
  });
}

function installBrowserGlobals() {
  for (const property of browserGlobals) {
    Object.defineProperty(globalThis, property, {
      configurable: true,
      value: browserWindow[property]
    });
  }
}

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { useState } from "react";
import { ConfirmDialog } from "./confirm-dialog";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

beforeEach(() => installBrowserGlobals());
afterEach(() => {
  installBrowserGlobals();
  cleanup();
});
afterAll(() => {
  for (const property of browserGlobals) {
    const descriptor = originalGlobalDescriptors.get(property);
    if (descriptor) {
      Object.defineProperty(globalThis, property, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[property];
    }
  }
});

function TestDialog({
  onConfirm = mock(() => {}),
  initiallyOpen = true
}: {
  onConfirm?: () => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [isPending, setIsPending] = useState(false);
  const handleConfirm = () => {
    onConfirm();
    setIsPending(true);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Publish trigger
      </button>
      <ConfirmDialog
        confirmLabel="Publish"
        description="Publishing will make this item visible publicly."
        isPending={isPending}
        pendingLabel="Publishing…"
        title="Publish this item?"
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

test.serial("renders an accessible publish confirmation dialog", () => {
  const view = render(<TestDialog />);

  expect(view.getByRole("dialog")).toBeTruthy();
  expect(
    view.getByRole("heading", { name: "Publish this item?" })
  ).toBeTruthy();
  expect(
    view.getByText("Publishing will make this item visible publicly.")
  ).toBeTruthy();
  expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Publish" })).toBeTruthy();
  expect(document.activeElement).toBe(
    view.getByRole("button", { name: "Cancel" })
  );
});

test.serial("cancel and Escape close without confirming", () => {
  const firstView = render(<TestDialog initiallyOpen={false} />);
  fireEvent.click(firstView.getByRole("button", { name: "Publish trigger" }));

  fireEvent.keyDown(firstView.getByRole("dialog"), { key: "Escape" });
  expect(firstView.queryByRole("dialog")).toBeNull();
  firstView.unmount();

  const secondView = render(<TestDialog initiallyOpen={false} />);
  fireEvent.click(secondView.getByRole("button", { name: "Publish trigger" }));
  fireEvent.click(secondView.getByRole("button", { name: "Cancel" }));
  expect(secondView.queryByRole("dialog")).toBeNull();
});

test.serial(
  "confirm enters pending state and prevents duplicate clicks",
  () => {
    const onConfirm = mock(() => {});
    const view = render(<TestDialog onConfirm={onConfirm} />);

    const confirmButton = view.getByRole("button", { name: "Publish" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(view.getByRole("button", { name: "Publishing…" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Publish" })).toBeNull();
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      view.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")
    ).toBe(true);
  }
);
