import { applicationMetadata } from "@wemilktea/config";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";

export function PublicHeader({ onSearch }: { onSearch?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const links = [
    ["Explore", "/explore"],
    ["Stores", "/stores"],
    ["Drinks", "/drinks"]
  ] as const;

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

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
          {onSearch ? (
            <button
              aria-label="Search stores and drinks"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              type="button"
              onClick={onSearch}
            >
              <span aria-hidden="true">⌕</span> Search
            </button>
          ) : (
            <Link
              aria-label="Search stores and drinks"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              to="/explore"
            >
              <span aria-hidden="true">⌕</span> Search
            </Link>
          )}
          <Link
            className="rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground"
            to="/picker"
          >
            Pick for me
          </Link>
        </nav>
        <div className="flex items-center gap-3 md:hidden">
          {onSearch ? (
            <button
              aria-label="Search stores and drinks"
              className="grid size-11 place-items-center rounded-md text-xl text-primary"
              type="button"
              onClick={onSearch}
            >
              <span aria-hidden="true">⌕</span>
            </button>
          ) : (
            <Link
              aria-label="Search stores and drinks"
              className="grid size-11 place-items-center rounded-md text-xl text-primary"
              to="/explore"
            >
              <span aria-hidden="true">⌕</span>
            </Link>
          )}
          <button
            ref={menuButtonRef}
            aria-controls="mobile-navigation"
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
          id="mobile-navigation"
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
