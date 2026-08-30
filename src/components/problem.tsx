import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Problem() {
  return (
    <section id="problem" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Why bother
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          You already pay for Chat. Codex is burning the scarce tokens.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Upstream C2C nailed the economics: move planning and review onto
          ChatGPT conversation quota; keep Codex for the harness. On the
          desktop app the products finally sit in one window — Chat, Work,
          Codex — so the glue should be a mode switch, not a second ChatGPT
          living inside a browser tab.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="border-destructive/30 bg-card">
            <CardHeader>
              <CardTitle className="text-base">Upstream glue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Codex automates chatgpt.com: Developer Mode, connectors,
                pairing codes, then types [C2C] into a web composer.
              </p>
              <p>
                Powerful, but brittle — nested browser, UI churn, tunnel URL
                reclaim every restart.
              </p>
              <p>
                Built before Chat and Codex shared one desktop shell.
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/40 bg-card">
            <CardHeader>
              <CardTitle className="text-base">This take</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Same split: Chat plans and reviews, Codex executes. Optional
                MCP bridge for repo reads.
              </p>
              <p>
                Control plane = clipboard + official mode keybinds
                (⌃1 / ⌃3 or Alt+1 / Alt+3). Keyboard first.
              </p>
              <p>
                Start semi-automatic (you confirm “reply ready”), then
                automate only the stable keystrokes.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
