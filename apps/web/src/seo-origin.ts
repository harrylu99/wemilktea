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
  workersCiBranch: string | undefined
) {
  const isMainWorkersBuild = workersCiBranch?.trim() === "main";
  const configured = value?.trim();
  if (!configured) {
    if (isMainWorkersBuild) {
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
    if (isMainWorkersBuild) {
      throw new Error(
        "VITE_PUBLIC_SITE_URL must be a valid HTTPS public origin for production Web builds."
      );
    }
    return "http://localhost:5173";
  }

  if (
    isMainWorkersBuild &&
    (parsed.protocol !== "https:" || isLoopbackHost(parsed.hostname))
  ) {
    throw new Error(
      "VITE_PUBLIC_SITE_URL must be a valid HTTPS public origin for production Web builds."
    );
  }

  return parsed.origin;
}

export function shouldNoIndexWebBuild(
  configuredNoIndex: string | undefined,
  workersCiBranch: string | undefined
) {
  const branch = workersCiBranch?.trim();
  return configuredNoIndex === "true" || Boolean(branch && branch !== "main");
}
