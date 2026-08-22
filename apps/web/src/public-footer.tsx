export function PublicFooter() {
  return (
    <footer className="h-[88px] shrink-0 bg-background">
      <div className="flex h-full items-center justify-center gap-1 border-t border-border px-6 text-sm leading-5 text-muted-foreground">
        <span>Made with</span>
        <img
          alt=""
          aria-hidden="true"
          className="h-5 w-[18px]"
          src="/bubble-tea-mark.svg"
        />
        <span> in Auckland · 2026</span>
      </div>
    </footer>
  );
}
