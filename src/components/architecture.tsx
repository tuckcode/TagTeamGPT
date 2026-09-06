import { Badge } from "@/components/ui/badge";
import { MCP_TOOLS, SHORTCUTS } from "@/lib/facts";

export function Architecture() {
  return (
    <section id="how" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          How it works
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Two planes. One window. Keybinds, not menus.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Keep the upstream protocol. Change the transport so it fits the
          ChatGPT desktop app.
        </p>

        <div className="mt-12 grid gap-3">
          <Plane
            label="Chat tab"
            role="Reason · Plan · Review"
            tone="think"
            note="Use ChatGPT conversation quota. Never use Work as the planner — Work is Codex-like usage."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ArrowCard
              title="Control plane · keybind + clipboard"
              body="Codex copies a [C2C] stub, switches to Chat, pastes, waits for STATE: PLAN|DONE|BLOCKED, switches back. Prefer keyboard over mouse Computer Use."
            />
            <ArrowCard
              title="Data plane · optional MCP"
              body="Same idea as upstream: Chat pulls files through a read-only bridge when a custom connector is available. Or skip MCP and paste short briefs only."
            />
          </div>
          <Plane
            label="Codex tab"
            role="Edit · shell · git · tests"
            tone="work"
            note="Execution stays in the coding harness. Chat never gets write/shell tools from this design."
          />
        </div>

        <h3 className="font-heading mt-16 text-3xl tracking-tight">
          Mode shortcuts
        </h3>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Documented in ChatGPT desktop → Settings → Keyboard Shortcuts.
          Remap if needed; verify on your build (some reports of flaky mode
          switches).
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Chat</th>
                <th className="px-4 py-3 font-medium">Work</th>
                <th className="px-4 py-3 font-medium">Codex</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((row) => (
                <tr key={row.platform} className="border-t border-border">
                  <td className="px-4 py-3">{row.platform}</td>
                  <td className="px-4 py-3 font-mono text-primary">{row.chat}</td>
                  <td className="px-4 py-3 font-mono">{row.work}</td>
                  <td className="px-4 py-3 font-mono text-accent">{row.codex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="font-heading mt-16 text-3xl tracking-tight">
          Optional MCP tools
        </h3>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          If you wire the workspace MCP as the data plane, Chat gets these
          read-only tools. Paste-back still works without them.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {MCP_TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm text-primary">{tool.name}</code>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {tool.scope}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{tool.what}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Plane({
  label,
  role,
  note,
  tone,
}: {
  label: string;
  role: string;
  note: string;
  tone: "think" | "work" | "muted";
}) {
  const toneClass =
    tone === "think"
      ? "border-primary/50 bg-primary/10"
      : tone === "work"
        ? "border-accent/40 bg-accent/10"
        : "border-border bg-card";
  return (
    <div className={`rounded-xl border px-5 py-4 ${toneClass}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{role}</p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function ArrowCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-5 py-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
