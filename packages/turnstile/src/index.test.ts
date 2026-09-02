import { GlobalWindow } from "happy-dom";
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { getTurnstileToken } from "./index";

const browserWindow = new GlobalWindow();
const testWindow = browserWindow as unknown as Window;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const scriptSelector =
  'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]';
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
  document.head
    .querySelectorAll(scriptSelector)
    .forEach((script) => script.remove());
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

test("retries after a failed Turnstile script load", async () => {
  testWindow.turnstile = undefined;
  const firstScript = document.createElement("script");
  firstScript.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  document.head.append(firstScript);
  const firstPromise = getTurnstileToken("site-key");
  firstScript.dispatchEvent(
    new browserWindow.Event("error") as unknown as Event
  );

  await expect(firstPromise).rejects.toThrow("turnstile_unavailable");
  expect(document.querySelectorAll(scriptSelector)).toHaveLength(0);

  const secondScript = document.createElement("script");
  secondScript.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  document.head.append(secondScript);
  const secondPromise = getTurnstileToken("site-key");
  testWindow.turnstile = turnstile;
  secondScript.dispatchEvent(
    new browserWindow.Event("load") as unknown as Event
  );

  await expect(secondPromise).resolves.toBe("valid-turnstile-token");
  expect(turnstile.render).toHaveBeenCalledTimes(1);
  expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  expect(document.body.children).toHaveLength(0);
});
