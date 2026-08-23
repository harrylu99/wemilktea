import { applicationMetadata } from "@wemilktea/config";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTheme } from "./theme-context";
import {
  nextExplicitTheme,
  themePreferences,
  type ThemePreference
} from "./theme-preference";

function themeLabel(theme: ThemePreference) {
  return theme[0].toUpperCase() + theme.slice(1);
}

function ThemeControl() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const nextTheme = nextExplicitTheme(resolvedTheme);

  useEffect(() => {
    if (!optionsOpen) return;

    const closeOptions = (event: KeyboardEvent | PointerEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key !== "Escape"
          : controlRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOptionsOpen(false);
      window.requestAnimationFrame(() => optionsButtonRef.current?.focus());
    };

    document.addEventListener("keydown", closeOptions);
    document.addEventListener("pointerdown", closeOptions);
    return () => {
      document.removeEventListener("keydown", closeOptions);
      document.removeEventListener("pointerdown", closeOptions);
    };
  }, [optionsOpen]);

  const choosePreference = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    setOptionsOpen(false);
    window.requestAnimationFrame(() => optionsButtonRef.current?.focus());
  };

  return (
    <div ref={controlRef} className="relative flex items-center">
      <button
        aria-label={`Theme: ${preference === "system" ? `System (${resolvedTheme})` : themeLabel(preference)}. Switch to ${themeLabel(nextTheme)}.`}
        aria-pressed={resolvedTheme === "dark"}
        className="grid size-11 place-items-center rounded-md text-foreground"
        data-resolved-theme={resolvedTheme}
        title={`Switch to ${themeLabel(nextTheme)}`}
        type="button"
        onClick={() => setPreference(nextTheme)}
      >
        <span
          aria-hidden="true"
          className="relative h-6 w-11 rounded-full border border-border bg-secondary"
        >
          <span className="absolute left-1 top-0.5 text-[10px] leading-5">
            ☀
          </span>
          <span className="absolute right-1 top-0.5 text-[10px] leading-5">
            ☾
          </span>
          <span
            className={`absolute left-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] leading-5 text-primary-foreground transition-transform motion-reduce:transition-none ${resolvedTheme === "dark" ? "translate-x-5" : "translate-x-0"}`}
          >
            {resolvedTheme === "dark" ? "☾" : "☀"}
          </span>
        </span>
      </button>
      <button
        ref={optionsButtonRef}
        aria-controls="theme-preferences"
        aria-expanded={optionsOpen}
        aria-label="Theme options"
        className="grid h-11 w-7 place-items-center rounded-md text-sm text-muted-foreground hover:text-foreground"
        title="Theme options"
        type="button"
        onClick={() => setOptionsOpen((open) => !open)}
      >
        <span aria-hidden="true">⌄</span>
      </button>
      {optionsOpen ? (
        <div
          id="theme-preferences"
          className="theme-popover absolute right-0 top-full z-30 mt-2 grid w-44 gap-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground"
          role="group"
          aria-label="Colour theme"
        >
          {themePreferences.map((option) => (
            <button
              key={option}
              aria-pressed={preference === option}
              className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-xs font-medium ${preference === option ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              type="button"
              onClick={() => choosePreference(option)}
            >
              <span>{themeLabel(option)}</span>
              {option === "system" ? (
                <span className="text-[11px] opacity-75">
                  {themeLabel(resolvedTheme)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PublicHeader({ onSearch }: { onSearch?: () => void }) {
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
              to="/search"
            >
              <span aria-hidden="true">⌕</span> Search
            </Link>
          )}
          <ThemeControl />
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
              to="/search"
            >
              <span aria-hidden="true">⌕</span>
            </Link>
          )}
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
