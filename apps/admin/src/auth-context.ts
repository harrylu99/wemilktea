import { createContext, useContext } from "react";
import type { AdminAuthState } from "./lib/auth-state";

export type AdminAuthContextValue = {
  state: AdminAuthState;
  retry: () => void;
  signOut: () => Promise<string | null>;
};

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(
  null
);

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }

  return context;
}
