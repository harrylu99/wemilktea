import { useCallback, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { AdminAuthContext } from "./auth-context";
import { resolveAdminAuthState, type AdminAuthState } from "./lib/auth-state";
import { supabase, supabaseConfigurationError } from "./lib/supabase";

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AdminAuthState>(() =>
    supabaseConfigurationError
      ? { kind: "error", message: supabaseConfigurationError }
      : { kind: "loading" }
  );
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const client = supabase;

    if (!client) {
      return;
    }

    let active = true;
    let requestId = 0;

    const resolveSession = async (
      session: Parameters<typeof resolveAdminAuthState>[0]
    ) => {
      const currentRequest = ++requestId;

      if (!session) {
        if (active) {
          setState(resolveAdminAuthState(null, false));
        }
        return;
      }

      const { data, error } = await client.rpc("is_admin");

      if (!active || currentRequest !== requestId) {
        return;
      }

      if (error || typeof data !== "boolean") {
        setState({
          kind: "error",
          message: "We could not confirm your admin access. Please try again."
        });
        return;
      }

      setState(resolveAdminAuthState(session, data));
    };

    const restoreSession = async () => {
      setState({ kind: "loading" });
      const {
        data: { session },
        error
      } = await client.auth.getSession();

      if (!active) {
        return;
      }

      if (error) {
        setState({
          kind: "error",
          message: "We could not restore your session. Please try again."
        });
        return;
      }

      await resolveSession(session);
    };

    void restoreSession();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void resolveSession(session);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [retryCount]);

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
  }, []);

  const signOut = useCallback(async () => {
    const client = supabase;

    if (!client) {
      return supabaseConfigurationError;
    }

    const { error } = await client.auth.signOut();

    if (error) {
      const message = "We could not sign you out. Please try again.";
      setState({ kind: "error", message });
      return message;
    }

    setState({ kind: "signed-out" });
    return null;
  }, []);

  return (
    <AdminAuthContext.Provider value={{ state, retry, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
