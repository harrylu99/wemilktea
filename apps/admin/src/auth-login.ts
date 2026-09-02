import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminTurnstileToken } from "./turnstile";

export async function signInAdmin(
  client: SupabaseClient,
  email: string,
  password: string,
  getToken = getAdminTurnstileToken
) {
  let captchaToken: string;
  try {
    captchaToken = await getToken();
  } catch {
    return { error: new Error("captcha_unavailable") };
  }
  if (!captchaToken.trim()) return { error: new Error("captcha_unavailable") };

  return client.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken }
  });
}
