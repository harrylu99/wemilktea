import { useEffect } from "react";
import { publicUrl } from "./seo-utils";

const defaultImagePath = "/og-default.svg";
const publicBuildIsNoIndex = import.meta.env.VITE_PUBLIC_NO_INDEX === "true";
const noIndexRobots = "noindex, nofollow, noarchive, nosnippet";

export type SeoProps = {
  title: string;
  description: string;
  path?: string;
  imageUrl?: string | null;
  type?: "website" | "article" | "product";
  robots?: string;
  jsonLd?: Record<string, unknown> | null;
};

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string
) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
  element.dataset.wemilkteaSeo = "true";
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]'
  );
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = href;
  element.dataset.wemilkteaSeo = "true";
}

function upsertJsonLd(value: Record<string, unknown> | null | undefined) {
  document.head
    .querySelectorAll('script[data-wemilktea-seo="jsonld"]')
    .forEach((element) => element.remove());
  if (!value) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.wemilkteaSeo = "jsonld";
  // Escape the only sequence that can terminate an inline script element.
  script.textContent = JSON.stringify(value).replace(/</g, "\\u003c");
  document.head.append(script);
}

export function Seo({
  title,
  description,
  path = typeof window === "undefined" ? "/" : window.location.pathname,
  imageUrl,
  type = "website",
  robots = "index, follow",
  jsonLd
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = publicUrl(path);
    const socialImage = imageUrl
      ? publicUrl(imageUrl)
      : publicUrl(defaultImagePath);
    const effectiveRobots = publicBuildIsNoIndex ? noIndexRobots : robots;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", effectiveRobots);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:site_name", "WeMilktea");
    upsertMeta("property", "og:image", socialImage);
    upsertMeta("property", "og:image:alt", title);
    upsertMeta(
      "name",
      "twitter:card",
      imageUrl ? "summary_large_image" : "summary"
    );
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", socialImage);
    upsertCanonical(canonicalUrl);
    upsertJsonLd(jsonLd);
  }, [description, imageUrl, jsonLd, path, robots, title, type]);

  return null;
}
