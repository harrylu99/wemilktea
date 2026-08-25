import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "bun:test";
import { HomePage } from "./page";
import { ThemeContext } from "../theme-context";

test("uses the header Search entry without a standalone Home Search field", () => {
  const markup = renderToStaticMarkup(
    <ThemeContext.Provider
      value={{ resolvedTheme: "light", setPreference: () => undefined }}
    >
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>
    </ThemeContext.Provider>
  );

  expect(markup).not.toContain('id="home-search"');
  expect(markup).not.toContain('aria-label="Search stores or drinks"');
  expect(markup).toContain('aria-label="Search WeMilktea"');
});
