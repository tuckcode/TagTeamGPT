import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BENEFITS = [
  {
    title: "Spend the subscription you already have",
    body: "Planning and review move onto ChatGPT Plus/Pro web quota. Codex tokens are reserved for the work that actually needs a coding harness.",
  },
  {
    title: "A second pair of eyes that can read the diff",
    body: "After EXECUTED, ChatGPT is required to inspect git_diff and execution records. It is not supposed to rubber-stamp Codex’s “27 passed.”",
  },
  {
    title: "Keep Codex’s harness",
    body: "You do not replace Codex with ChatGPT Agent mode. Edits, tests, git, and recovery stay in the agent that is already sandboxed for that job.",
  },
  {
    title: "The repo is not uploaded",
    body: "There is no “zip and send.” ChatGPT requests the lines it needs. Secrets matching default deny rules never leave.",
  },
  {
    title: "No unofficial ChatGPT reverse proxy",
    body: "The project uses the official web UI plus ChatGPT’s own custom MCP connector support. Pairing is the only secret that ever hits a browser.",
  },
  {
    title: "Zero-touch after install",
    body: "The Skill is written so a non-technical user can paste one paragraph to Codex. Internals are hidden; doctor auto-repairs the local side.",
  },
];

export function Benefits() {
  return (
    <section id="benefit" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          The benefit
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Split the brain from the hands.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          The benefit is not “ChatGPT writes better code than Codex.” It is
          a division of labor: a long-context web model for plans and
          independent review, and a local harness for everything that
          mutates the tree.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle className="text-base leading-snug">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {item.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
