export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="h-[88px] shrink-0 bg-background">
      <div className="flex h-full items-center justify-center gap-1 border-t border-border px-6 text-sm leading-5 text-muted-foreground">
        <span className="whitespace-nowrap">
          Made with 🧋 in Auckland · {currentYear}
        </span>
      </div>
    </footer>
  );
}
