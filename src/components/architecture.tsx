import { Badge } from "@/components/ui/badge";
import { MCP_TOOLS } from "@/lib/facts";

export function Architecture() {
  return (
    <section id="how" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          How it works
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Two planes, one workspace, zero write tools.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          The project is not a coding agent. It is a{" "}
          <strong className="font-medium text-foreground">C2C Bridge</strong>{" "}
          (a loopback HTTP server) plus a Codex Skill that tells Codex how to
          drive ChatGPT’s built-in browser. ChatGPT never gets a shell.
        </p>

        <div className="mt-12 grid gap-3">
          <Plane
            label="ChatGPT web"
            role="Reason · Plan · Review"
            tone="think"
            note="Uses your Plus/Pro subscription. Reads the workspace only through MCP."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <ArrowCard
              title="Control plane · Computer Use"
              body="Codex types [C2C] state messages into the ChatGPT composer. INIT, PLAN, EXECUTED, DONE. Under 1 KB. No diffs, no logs, no file bodies."
            />
            <ArrowCard
              title="Data plane · MCP"
              body="ChatGPT pulls files itself. Traffic: ChatGPT → Cloudflare Quick Tunnel (HTTPS) → 127.0.0.1:48765 /mcp → eight read-only tools."
            />
          </div>
          <Plane
            label="C2C Bridge"
            role="Read-only MCP · OAuth 2.1 · pairing · tunnel"
            tone="work"
            note="Binds 127.0.0.1 only. Public URL is useless without a bearer token bound to this workspace."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Plane
              label="Local workspace"
              role="Your repo"
              tone="muted"
              note="Never uploaded as a zip. ChatGPT reads the exact lines it asks for."
            />
            <Plane
              label="Codex harness"
              role="Edit · shell · git · tests"
              tone="muted"
              note="Execution stays here. The bridge has no write, delete, shell, or commit tools at all."
            />
          </div>
        </div>

        <h3 className="font-heading mt-16 text-3xl tracking-tight">
          What ChatGPT is allowed to call
        </h3>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Registered in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            src/mcp/server.ts
          </code>
          . Every tool is annotated <code>readOnlyHint: true</code> and
          checks an OAuth scope. Prompt injection in a README cannot invent
          a write tool that does not exist.
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
