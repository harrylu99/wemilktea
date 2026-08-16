import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin, defineConfig } from "vite";

type SitemapEntry = {
  path: string;
  lastModified?: string;
};

const appRoot = fileURLToPath(new URL(".", import.meta.url));

function xmlEscape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
      })[character] ?? character
  );
}

function siteOrigin(value: string | undefined) {
  if (value) {
    try {
      return new URL(value).origin;
    } catch {
      // The local fallback keeps builds usable while production is configured.
    }
  }
  return "http://localhost:5173";
}

async function loadPublishedEntries(env: Record<string, string>) {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return [];

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`
  };
  const locationsUrl = new URL("/rest/v1/locations", supabaseUrl);
  locationsUrl.search = new URLSearchParams({
    select: "slug,updated_at",
    publication_status: "eq.published",
    order: "slug.asc"
  }).toString();
  const productsUrl = new URL("/rest/v1/products", supabaseUrl);
  productsUrl.search = new URLSearchParams({
    select: "slug,updated_at,brands!inner(slug)",
    is_published: "eq.true",
    order: "slug.asc"
  }).toString();

  const [locationsResponse, productsResponse] = await Promise.all([
    fetch(locationsUrl, { headers }),
    fetch(productsUrl, { headers })
  ]);
  if (!locationsResponse.ok || !productsResponse.ok) {
    throw new Error(
      `Published sitemap query failed (${locationsResponse.status}/${productsResponse.status})`
    );
  }

  const locations = (await locationsResponse.json()) as Array<{
    slug?: unknown;
    updated_at?: unknown;
  }>;
  const products = (await productsResponse.json()) as Array<{
    slug?: unknown;
    updated_at?: unknown;
    brands?: { slug?: unknown } | Array<{ slug?: unknown }>;
  }>;

  const locationEntries: SitemapEntry[] = locations.flatMap((location) =>
    typeof location.slug === "string"
      ? [
          {
            path: `/stores/${encodeURIComponent(location.slug)}`,
            ...(typeof location.updated_at === "string"
              ? { lastModified: location.updated_at }
              : {})
          }
        ]
      : []
  );
  const productEntries: SitemapEntry[] = products.flatMap((product) => {
    const brand = Array.isArray(product.brands)
      ? product.brands[0]
      : product.brands;
    return typeof brand?.slug === "string" && typeof product.slug === "string"
      ? [
          {
            path: `/drinks/${encodeURIComponent(brand.slug)}/${encodeURIComponent(product.slug)}`,
            ...(typeof product.updated_at === "string"
              ? { lastModified: product.updated_at }
              : {})
          }
        ]
      : [];
  });

  return [...locationEntries, ...productEntries];
}

function sitemapXml(origin: string, entries: SitemapEntry[]) {
  const staticEntries: SitemapEntry[] = [
    "/",
    "/explore",
    "/stores",
    "/drinks",
    "/picker"
  ].map((path) => ({ path }));
  const allEntries = [...staticEntries, ...entries];
  const urls = allEntries
    .map(
      ({ path, lastModified }) => `  <url>
    <loc>${xmlEscape(new URL(path, `${origin}/`).toString())}</loc>${
      lastModified
        ? `
    <lastmod>${xmlEscape(lastModified)}</lastmod>`
        : ""
    }
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function robotsTxt(origin: string, noIndex: boolean) {
  if (noIndex) {
    return `User-agent: *
Disallow: /
`;
  }

  return `User-agent: *
Allow: /
Disallow: /picker/result/
Disallow: /*?q=
Disallow: /*?brand=
Disallow: /*?area=
Disallow: /*?category=
Disallow: /*?near=

Sitemap: ${origin}/sitemap.xml
`;
}

function seoFilesPlugin(env: Record<string, string>): Plugin {
  const noIndex = env.VITE_PUBLIC_NO_INDEX === "true";
  const render = async () => {
    const origin = siteOrigin(env.VITE_PUBLIC_SITE_URL);
    let entries: SitemapEntry[] = [];
    try {
      entries = await loadPublishedEntries(env);
    } catch (error) {
      console.warn(
        "Could not load published sitemap entries; emitting core public routes only.",
        error instanceof Error ? error.message : error
      );
    }
    return {
      robots: robotsTxt(origin, noIndex),
      sitemap: sitemapXml(origin, entries)
    };
  };

  return {
    name: "wemilktea-seo-files",
    transformIndexHtml(html) {
      if (!noIndex) return html;
      return html.replace(
        /<meta\s+name=["']robots["']\s+content=["'][^"']*["']\s*\/?\s*>/i,
        '<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />'
      );
    },
    async generateBundle() {
      const files = await render();
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: files.robots
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: files.sitemap
      });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?", 1)[0];
        if (path !== "/robots.txt" && path !== "/sitemap.xml") {
          next();
          return;
        }

        const files = await render();
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (path === "/sitemap.xml") {
          response.setHeader("Content-Type", "application/xml; charset=utf-8");
          response.end(files.sitemap);
        } else {
          response.end(files.robots);
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, appRoot, "");
  return {
    plugins: [react(), tailwindcss(), seoFilesPlugin(env)],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
    }
  };
});
