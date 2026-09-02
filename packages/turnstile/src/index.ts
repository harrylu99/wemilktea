const turnstileScriptUrl =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const tokenTimeoutMs = 30_000;

type TurnstileWidgetId = string | number;

export type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size: "invisible";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    }
  ) => TurnstileWidgetId;
  execute: (widgetId: TurnstileWidgetId) => void;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("turnstile_unavailable"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${turnstileScriptUrl}"]`
    );
    const script = existingScript ?? document.createElement("script");
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile_unavailable"));
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("turnstile_unavailable")),
      { once: true }
    );
    if (!existingScript) {
      script.async = true;
      script.src = turnstileScriptUrl;
      document.head.append(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export async function getTurnstileToken(siteKey: string): Promise<string> {
  if (!siteKey.trim()) throw new Error("turnstile_site_key_missing");
  const api = await loadTurnstile();
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden";
  document.body.append(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId: TurnstileWidgetId | null = null;
    const timeout = window.setTimeout(() => {
      if (widgetId !== null) api.remove(widgetId);
      container.remove();
      reject(new Error("turnstile_timeout"));
    }, tokenTimeoutMs);
    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      if (widgetId !== null) api.remove(widgetId);
      container.remove();
      callback();
    };

    try {
      widgetId = api.render(container, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token) =>
          finish(() =>
            token.trim()
              ? resolve(token)
              : reject(new Error("turnstile_token_missing"))
          ),
        "error-callback": () =>
          finish(() => reject(new Error("turnstile_failed"))),
        "expired-callback": () =>
          finish(() => reject(new Error("turnstile_expired")))
      });
      api.execute(widgetId);
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new Error("turnstile_failed"))
      );
    }
  });
}
