import { getTurnstileToken } from "@wemilktea/turnstile";

export function getWebTurnstileToken() {
  return getTurnstileToken(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "");
}
