function isLoopbackHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1"
  );
}

export function resolvePublicSiteOrigin(
  value: string | undefined,
  mode: string
) {
  const configured = value?.trim();
  if (!configured) {
    if (mode === "production") {
      throw new Error(
        "VITE_PUBLIC_SITE_URL is required for production Web builds."
      );
    }
    return "http://localhost:5173";
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    if (mode === "production") {
      throw new Error(
        "VITE_PUBLIC_SITE_URL must be a valid HTTPS public origin for production Web builds."
      );
    }
    return "http://localhost:5173";
  }

  if (
    mode === "production" &&
    (parsed.protocol !== "https:" || isLoopbackHost(parsed.hostname))
  ) {
    throw new Error(
      "VITE_PUBLIC_SITE_URL must be a valid HTTPS public origin for production Web builds."
    );
  }

  return parsed.origin;
}
