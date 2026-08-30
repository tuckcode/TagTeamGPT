import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SKILL_INVOKE, SKILL_PATH } from "@/lib/facts";

export function DesktopGlue() {
  return (
    <section id="desktop" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Desktop glue
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          v0 Skill is the thin control plane.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Protocol truth lives in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {SKILL_PATH}/references/protocol.md
          </code>
          . This page is the visual companion. Invoke with{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {SKILL_INVOKE}
          </code>{" "}
          or “Use CodexGPT to …”.
        </p>

        <Tabs defaultValue="semi" className="mt-10">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="semi">Semi-auto (v0)</TabsTrigger>
            <TabsTrigger value="keys">Keybind automation</TabsTrigger>
            <TabsTrigger value="mcp">Optional MCP</TabsTrigger>
          </TabsList>
          <TabsContent
            value="semi"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p className="mb-4">
              Shipped at{" "}
              <code className="font-mono text-foreground">{SKILL_PATH}</code>.
              Open this repo as a Codex project (auto-load) or copy to{" "}
              <code className="font-mono text-foreground">
                ~/.agents/skills/codexgpt
              </code>
              .
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                In Codex, run{" "}
                <code className="font-mono text-foreground">{SKILL_INVOKE}</code>{" "}
                (or “Use CodexGPT to implement X”).
              </li>
              <li>
                Pin one Chat thread. Paste the boot prompt once when the Skill
                prints it.
              </li>
              <li>
                Copy each INIT / EXECUTED stub → Chat keybind → paste → send.
                Paste Chat’s PLAN / DONE / BLOCKED back into Codex.
              </li>
              <li>
                No tunnel, no Computer Use. Codex executes the plan with its
                own harness.
              </li>
            </ol>
          </TabsContent>
          <TabsContent
            value="keys"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p>
              <strong className="font-medium text-foreground">Deferred (v1).</strong>{" "}
              Once paste-back feels right, let Codex use desktop Computer Use
              for <em>only</em> stable actions: mode keybind, paste, Enter.
              Always-allow the ChatGPT app. Avoid screenshot-clicking Settings
              menus.
            </p>
            <p className="mt-3">
              Hard part remains: detecting that Chat finished and extracting
              the [C2C] reply. Keep a human &quot;reply ready&quot; gate until
              that is reliable. Remap shortcuts in Settings if ⌃1–⌃3 / Alt+1–3
              are flaky on your build.
            </p>
          </TabsContent>
          <TabsContent
            value="mcp"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p>
              <strong className="font-medium text-foreground">Deferred.</strong>{" "}
              For full independent review, run the upstream{" "}
              <code className="font-mono text-foreground">c2c</code> bridge so
              Chat can call{" "}
              <code className="font-mono text-foreground">git_diff</code> and
              friends. That still needs a public HTTPS connector Chat can
              attach (Developer Mode). Confirm that on your Chat surface
              before depending on it.
            </p>
            <p className="mt-3">
              Without MCP, keep control messages tiny and paste only the paths
              Chat asks for. Lower automation, lower exposure.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
