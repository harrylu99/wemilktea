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
  "HTMLTextAreaElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "requestAnimationFrame"
] as const;
const originalGlobalDescriptors = new Map(
  browserGlobals.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property)
  ])
);

function installBrowserGlobals() {
  for (const property of browserGlobals) {
    Object.defineProperty(globalThis, property, {
      configurable: true,
      value: browserWindow[property]
    });
  }
}

installBrowserGlobals();

import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { cleanup, fireEvent, render, waitFor, within } =
  await import("@testing-library/react");

const activeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hiddenId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const imageId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const activeMoment = {
  id: activeId,
  ownerUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  image: {
    id: imageId,
    storageKey: `community/${activeId}.webp`,
    contentType: "image/webp",
    byteSize: 100,
    width: 1200,
    height: 900
  },
  caption: "Brown sugar pearls",
  locationId: null,
  locationText: "Takapuna",
  locationName: null,
  locationSlug: null,
  productId: null,
  productText: "Milk tea",
  productName: null,
  productSlug: null,
  displayName: "Tea fan",
  status: "active",
  createdAt: "2026-08-31T12:00:00.000Z",
  submittedAt: "2026-08-31T12:00:00.000Z",
  deletedAt: null,
  moderatedAt: null,
  moderationReason: null,
  reports: [
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      post_id: activeId,
      reason: "spam",
      details: "Repeated promotion",
      status: "pending",
      created_at: "2026-08-31T13:00:00.000Z",
      resolved_at: null,
      resolved_by: null
    },
    {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      post_id: activeId,
      reason: "other",
      details: null,
      status: "pending",
      created_at: "2026-08-31T12:30:00.000Z",
      resolved_at: null,
      resolved_by: null
    }
  ]
} as const;

const hiddenMoment = {
  ...activeMoment,
  id: hiddenId,
  status: "hidden",
  reports: [],
  moderationReason: null
} as const;

const fetchMomentsMock = mock(
  async (view: "reported" | "recent" | "hidden") => {
    if (view === "reported") return [activeMoment];
    if (view === "recent") return [activeMoment];
    return [hiddenMoment];
  }
);
const moderateMomentMock = mock(async () => {});
const resolveMomentReportMock = mock(async () => {});

mock.module("./moments-data", () => ({
  fetchMoments: fetchMomentsMock,
  moderateMoment: moderateMomentMock,
  normalizeMomentView: (value: string | null) =>
    value === "recent" || value === "hidden" ? value : "reported",
  resolveMomentReport: resolveMomentReportMock
}));

const { MomentsPage } = await import("./moments");

function renderMoments() {
  return render(
    <MemoryRouter initialEntries={["/moments"]}>
      <Routes>
        <Route path="/moments" element={<MomentsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  fetchMomentsMock.mockClear();
  moderateMomentMock.mockClear();
  resolveMomentReportMock.mockClear();
});

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

test.serial(
  "groups the Reported queue and resolves one report at a time",
  async () => {
    const view = renderMoments();

    expect(await view.findByText("2 unresolved reports")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: /Inspect/ }));

    const drawer = await view.findByRole("dialog");
    expect(
      within(drawer).getAllByRole("button", { name: "Dismiss" })
    ).toHaveLength(2);
    expect(
      within(drawer).getAllByRole("button", { name: "Mark actioned" })
    ).toHaveLength(2);
    expect(view.queryByRole("button", { name: "Resolve" })).toBeNull();

    fireEvent.click(
      within(drawer).getAllByRole("button", { name: "Dismiss" })[0]
    );
    await waitFor(() =>
      expect(resolveMomentReportMock).toHaveBeenCalledWith(
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "dismissed"
      )
    );
  }
);

test.serial(
  "uses source-specific moderation actions for Recent and Hidden",
  async () => {
    const view = renderMoments();

    await view.findByText("Reported Moments");
    fireEvent.click(view.getByRole("tab", { name: "Recent" }));
    expect(await view.findByText("Recent Moments")).toBeTruthy();
    expect(view.getByRole("button", { name: "Hide" })).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Inspect" }));
    const drawer = await view.findByRole("dialog");
    expect(within(drawer).getByRole("button", { name: "Hide" })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(
      within(drawer).queryByRole("button", { name: "Dismiss" })
    ).toBeNull();
    const inspectButton = view.getByRole("button", { name: "Inspect" });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Close Moment details" })
    );
    await waitFor(() => expect(document.activeElement).toBe(inspectButton));

    fireEvent.click(view.getByRole("tab", { name: "Hidden" }));
    expect(await view.findByText("Hidden Moments")).toBeTruthy();
    expect(view.getByRole("button", { name: "Restore" })).toBeTruthy();
  }
);

test.serial(
  "requires an explicit confirmation and passes the removal reason",
  async () => {
    const view = renderMoments();

    fireEvent.click(await view.findByRole("tab", { name: "Recent" }));
    fireEvent.click(
      (await view.findAllByRole("button", { name: "Remove" }))[0]
    );

    const dialog = await view.findByRole("dialog", {
      name: "Remove this Moment?"
    });
    expect(dialog).toBeTruthy();
    fireEvent.change(
      within(dialog).getByRole("textbox", {
        name: "Optional moderation reason"
      }),
      {
        target: { value: "Unsafe content" }
      }
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(moderateMomentMock).toHaveBeenCalledWith(
        activeId,
        "removed",
        "Unsafe content"
      )
    );
  }
);
