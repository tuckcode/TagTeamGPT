import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DesktopGlue() {
  return (
    <section id="desktop" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Desktop glue
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Ship the thin control plane first.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Do not start by rewriting upstream&apos;s browser Skill. Start with
          a playbook Codex can follow: clipboard, mode keybind, wait cue,
          switch back.
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
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Pin one Chat thread as the C2C conversation. Paste the boot
                prompt once.
              </li>
              <li>
                In Codex, ask it to draft INIT / EXECUTED stubs to the
                clipboard (or print them for you to copy).
              </li>
              <li>
                You hit Chat keybind → paste → send. When Chat finishes, you
                say &quot;continue&quot; in Codex (or paste the reply).
              </li>
              <li>
                No tunnel, no Computer Use. Validates the split and the
                protocol before any automation.
              </li>
            </ol>
          </TabsContent>
          <TabsContent
            value="keys"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p>
              Once the playbook feels right, let Codex use desktop Computer
              Use for <em>only</em> stable actions: mode keybind, paste,
              Enter. Always-allow the ChatGPT app. Avoid screenshot-clicking
              Settings menus.
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
              For full independent review, run the upstream{" "}
              <code className="font-mono text-foreground">c2c</code> bridge so
              Chat can call <code className="font-mono text-foreground">git_diff</code>{" "}
              and friends. That still needs a public HTTPS connector Chat can
              attach (Developer Mode). Confirm that on your Chat surface
              before depending on it.
            </p>
            <p className="mt-3">
              Without MCP, keep control messages tiny and paste only the
              paths Chat asks for. Lower automation, lower exposure.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
