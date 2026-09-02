import { GlobalWindow } from "happy-dom";
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { getTurnstileToken } from "./index";

const browserWindow = new GlobalWindow();
const testWindow = browserWindow as unknown as Window;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let renderOptions: Parameters<NonNullable<Window["turnstile"]>["render"]>[1];

const turnstile = {
  render: mock(
    (
      _container: HTMLElement,
      options: Parameters<NonNullable<Window["turnstile"]>["render"]>[1]
    ) => {
      renderOptions = options;
      return "widget-1";
    }
  ),
  execute: mock(() => {
    renderOptions.callback("valid-turnstile-token");
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

test("executes an invisible widget and returns its token", async () => {
  await expect(getTurnstileToken("site-key")).resolves.toBe(
    "valid-turnstile-token"
  );
  expect(turnstile.render).toHaveBeenCalledTimes(1);
  expect(turnstile.render.mock.calls[0]?.[1]).toMatchObject({
    sitekey: "site-key",
    size: "invisible"
  });
  expect(turnstile.execute).toHaveBeenCalledWith("widget-1");
  expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
});

test("rejects a missing site key before loading Turnstile", async () => {
  await expect(getTurnstileToken(" ")).rejects.toThrow(
    "turnstile_site_key_missing"
  );
  expect(turnstile.render).not.toHaveBeenCalled();
});
