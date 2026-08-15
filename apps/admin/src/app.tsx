import { applicationMetadata } from "@wemilktea/config";
import { FormEvent, lazy, Suspense, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { useAdminAuth } from "./auth-context";
import { AdminAuthProvider } from "./auth-provider";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import { LoadingRegion, Skeleton } from "./loading";
import { AdminSeo } from "./seo";

const CandidateQueuePage = lazy(() =>
  import("./candidates").then((module) => ({
    default: module.CandidateQueuePage
  }))
);
const CandidateReviewPage = lazy(() =>
  import("./candidates").then((module) => ({
    default: module.CandidateReviewPage
  }))
);
const StoresPage = lazy(() =>
  import("./stores").then((module) => ({ default: module.StoresPage }))
);
const StoreManagementPage = lazy(() =>
  import("./stores").then((module) => ({
    default: module.StoreManagementPage
  }))
);
const SubmissionsPage = lazy(() =>
  import("./submissions").then((module) => ({
    default: module.SubmissionsPage
  }))
);
const ProductsPage = lazy(() =>
  import("./products").then((module) => ({ default: module.ProductsPage }))
);
const ProductManagementPage = lazy(() =>
  import("./products").then((module) => ({
    default: module.ProductManagementPage
  }))
);

function RouteLoading() {
  return (
    <LoadingRegion label="Loading page" className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </LoadingRegion>
  );
}

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Stores", "/stores"],
  ["Candidates", "/candidates"],
  ["Submissions", "/submissions"],
  ["Products", "/products"]
] as const;

function LoadingState() {
  return (
    <main
      className="grid min-h-screen place-items-center p-6"
      aria-live="polite"
    >
      <LoadingRegion
        label="Resolving admin access"
        className="w-full max-w-md space-y-4"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </LoadingRegion>
    </main>
  );
}

function AuthErrorState() {
  const { state, retry } = useAdminAuth();

  if (state.kind !== "error") {
    return null;
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Admin access unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <button
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          type="button"
          onClick={retry}
        >
          Try again
        </button>
      </section>
    </main>
  );
}

function RequireAdmin() {
  const { state } = useAdminAuth();

  if (state.kind === "loading") {
    return <LoadingState />;
  }

  if (state.kind === "error") {
    return <AuthErrorState />;
  }

  if (state.kind === "signed-out") {
    return <Navigate to="/login" replace />;
  }

  if (state.kind === "unauthorized") {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}

function LoginPage() {
  const { state } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (state.kind === "loading") {
    return <LoadingState />;
  }

  if (state.kind === "error") {
    return <AuthErrorState />;
  }

  if (state.kind === "authorized") {
    return <Navigate to="/dashboard" replace />;
  }

  if (state.kind === "unauthorized") {
    return <Navigate to="/unauthorized" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage(supabaseConfigurationError);
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(
        error.message.toLowerCase().includes("invalid login")
          ? "Incorrect email or password."
          : "We could not sign you in. Please check your connection and try again."
      );
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-primary">
          {applicationMetadata.admin.name}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your approved internal administrator account.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function UnauthorizedPage() {
  const { signOut, state } = useAdminAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (state.kind === "authorized") {
    return <Navigate to="/dashboard" replace />;
  }

  if (state.kind === "signed-out") {
    return <Navigate to="/login" replace />;
  }

  if (state.kind === "loading") {
    return <LoadingState />;
  }

  if (state.kind === "error") {
    return <AuthErrorState />;
  }

  const handleSignOut = async () => {
    setErrorMessage(await signOut());
  };

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Admin access is not approved</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.email
            ? `${state.email} is signed in, but it is not an approved administrator.`
            : "This account is not an approved administrator."}
        </p>
        {errorMessage ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <button
          className="mt-5 rounded-md border border-border px-4 py-2 text-sm font-medium"
          type="button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}

function AdminShell() {
  const { signOut, state } = useAdminAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    setErrorMessage(await signOut());
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-sm font-semibold">
              {applicationMetadata.admin.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {state.kind === "authorized" ? state.email : null}
            </p>
          </div>
          <button
            className="rounded-md border border-border px-3 py-2 text-sm font-medium"
            type="button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 md:grid-cols-[11rem_1fr]">
        <nav
          aria-label="Admin navigation"
          className="flex gap-2 overflow-x-auto md:flex-col"
        >
          {navigation.map(([label, to]) => (
            <NavLink
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`
              }
              key={to}
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main>
          {errorMessage ? (
            <p className="mb-4 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PlaceholderPage({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </section>
  );
}

export function App() {
  return (
    <>
      <AdminSeo />
      <AdminAuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <PlaceholderPage
                    title="Dashboard"
                    description="Operational overview will be added in a future ticket."
                  />
                }
              />
              <Route
                path="/stores"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <StoresPage />
                  </Suspense>
                }
              />
              <Route
                path="/stores/:locationId"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <StoreManagementPage />
                  </Suspense>
                }
              />
              <Route
                path="/candidates"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <CandidateQueuePage />
                  </Suspense>
                }
              />
              <Route
                path="/candidates/:candidateId"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <CandidateReviewPage />
                  </Suspense>
                }
              />
              <Route
                path="/submissions"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <SubmissionsPage />
                  </Suspense>
                }
              />
              <Route
                path="/products"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <ProductsPage />
                  </Suspense>
                }
              />
              <Route
                path="/products/:productId"
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <ProductManagementPage />
                  </Suspense>
                }
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AdminAuthProvider>
    </>
  );
}
