import { supabase, supabaseConfigurationError } from "../lib/supabase";

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

  const { data, error } = await supabase.auth.signInAnonymously();
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
