import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { test, expect } from "bun:test";
import { PublicHeader } from "./public-header";
import { ThemeContext } from "./theme-context";

function renderHeader(pathname: string) {
  return renderToStaticMarkup(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={[pathname]}>
        <PublicHeader />
      </MemoryRouter>
    </ThemeContext.Provider>
  );
}

function activeLinks(markup: string) {
  return [...markup.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)]
    .filter(([, attributes]) => attributes?.includes('aria-current="page"'))
    .map(([, attributes, text]) => ({ attributes, text }));
}

test("marks Stores active for the catalogue and nested store routes", () => {
  for (const pathname of ["/stores", "/stores/example-store"]) {
    const active = activeLinks(renderHeader(pathname));

    expect(active).toHaveLength(1);
    expect(new Set(active.map((link) => link.text))).toEqual(
      new Set(["Stores"])
    );
    expect(
      active.every((link) => link.attributes?.includes('href="/stores"'))
    ).toBe(true);
  }
});

test("marks Drinks active for the catalogue and nested drink routes", () => {
  for (const pathname of ["/drinks", "/drinks/example-drink"]) {
    const active = activeLinks(renderHeader(pathname));

    expect(active).toHaveLength(1);
    expect(new Set(active.map((link) => link.text))).toEqual(
      new Set(["Drinks"])
    );
    expect(
      active.every((link) => link.attributes?.includes('href="/drinks"'))
    ).toBe(true);
  }
});

test("marks Pick for me active for the picker and result routes", () => {
  for (const pathname of ["/picker", "/picker/result/example-drink"]) {
    const active = activeLinks(renderHeader(pathname));

    expect(active).toHaveLength(1);
    expect(new Set(active.map((link) => link.text))).toEqual(
      new Set(["Pick for me"])
    );
    expect(
      active.every((link) => link.attributes?.includes('href="/picker"'))
    ).toBe(true);
  }
});

test("does not mark a top-level destination active on Home or Search", () => {
  for (const pathname of ["/", "/search"]) {
    expect(activeLinks(renderHeader(pathname))).toHaveLength(0);
  }
});

test("renders global Search links instead of contextual search actions", () => {
  const markup = renderHeader("/stores");

  expect(markup).not.toContain("Search stores and drinks");
  expect(markup).toContain('aria-label="Search WeMilktea"');
  expect(markup.match(/href="\/search"/g)?.length).toBe(2);
});
