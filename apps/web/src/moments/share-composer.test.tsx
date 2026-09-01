import { GlobalWindow } from "happy-dom";
import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";

const browserWindow = new GlobalWindow();
browserWindow.location.href = "http://localhost:5173/moments";
const browserGlobals = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Node",
  "Element",
  "Text",
  "Event",
  "EventTarget",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "MutationObserver",
  "File",
  "Blob"
] as const;
const originalGlobalDescriptors = new Map(
  browserGlobals.map((property) => [
    property,
    Object.getOwnPropertyDescriptor(globalThis, property)
  ])
);
const originalUrl = Object.getOwnPropertyDescriptor(globalThis, "URL");
const revokedUrls: string[] = [];

function installBrowserGlobals() {
  for (const property of browserGlobals) {
    Object.defineProperty(globalThis, property, {
      configurable: true,
      value: browserWindow[property]
    });
  }
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: {
      createObjectURL: () => "blob:moment-preview",
      revokeObjectURL: (value: string) => revokedUrls.push(value)
    }
  });
}

installBrowserGlobals();

const identity = {
  ensurePublicWriteIdentity: mock(async () => ({
    userId: "66666666-6666-4666-8666-666666666666",
    error: null
  }))
};
const normalizedFile = new File(["normalized"], "moment.webp", {
  type: "image/webp"
});
const normalization = {
  normalizeMomentImage: mock(async () => ({
    file: normalizedFile,
    width: 2048,
    height: 1536,
    byteSize: normalizedFile.size,
    contentType: "image/webp" as const
  }))
};
const upload = {
  uploadMomentImage: mock(async () => ({
    postId: "77777777-7777-4777-8777-777777777777",
    imageAssetId: "88888888-8888-4888-8888-888888888888",
    storageKey: "community/final.webp",
    contentType: "image/webp" as const,
    byteSize: normalizedFile.size,
    width: 2048,
    height: 1536
  })),
  MomentImageUploadError: class MomentImageUploadError extends Error {}
};

let draftId = "77777777-7777-4777-8777-777777777777";
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let failUpload = false;
let uploadAttempts = 0;
let searchResult = { drinks: [], stores: [] };
const supabaseMock = {
  auth: {
    getSession: mock(async () => ({ data: { session: null }, error: null })),
    signInAnonymously: mock(async () => ({
      data: { user: { id: "66666666-6666-4666-8666-666666666666" } },
      error: null
    }))
  },
  rpc: mock(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (name === "create_community_post_draft")
      return { data: draftId, error: null };
    return { data: true, error: null };
  }),
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { status: "draft", image_asset_id: null, deleted_at: null },
          error: null
        })
      })
    })
  })
};

mock.module("../lib/supabase", () => ({
  supabase: supabaseMock,
  supabaseConfigurationError: null
}));
mock.module("./identity", () => identity);
mock.module("../moments-image-normalization", () => ({
  MomentImageError: class MomentImageError extends Error {},
  normalizeMomentImage: normalization.normalizeMomentImage
}));
mock.module("../moments-image-upload", () => ({
  MomentImageUploadError: upload.MomentImageUploadError,
  uploadMomentImage: async (
    ...args: Parameters<typeof upload.uploadMomentImage>
  ) => {
    uploadAttempts += 1;
    if (failUpload) throw new upload.MomentImageUploadError("failed");
    return upload.uploadMomentImage(...args);
  }
}));
mock.module("../discovery/data", () => ({
  loadPublicSearchResults: async () => ({ data: searchResult, error: null })
}));

const { act, cleanup, fireEvent, render, waitFor } =
  await import("@testing-library/react");
const { ShareMomentComposer } = await import("./share-composer");

function renderComposer() {
  return render(
    <ShareMomentComposer
      open
      onClose={() => undefined}
      onSuccess={() => undefined}
      returnFocusRef={{ current: null }}
    />
  );
}

function selectFile(view: ReturnType<typeof render>) {
  const input = view.container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  fireEvent.change(input, {
    target: {
      files: [new File(["source"], "photo.jpg", { type: "image/jpeg" })]
    }
  });
}

beforeEach(() => {
  installBrowserGlobals();
  rpcCalls = [];
  failUpload = false;
  uploadAttempts = 0;
  searchResult = { drinks: [], stores: [] };
  draftId = "77777777-7777-4777-8777-777777777777";
  identity.ensurePublicWriteIdentity.mockClear();
  normalization.normalizeMomentImage.mockClear();
  upload.uploadMomentImage.mockClear();
  supabaseMock.rpc.mockClear();
  supabaseMock.auth.getSession.mockClear();
  supabaseMock.auth.signInAnonymously.mockClear();
  revokedUrls.length = 0;
});

afterEach(() => cleanup());

afterAll(() => {
  for (const property of browserGlobals) {
    const descriptor = originalGlobalDescriptors.get(property);
    if (descriptor) Object.defineProperty(globalThis, property, descriptor);
    else delete (globalThis as Record<string, unknown>)[property];
  }
  if (originalUrl) Object.defineProperty(globalThis, "URL", originalUrl);
});

test("does not create write identity until a valid Share submission", async () => {
  const view = renderComposer();

  expect(identity.ensurePublicWriteIdentity).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole("button", { name: "Share" }));
  expect(
    await view.findByText("Add a photo to share your Moment.")
  ).toBeTruthy();
  expect(identity.ensurePublicWriteIdentity).not.toHaveBeenCalled();
  expect(rpcCalls).toHaveLength(0);
});

test("supports the photo-only happy path and activates through WM-109", async () => {
  const view = renderComposer();
  selectFile(view);
  await waitFor(() =>
    expect(view.getByAltText("Selected Moment preview")).toBeTruthy()
  );

  fireEvent.click(view.getByRole("button", { name: "Share" }));
  await waitFor(() =>
    expect(view.getByText("Your Moment is live 🧋")).toBeTruthy()
  );

  expect(identity.ensurePublicWriteIdentity).toHaveBeenCalledTimes(1);
  expect(rpcCalls).toEqual([
    {
      name: "create_community_post_draft",
      args: {
        p_caption: "",
        p_display_name: null,
        p_location_id: null,
        p_location_text: null,
        p_product_id: null,
        p_product_text: null
      }
    }
  ]);
  expect(upload.uploadMomentImage).toHaveBeenCalledTimes(1);
});

test("does not abandon a Moment when closing its success state", async () => {
  const view = renderComposer();
  selectFile(view);
  await waitFor(() =>
    expect(view.getByAltText("Selected Moment preview")).toBeTruthy()
  );

  fireEvent.click(view.getByRole("button", { name: "Share" }));
  await waitFor(() =>
    expect(view.getByText("Your Moment is live 🧋")).toBeTruthy()
  );

  fireEvent.click(view.getByRole("button", { name: "Done" }));

  expect(
    rpcCalls.some((call) => call.name === "delete_own_community_post")
  ).toBe(false);
});

test("maps canonical selections and free text without creating catalogue records", async () => {
  searchResult = {
    drinks: [
      { id: "drink-id", name: "Matcha Cloud", brandSlug: "brand-a" }
    ] as never,
    stores: []
  };
  const view = renderComposer();
  selectFile(view);
  await waitFor(() =>
    expect(view.getByAltText("Selected Moment preview")).toBeTruthy()
  );
  fireEvent.click(
    view.getByRole("button", { name: /Add drink or store details/ })
  );
  fireEvent.change(
    view.getByRole("combobox", { name: /What are you drinking/ }),
    {
      target: { value: "Matcha" }
    }
  );
  await waitFor(() => expect(view.getByRole("option")).toBeTruthy());
  fireEvent.click(view.getByRole("option").querySelector("button")!);
  fireEvent.change(
    view.getByRole("combobox", { name: /Where did you get it/ }),
    {
      target: { value: "Takapuna tea shop" }
    }
  );
  fireEvent.click(view.getByRole("button", { name: "Share" }));
  await waitFor(() =>
    expect(view.getByText("Your Moment is live 🧋")).toBeTruthy()
  );

  expect(rpcCalls[0]).toEqual({
    name: "create_community_post_draft",
    args: {
      p_caption: "",
      p_display_name: null,
      p_location_id: null,
      p_location_text: "Takapuna tea shop",
      p_product_id: "drink-id",
      p_product_text: null
    }
  });
});

test("reuses the same owned draft after a retryable upload failure", async () => {
  const view = renderComposer();
  selectFile(view);
  await waitFor(() =>
    expect(view.getByAltText("Selected Moment preview")).toBeTruthy()
  );
  failUpload = true;
  fireEvent.click(view.getByRole("button", { name: "Share" }));
  await waitFor(() =>
    expect(
      view.getByText("Your photo could not be uploaded. Try again.")
    ).toBeTruthy()
  );

  failUpload = false;
  fireEvent.click(view.getByRole("button", { name: "Share" }));
  await waitFor(() =>
    expect(view.getByText("Your Moment is live 🧋")).toBeTruthy()
  );

  expect(
    rpcCalls.filter((call) => call.name === "create_community_post_draft")
  ).toHaveLength(1);
  expect(uploadAttempts).toBe(2);
});

test("revokes the normalized preview when the composer closes", async () => {
  let closed = false;
  const view = render(
    <ShareMomentComposer
      open
      onClose={() => {
        closed = true;
      }}
      onSuccess={() => undefined}
      returnFocusRef={{ current: null }}
    />
  );
  selectFile(view);
  await waitFor(() =>
    expect(view.getByAltText("Selected Moment preview")).toBeTruthy()
  );
  fireEvent.click(
    view.getByRole("button", { name: "Close Share your moment" })
  );
  expect(closed).toBe(true);
  expect(revokedUrls).toContain("blob:moment-preview");
  await act(async () => undefined);
});
