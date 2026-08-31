import { GlobalWindow } from "happy-dom";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { PublicMoment } from "./data";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/moments";
Object.defineProperty(browserWindow, "confirm", {
  configurable: true,
  value: () => true
});
const browserGlobals = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "MutationObserver",
  "IntersectionObserver"
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

const firstMoment: PublicMoment = {
  id: "11111111-1111-4111-8111-111111111111",
  imageAssetId: "22222222-2222-4222-8222-222222222222",
  imageUrl: "https://images.example.test/one.webp",
  width: 1200,
  height: 900,
  caption: "A bright afternoon cup",
  displayName: "Harry",
  location: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Mellow Tea House",
    slug: "mellow-tea-house",
    text: null
  },
  product: {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Matcha Cloud Latte",
    slug: "matcha-cloud-latte",
    brandSlug: "gong-cha",
    text: null
  },
  createdAt: "2026-08-31T00:00:00.000Z",
  submittedAt: "2026-08-31T00:00:00.000Z",
  likeCount: 2,
  likedByMe: false,
  mustTryByMe: false
};

const secondMoment = {
  ...firstMoment,
  id: "55555555-5555-4555-8555-555555555555",
  imageUrl: "https://images.example.test/two.webp",
  caption: "",
  displayName: null,
  location: { id: null, name: null, slug: null, text: "Takapuna tea shop" },
  product: {
    id: null,
    name: null,
    slug: null,
    brandSlug: null,
    text: "Surprise jasmine drink"
  },
  likeCount: 0
};

type MockPage = {
  data: (typeof firstMoment)[];
  nextCursor: { submittedAt: string; id: string } | null;
  hasMore: boolean;
  error: string | null;
};

let nextPage: MockPage = {
  data: [firstMoment],
  nextCursor: null,
  hasMore: false,
  error: null
};
let ownIds = new Set<string>();
let deferNextPage = false;
let failNextPage = false;
let pendingNextPage: ((page: MockPage) => void) | null = null;
const pageCalls: Array<unknown> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

const auth = {
  getSession: mock(async () => ({ data: { session: null }, error: null })),
  signInAnonymously: mock(async () => ({
    data: {
      user: { id: "66666666-6666-4666-8666-666666666666" }
    },
    error: null
  }))
};

const supabaseMock = {
  auth,
  rpc: mock(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return { data: true, error: null };
  })
};

class FakeIntersectionObserver {
  static current: FakeIntersectionObserver | null = null;
  constructor(
    private readonly callback: (
      entries: Array<{ isIntersecting: boolean }>
    ) => void
  ) {
    FakeIntersectionObserver.current = this;
  }
  observe() {}
  disconnect() {
    if (FakeIntersectionObserver.current === this) {
      FakeIntersectionObserver.current = null;
    }
  }
  trigger() {
    this.callback([{ isIntersecting: true }]);
  }
}

Object.defineProperty(browserWindow, "IntersectionObserver", {
  configurable: true,
  value: FakeIntersectionObserver
});

mock.module("../lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));
mock.module("./data", () => ({
  loadOwnMomentIds: async () => ownIds,
  loadPublicMomentsPage: async (cursor: unknown) => {
    pageCalls.push(cursor);
    if (cursor && deferNextPage) {
      return new Promise<MockPage>((resolve) => {
        pendingNextPage = resolve;
      });
    }
    if (cursor && failNextPage) {
      return {
        data: null,
        nextCursor: null,
        hasMore: false,
        error: "query_failed"
      };
    }
    return nextPage;
  },
  momentReportReasons: [
    ["spam", "Spam"],
    ["harassment", "Harassment"],
    ["copyright", "Copyright"],
    ["unsafe", "Unsafe content"],
    ["other", "Other"]
  ]
}));

const { act, cleanup, fireEvent, render } =
  await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");
const { ThemeContext } = await import("../theme-context");
const { MomentsPage } = await import("./page");

function renderMoments() {
  return render(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={["/moments"]}>
        <MomentsPage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  nextPage = {
    data: [firstMoment],
    nextCursor: null,
    hasMore: false,
    error: null
  };
  ownIds = new Set();
  deferNextPage = false;
  failNextPage = false;
  pendingNextPage = null;
  FakeIntersectionObserver.current = null;
  pageCalls.length = 0;
  rpcCalls.length = 0;
  auth.getSession.mockClear();
  auth.signInAnonymously.mockClear();
  supabaseMock.rpc.mockClear();
});

afterEach(() => cleanup());

afterAll(() => {
  for (const property of browserGlobals) {
    const descriptor = originalGlobalDescriptors.get(property);
    if (descriptor) Object.defineProperty(globalThis, property, descriptor);
    else delete (globalThis as Record<string, unknown>)[property];
  }
});

test.serial(
  "renders photo-only and rich Moments without filler labels",
  async () => {
    nextPage = { ...nextPage, data: [firstMoment, secondMoment] };
    const view = renderMoments();

    expect(view.getByRole("status").getAttribute("aria-label")).toBe(
      "Loading Moments"
    );
    expect(await view.findByText(firstMoment.caption)).toBeTruthy();
    expect(view.getByText("Mellow Tea House")).toBeTruthy();
    expect(view.getByText("Matcha Cloud Latte")).toBeTruthy();
    expect(view.getByText("Takapuna tea shop")).toBeTruthy();
    expect(view.getByText("Surprise jasmine drink")).toBeTruthy();
    expect(view.queryByText("Unknown store")).toBeNull();
    expect(view.queryByText("Unknown drink")).toBeNull();
    expect(view.queryByText("Anonymous")).toBeNull();
    expect(
      view.getByRole("link", { name: "Mellow Tea House" }).getAttribute("href")
    ).toBe("/stores/mellow-tea-house");
    expect(
      view
        .getByRole("link", { name: "Matcha Cloud Latte" })
        .getAttribute("href")
    ).toBe("/drinks/gong-cha/matcha-cloud-latte");
    expect(pageCalls).toHaveLength(1);
  }
);

test.serial(
  "creates identity only on Like and persists the new state",
  async () => {
    const view = renderMoments();
    await view.findByText(firstMoment.caption);

    expect(auth.signInAnonymously).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Like this Moment" }));
    await act(async () => await Promise.resolve());

    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(rpcCalls[0]).toEqual({
      name: "like_community_post",
      args: { p_post_id: firstMoment.id }
    });
    expect(
      view.getByRole("button", { name: "Unlike this Moment" })
    ).toBeTruthy();
    expect(view.getByText("3")).toBeTruthy();
  }
);

test.serial(
  "shows Delete only for an own Moment and removes it after success",
  async () => {
    ownIds = new Set([firstMoment.id]);
    const view = renderMoments();
    await view.findByText(firstMoment.caption);

    fireEvent.click(view.getByRole("button", { name: "Open Moment actions" }));
    fireEvent.click(view.getByRole("menuitem", { name: "Delete" }));
    await act(async () => await Promise.resolve());

    expect(rpcCalls[0]?.name).toBe("delete_own_community_post");
    expect(view.queryByText(firstMoment.caption)).toBeNull();
  }
);

test.serial(
  "shows Report for another user's Moment and submits a supported reason",
  async () => {
    nextPage = { ...nextPage, data: [firstMoment, secondMoment] };
    const view = renderMoments();
    await view.findByText(firstMoment.caption);

    const trigger = view.getAllByRole("button", {
      name: "Open Moment actions"
    })[1]!;
    fireEvent.click(trigger);
    fireEvent.click(view.getByRole("menuitem", { name: "Report" }));
    fireEvent.change(view.getByLabelText("Report reason"), {
      target: { value: "spam" }
    });
    fireEvent.click(view.getByRole("button", { name: "Send report" }));
    await act(async () => await Promise.resolve());

    expect(rpcCalls.at(-1)).toEqual({
      name: "report_community_post",
      args: { p_details: null, p_post_id: secondMoment.id, p_reason: "spam" }
    });
    expect(view.getByRole("status").textContent).toBe("Report sent");
    expect(trigger).toBe(document.activeElement as HTMLElement);
  }
);

test.serial(
  "moves report focus into the form and restores it to the trigger",
  async () => {
    const view = renderMoments();
    await view.findByText(firstMoment.caption);

    const trigger = view.getByRole("button", { name: "Open Moment actions" });
    fireEvent.click(trigger);
    fireEvent.click(view.getByRole("menuitem", { name: "Report" }));
    await act(async () => await Promise.resolve());

    expect(view.getByLabelText("Report reason")).toBe(
      document.activeElement as HTMLElement
    );
    fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    await act(async () => await Promise.resolve());
    expect(trigger).toBe(document.activeElement as HTMLElement);

    fireEvent.click(trigger);
    fireEvent.click(view.getByRole("menuitem", { name: "Report" }));
    await act(async () => await Promise.resolve());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toBe(document.activeElement as HTMLElement);
  }
);

test.serial(
  "loads the next cursor once and deduplicates a repeated item",
  async () => {
    const secondPageMoment = { ...secondMoment, caption: "Second cup" };
    nextPage = {
      data: [firstMoment],
      nextCursor: { submittedAt: firstMoment.submittedAt, id: firstMoment.id },
      hasMore: true,
      error: null
    };
    const view = renderMoments();
    await view.findByText(firstMoment.caption);

    nextPage = {
      data: [firstMoment, secondPageMoment],
      nextCursor: null,
      hasMore: false,
      error: null
    };
    await act(async () => {
      FakeIntersectionObserver.current?.trigger();
      await Promise.resolve();
    });

    expect(await view.findByText("Second cup")).toBeTruthy();
    expect(view.getAllByText(firstMoment.caption)).toHaveLength(1);
    expect(pageCalls).toEqual([
      undefined,
      { submittedAt: firstMoment.submittedAt, id: firstMoment.id }
    ]);
  }
);

test.serial(
  "ignores a stale next-page response after the feed is replaced",
  async () => {
    const secondPageMoment = { ...secondMoment, caption: "Stale cup" };
    nextPage = {
      data: [firstMoment],
      nextCursor: { submittedAt: firstMoment.submittedAt, id: firstMoment.id },
      hasMore: true,
      error: null
    };
    const firstView = renderMoments();
    await firstView.findByText(firstMoment.caption);
    deferNextPage = true;
    await act(async () => {
      FakeIntersectionObserver.current?.trigger();
      await Promise.resolve();
    });
    cleanup();

    deferNextPage = false;
    const replacementView = renderMoments();
    await replacementView.findByText(firstMoment.caption);
    pendingNextPage?.({
      data: [secondPageMoment],
      nextCursor: null,
      hasMore: false,
      error: null
    });
    await act(async () => await Promise.resolve());

    expect(replacementView.queryByText("Stale cup")).toBeNull();
  }
);

test.serial(
  "preserves the feed and retries a failed next-page request",
  async () => {
    const secondPageMoment = { ...secondMoment, caption: "Retry cup" };
    nextPage = {
      data: [firstMoment],
      nextCursor: { submittedAt: firstMoment.submittedAt, id: firstMoment.id },
      hasMore: true,
      error: null
    };
    failNextPage = true;
    const view = renderMoments();
    await view.findByText(firstMoment.caption);
    await act(async () => {
      FakeIntersectionObserver.current?.trigger();
      await Promise.resolve();
    });

    expect(view.getByRole("alert").textContent).toContain("couldn’t load");
    expect(view.getByText(firstMoment.caption)).toBeTruthy();
    failNextPage = false;
    nextPage = {
      data: [secondPageMoment],
      nextCursor: null,
      hasMore: false,
      error: null
    };
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    expect(await view.findByText("Retry cup")).toBeTruthy();
  }
);
