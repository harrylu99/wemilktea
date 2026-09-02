import { supabase, supabaseConfigurationError } from "../lib/supabase";
import { getWebTurnstileToken } from "../turnstile";

let identityPromise: ReturnType<typeof ensurePublicWriteIdentity> | null = null;

export type PublicWriteIdentityResult =
  { userId: string; error: null } | { userId: null; error: string };

async function createOrReuseIdentity(): Promise<PublicWriteIdentityResult> {
  if (!supabase) {
    return {
      userId: null,
      error: supabaseConfigurationError ?? "configuration_missing"
    };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) return { userId: null, error: "identity_unavailable" };
  if (sessionData.session?.user.id) {
    return { userId: sessionData.session.user.id, error: null };
  }

  let captchaToken: string;
  try {
    captchaToken = await getWebTurnstileToken();
  } catch {
    return { userId: null, error: "captcha_unavailable" };
  }
  if (!captchaToken.trim()) {
    return { userId: null, error: "captcha_unavailable" };
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { captchaToken }
  });
  if (error || !data.user) {
    return { userId: null, error: error?.message ?? "identity_unavailable" };
  }
  return { userId: data.user.id, error: null };
}

export function ensurePublicWriteIdentity(): Promise<PublicWriteIdentityResult> {
  if (!identityPromise) {
    identityPromise = createOrReuseIdentity().finally(() => {
      identityPromise = null;
    });
  }
  return identityPromise;
}
