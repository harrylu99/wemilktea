import { getTurnstileToken } from "@wemilktea/turnstile";

export function getAdminTurnstileToken() {
  return getTurnstileToken(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "");
}
