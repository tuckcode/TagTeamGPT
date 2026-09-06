export function Caveats() {
  return (
    <section id="caveats" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Honest limits
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          v0 is paste-back. The driver is optional.
        </h2>
        <ul className="mt-8 max-w-3xl space-y-4 text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Inspired, not a fork.</strong>{" "}
            Upstream bridge/Skill remain theirs. This repo ships a desktop
            Skill at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              .agents/skills/lob
            </code>
            .
          </li>
          <li>
            <strong className="font-medium text-foreground">Mode shortcuts can be flaky.</strong>{" "}
            Remap and verify ⌃1–⌃3 / Alt+1–3 on your build before automating.
          </li>
          <li>
            <strong className="font-medium text-foreground">MCP is optional and surface-dependent.</strong>{" "}
            Custom connectors are documented for ChatGPT web Developer Mode.
            Confirm before relying on independent git_diff review.
          </li>
        </ul>
      </div>
    </section>
  );
}
