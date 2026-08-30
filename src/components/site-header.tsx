import { NAV, SOURCE_REPO } from "@/lib/facts";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="flex items-baseline gap-2 no-underline">
          <span className="font-heading text-xl tracking-tight">C2C</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Codex with ChatGPT
          </span>
        </a>
        <nav className="hidden items-center gap-4 text-sm md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a
          href={SOURCE_REPO}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs no-underline hover:bg-muted"
        >
          GitHub
        </a>
      </div>
      <nav className="flex gap-3 overflow-x-auto px-4 pb-2 text-xs md:hidden sm:px-6">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="shrink-0 text-muted-foreground no-underline"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
