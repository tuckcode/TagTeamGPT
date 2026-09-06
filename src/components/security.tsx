export function Security() {
  return (
    <section id="security" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Security
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Paste less. Allowlist deliberately.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          This take has two exposure modes. Pick the smaller one until you
          need independent MCP review.
        </p>

        <div className="mt-10 grid gap-3">
          <article className="rounded-xl border border-border bg-card px-5 py-4">
            <h3 className="text-sm font-medium">Semi-manual (no MCP)</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Chat only sees what you paste into the composer. No public
              tunnel. Best default while validating the keybind loop.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card px-5 py-4">
            <h3 className="text-sm font-medium">With upstream MCP bridge</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Same posture as C2C: read-only tools only, OAuth pairing, path
              containment, sensitive-file deny list. URL alone is not enough
              without a bearer token bound to one workspace.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card px-5 py-4">
            <h3 className="text-sm font-medium">Desktop Computer Use</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              If Codex drives keybinds via Computer Use, Always-allow only
              the ChatGPT app. It can see screen content in allowed apps.
              Prefer keystrokes over broad click automation.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card px-5 py-4">
            <h3 className="text-sm font-medium">
              Do not use Work as the brain
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Work is agentic and billed more like Codex. Using it as the
              planner defeats the quota reason this split exists. Chat only.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
