import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BENEFITS = [
  {
    title: "Same economics as C2C",
    body: "Planning and review on Chat quota. Codex tokens reserved for the harness that mutates the tree.",
  },
  {
    title: "Glue that matches the product",
    body: "Chat and Codex already share one desktop window. Mode keybinds beat nesting chatgpt.com in a browser.",
  },
  {
    title: "Keyboard-first control plane",
    body: "Clipboard + ⌃1 / ⌃3 (or Alt+1 / Alt+3). Thinner than mouse Computer Use hunting connector settings.",
  },
  {
    title: "Incremental path",
    body: "Start semi-auto with you confirming replies. Add keybind automation, then optional MCP, only when each layer earns its keep.",
  },
  {
    title: "Keep Codex’s harness",
    body: "Sandbox, git, tests, and recovery stay where they already work. Chat never becomes a write agent in this design.",
  },
  {
    title: "Protocol reuse",
    body: "INIT / PLAN / EXECUTED / DONE stay compatible with upstream C2C messages, so skills and boot prompts transfer.",
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
          Split the brain from the hands — on desktop.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Not “Chat writes better code.” A division of labor that fits how
          the ChatGPT desktop app is actually laid out.
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
