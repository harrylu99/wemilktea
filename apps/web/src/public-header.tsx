import { applicationMetadata } from "@wemilktea/config";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

export function PublicHeader({ onSearch }: { onSearch?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ["Explore", "/explore"],
    ["Stores", "/stores"],
    ["Drinks", "/drinks"]
  ] as const;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-6 md:h-[72px] lg:px-8">
        <Link className="flex-1 text-2xl font-semibold leading-8" to="/">
          {applicationMetadata.web.name}
        </Link>
        <nav
          className="hidden items-center gap-6 md:flex"
          aria-label="Main navigation"
        >
          {links.map(([label, href]) => (
            <NavLink
              className={({ isActive }) =>
                `text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`
              }
              key={href}
              to={href}
            >
              {label}
            </NavLink>
          ))}
          <button
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            type="button"
            onClick={onSearch}
          >
            ⌕ <span className="sr-only">Focus store search</span>Search
          </button>
          <Link
            className="rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
            to="/picker"
          >
            Pick for me
          </Link>
        </nav>
        <div className="flex items-center gap-3 md:hidden">
          <button
            aria-label="Focus store search"
            className="grid size-11 place-items-center rounded-md text-xl text-primary"
            type="button"
            onClick={onSearch}
          >
            ⌕
          </button>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center rounded-md text-xl"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav
          className="border-t border-border px-4 py-3 md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1">
            {links.map(([label, href]) => (
              <Link
                className="rounded-md px-3 py-3 text-sm font-medium hover:bg-accent"
                key={href}
                to={href}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              className="rounded-md bg-primary px-3 py-3 text-sm font-medium text-primary-foreground"
              to="/picker"
              onClick={() => setMenuOpen(false)}
            >
              Pick for me
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
