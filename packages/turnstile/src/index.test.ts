import { GlobalWindow } from "happy-dom";
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { getTurnstileToken } from "./index";

const browserWindow = new GlobalWindow();
const testWindow = browserWindow as unknown as Window;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let renderOptions: Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
let renderContainer: Parameters<NonNullable<Window["turnstile"]>["render"]>[0];
let renderOutcome: "success" | "empty" | "error" | "expired" = "success";

const turnstile = {
  render: mock(
    (
      container: Parameters<NonNullable<Window["turnstile"]>["render"]>[0],
      options: Parameters<NonNullable<Window["turnstile"]>["render"]>[1]
    ) => {
      renderContainer = container;
      renderOptions = options;
      return "widget-1";
    }
  ),
  execute: mock(() => {
    if (renderOutcome === "success") {
      renderOptions.callback("valid-turnstile-token");
    } else if (renderOutcome === "empty") {
      renderOptions.callback(" ");
    } else if (renderOutcome === "error") {
      renderOptions["error-callback"]("network-error");
    } else {
      renderOptions["expired-callback"]();
    }
  }),
  remove: mock(() => undefined)
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: browserWindow
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: browserWindow.document
});

beforeEach(() => {
  testWindow.turnstile = turnstile;
  turnstile.render.mockClear();
  turnstile.execute.mockClear();
  turnstile.remove.mockClear();
  renderOutcome = "success";
  renderOptions = undefined as never;
  renderContainer = undefined as never;
  document.body.replaceChildren();
});

afterAll(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument
  });
});

test("renders for manual execution and returns its token", async () => {
  await expect(getTurnstileToken("site-key")).resolves.toBe(
    "valid-turnstile-token"
  );
  expect(turnstile.render).toHaveBeenCalledTimes(1);
  expect(turnstile.render.mock.calls[0]?.[1]).toMatchObject({
    sitekey: "site-key",
    execution: "execute"
  });
  expect(turnstile.render.mock.calls[0]?.[1]).not.toHaveProperty("size");
  expect(turnstile.execute).toHaveBeenCalledWith(renderContainer);
  expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  expect(document.body.children).toHaveLength(0);
});

test.each([
  ["empty", "turnstile_token_missing"],
  ["error", "turnstile_failed"],
  ["expired", "turnstile_expired"]
] as const)("fails closed on %s callback", async (outcome, error) => {
  renderOutcome = outcome;
  await expect(getTurnstileToken("site-key")).rejects.toThrow(error);
  expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  expect(document.body.children).toHaveLength(0);
});

test("rejects a missing site key before loading Turnstile", async () => {
  await expect(getTurnstileToken(" ")).rejects.toThrow(
    "turnstile_site_key_missing"
  );
  expect(turnstile.render).not.toHaveBeenCalled();
});

test("rejects when the Turnstile script fails to load", async () => {
  testWindow.turnstile = undefined;
  const script = document.createElement("script");
  script.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  document.head.append(script);

  const promise = getTurnstileToken("site-key");
  script.dispatchEvent(new browserWindow.Event("error") as unknown as Event);

  await expect(promise).rejects.toThrow("turnstile_unavailable");
  expect(document.body.children).toHaveLength(0);
});
