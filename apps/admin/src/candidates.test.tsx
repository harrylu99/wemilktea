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
  "HTMLSelectElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "MutationObserver"
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
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

const timestamp = "2026-08-19T00:00:00.000Z";
const succeededDiscoveryResult = {
  runId: "c1af35e6-e2d2-490f-82ca-2137b8f106d4",
  status: "succeeded",
  queryCount: 8,
  resultCount: 10,
  newCandidateCount: 2,
  knownCount: 8,
  possibleDuplicateCount: 0,
  errorSummary: null
};
const candidates = Array.from({ length: 50 }, (_, index) => {
  const number = index + 1;
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    google_place_id: `place-${number}`,
    status: number <= 30 ? "approved" : "rejected",
    source_provenance: "google_places",
    first_seen_at: timestamp,
    last_seen_at: timestamp,
    reviewed_at: timestamp,
    possible_location_id: null,
    resolved_location_id: null,
    rejection_reason: null
  };
});

const queryRequests: Array<{
  status: string | null;
  from: number;
  to: number;
  countOption: string;
  orderFields: string[];
}> = [];

function candidateQuery() {
  let status: string | null = null;
  let countOption = "";
  const orderFields: string[] = [];
  const query = {
    select: (_selection: string, options?: { count?: string }) => {
      countOption = options?.count ?? "";
      return query;
    },
    eq: (_field: string, value: string) => {
      status = value;
      return query;
    },
    order: (field: string) => {
      orderFields.push(field);
      return query;
    },
    range: (from: number, to: number) => {
      const matching = status
        ? candidates.filter((candidate) => candidate.status === status)
        : candidates;
      queryRequests.push({
        status,
        from,
        to,
        countOption,
        orderFields: [...orderFields]
      });
      return Promise.resolve({
        data: matching.slice(from, to + 1),
        error: null,
        count: matching.length
      });
    }
  };
  return query;
}

const supabaseMock = {
  from: () => candidateQuery(),
  functions: {
    invoke: mock(() =>
      Promise.resolve({ data: succeededDiscoveryResult, error: null })
    )
  }
};

mock.module("./lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));

const { CandidateQueuePage } = await import("./candidates");

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderCandidates(initialEntry = "/candidates") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/candidates" element={<CandidateQueuePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installBrowserGlobals();
  queryRequests.length = 0;
});

afterEach(() => {
  installBrowserGlobals();
  cleanup();
});

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  "requests only one page with a deterministic server-side query",
  async () => {
    const view = renderCandidates();

    expect(await view.findByText("place-1")).toBeTruthy();
    expect(view.getAllByRole("row")).toHaveLength(26);
    expect(queryRequests[0]).toEqual({
      status: null,
      from: 0,
      to: 24,
      countOption: "exact",
      orderFields: ["last_seen_at", "id"]
    });

    expect(
      (
        view.getByRole("button", {
          name: "Previous page"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        view.getByRole("button", {
          name: "Next page"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "Next page" }));
    expect(await view.findByText("place-26")).toBeTruthy();
    expect(view.getByTestId("location").textContent).toBe("/candidates?page=2");
    expect(queryRequests.at(-1)).toMatchObject({ from: 25, to: 49 });

    expect(
      (
        view.getByRole("button", {
          name: "Next page"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Previous page" }));
    expect(await view.findByText("place-1")).toBeTruthy();
    expect(view.getByTestId("location").textContent).toBe("/candidates");
  }
);

test.serial(
  "applies status filtering before pagination and resets page",
  async () => {
    const view = renderCandidates("/candidates?status=approved&page=2");

    expect(await view.findByText("place-26")).toBeTruthy();
    expect(queryRequests[0]).toMatchObject({
      status: "approved",
      from: 25,
      to: 49
    });

    fireEvent.change(view.getByLabelText("Filter candidates"), {
      target: { value: "rejected" }
    });
    expect(await view.findByText("place-31")).toBeTruthy();
    expect(view.getByTestId("location").textContent).toBe(
      "/candidates?status=rejected"
    );
    expect(queryRequests.at(-1)).toMatchObject({
      status: "rejected",
      from: 0,
      to: 24
    });
  }
);

test.serial("normalizes an out-of-range page to the final page", async () => {
  const view = renderCandidates("/candidates?page=999");

  expect(await view.findByText("place-26")).toBeTruthy();
  expect(view.getByTestId("location").textContent).toBe("/candidates?page=2");
  expect(queryRequests.at(-1)).toMatchObject({ from: 25, to: 49 });
});

test.serial(
  "keeps the empty state and hides pagination for zero results",
  async () => {
    const view = renderCandidates("/candidates?status=new");

    expect(
      await view.findByText("No candidates match this filter.")
    ).toBeTruthy();
    expect(view.queryByRole("button", { name: "Previous page" })).toBeNull();
    expect(view.queryByRole("button", { name: "Next page" })).toBeNull();
    expect(queryRequests[0]).toMatchObject({
      status: "new",
      from: 0,
      to: 24
    });
  }
);

test.serial(
  "resets to page one and reloads after successful discovery",
  async () => {
    const view = renderCandidates("/candidates?page=2");

    expect(await view.findByText("place-26")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Run store discovery" }));

    expect(await view.findByText("Candidates list refreshed.")).toBeTruthy();
    expect(await view.findByText("place-1")).toBeTruthy();
    expect(view.getByTestId("location").textContent).toBe("/candidates");
    expect(queryRequests.at(-1)).toMatchObject({ from: 0, to: 24 });
  }
);
