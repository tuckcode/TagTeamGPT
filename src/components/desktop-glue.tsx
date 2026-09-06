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
          or “Use Lob to …”.
        </p>

        <div className="mt-10 grid gap-4">
          <article className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <h3 className="mb-4 font-medium text-foreground">Semi-auto (v0)</h3>
            <p className="mb-4">
              Shipped at{" "}
              <code className="font-mono text-foreground">{SKILL_PATH}</code>.
              Open this repo as a Codex project (auto-load) or copy to{" "}
              <code className="font-mono text-foreground">
                ~/.agents/skills/lob
              </code>
              .
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                In Codex, run{" "}
                <code className="font-mono text-foreground">{SKILL_INVOKE}</code>{" "}
                (or “Use Lob to implement X”).
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
          </article>
          <article className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <h3 className="mb-4 font-medium text-foreground">
              Keybind automation
            </h3>
            <p>
              <strong className="font-medium text-foreground">Shipped (v1).</strong>{" "}
              From the repo root,{" "}
              <code className="font-mono text-foreground">
                node tools/lob-driver.mjs
              </code>{" "}
              sends mode hotkeys, clipboard paste, and Enter. macOS needs
              Accessibility; Windows uses Alt+1/2/3.{" "}
              <code className="font-mono text-foreground">ok: true</code> means
              keys fired, not accepted.
            </p>
            <p className="mt-3">
              Do not re-press ⌃1 / Alt+1 when already in Chat — that can open
              New chat. Remap shortcuts in Settings if they are flaky. Manual
              paste-back always works without the driver.
            </p>
          </article>
          <article className="rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <h3 className="mb-4 font-medium text-foreground">Optional MCP</h3>
            <p>
              <strong className="font-medium text-foreground">Optional.</strong>{" "}
              This repo ships a read-only workspace MCP at{" "}
              <code className="font-mono text-foreground">mcp/</code>
              . Start it with{" "}
              <code className="font-mono text-foreground">
                node tools/lob-mcp-up.mjs start
              </code>
              , then attach the HTTPS URL in ChatGPT Developer Mode so Chat can
              call{" "}
              <code className="font-mono text-foreground">git_diff</code> and{" "}
              <code className="font-mono text-foreground">read_file</code>.
              Paste-back works without it.
            </p>
            <p className="mt-3">
              Without MCP, keep control messages tiny and paste only the paths
              Chat asks for. Lower automation, lower exposure.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
