export const applicationMetadata = {
  web: { name: "WeMilktea" },
  admin: { name: "WeMilktea Admin" }
} as const;

export const imageStorageConfig = {
  maxBytes: 10 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp"] as const
} as const;

export function publicImageUrl(baseUrl: string, storageKey: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (
    !normalizedBaseUrl ||
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    storageKey.includes("//")
  ) {
    return null;
  }

  return `${normalizedBaseUrl}/${storageKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}
