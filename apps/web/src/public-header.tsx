import { applicationMetadata } from "@wemilktea/config";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTheme } from "./theme-context";
import { nextExplicitTheme } from "./theme-preference";

function ThemeControl() {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = nextExplicitTheme(resolvedTheme);

  return (
    <button
      aria-checked={resolvedTheme === "dark"}
      aria-label={`Switch to ${nextTheme} mode`}
      className="group grid size-11 cursor-pointer place-items-center rounded-md text-foreground"
      data-resolved-theme={resolvedTheme}
      role="switch"
      title={`Switch to ${nextTheme} mode`}
      type="button"
      onClick={() => setPreference(nextTheme)}
    >
      <span
        aria-hidden="true"
        className="relative grid h-6 w-11 grid-cols-2 place-items-center rounded-full border border-border bg-secondary text-[11px] leading-none transition-colors group-hover:border-primary group-hover:bg-accent motion-reduce:transition-none"
      >
        <span>☀</span>
        <span>☾</span>
        <span
          className={`absolute left-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground transition-transform motion-reduce:transition-none ${resolvedTheme === "dark" ? "translate-x-5" : "translate-x-0"}`}
        >
          {resolvedTheme === "dark" ? "☾" : "☀"}
        </span>
      </span>
    </button>
  );
}

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const links = [
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
        <Link
          className="mr-auto cursor-pointer text-2xl font-semibold leading-8"
          to="/"
        >
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
          <NavLink
            aria-label="Search WeMilktea"
            className={({ isActive }) =>
              `text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
            }
            to="/search"
          >
            <span aria-hidden="true">⌕</span> Search
          </NavLink>
          <ThemeControl />
          <NavLink
            className={({ isActive }) =>
              `rounded-md bg-primary px-4 py-3 text-xs font-medium text-primary-foreground ${isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`
            }
            to="/picker"
          >
            Pick for me
          </NavLink>
        </nav>
        <div className="flex items-center gap-3 md:hidden">
          <NavLink
            aria-label="Search WeMilktea"
            className={({ isActive }) =>
              `grid size-11 place-items-center rounded-md text-xl ${isActive ? "bg-accent text-foreground" : "text-primary"}`
            }
            to="/search"
            onClick={() => setMenuOpen(false)}
          >
            <span aria-hidden="true">⌕</span>
          </NavLink>
          <ThemeControl />
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
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent ${isActive ? "bg-accent font-semibold" : ""}`
                }
                key={href}
                to={href}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </NavLink>
            ))}
            <NavLink
              className={({ isActive }) =>
                `rounded-md bg-primary px-3 py-3 text-sm font-medium text-primary-foreground ${isActive ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`
              }
              to="/picker"
              onClick={() => setMenuOpen(false)}
            >
              Pick for me
            </NavLink>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
