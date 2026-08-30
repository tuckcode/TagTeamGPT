import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Problem() {
  return (
    <section id="problem" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Why this exists
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          You already pay for ChatGPT. Codex is burning the scarce tokens.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          People who run OpenAI Codex as a coding agent often also pay for
          ChatGPT Plus or Pro. The web subscription has generous thinking
          quota that sits idle. The Codex / API budget is what actually runs
          out — because Codex uses it for planning and review, not just
          edits.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="border-destructive/30 bg-card">
            <CardHeader>
              <CardTitle className="text-base">Without C2C</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                One model does everything: understand the repo, plan, write
                code, run tests, then review its own work.
              </p>
              <p>
                Planning and review eat the same token pool as execution.
                ChatGPT web, which you already pay for, is unused.
              </p>
              <p>
                Self-review is the same agent judging its own “all tests
                passed” claim.
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-card">
            <CardHeader>
              <CardTitle className="text-base">With C2C</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                ChatGPT web owns reasoning: inspect, plan, review. Codex
                owns the harness: edit, shell, git, tests, recovery.
              </p>
              <p>
                Control messages stay under 1 KB. ChatGPT pulls the few
                lines it needs through MCP instead of you pasting the repo.
              </p>
              <p>
                After each iteration ChatGPT reads the real git diff. It is
                told not to trust Codex’s summary.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
