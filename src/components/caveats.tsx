export function Caveats() {
  return (
    <section id="caveats" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          What it is not
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Honest limits.
        </h2>
        <ul className="mt-8 max-w-3xl space-y-4 text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Unofficial.</strong>{" "}
            Not affiliated with or endorsed by OpenAI. V1, published late
            August 2026.
          </li>
          <li>
            <strong className="font-medium text-foreground">You need both products.</strong>{" "}
            ChatGPT Plus/Pro (Developer Mode for custom MCP connectors) and
            OpenAI Codex with its in-app browser. This is not a Cursor
            plugin and not a ChatGPT-only coding agent.
          </li>
          <li>
            <strong className="font-medium text-foreground">The public URL is ephemeral.</strong>{" "}
            Cloudflare Quick Tunnels change on every start. Quitting Codex
            means the Skill must delete and recreate the connector. That is
            by design, and it is the main operational tax.
          </li>
          <li>
            <strong className="font-medium text-foreground">Read access is still access.</strong>{" "}
            ChatGPT can read non-secret source through a public HTTPS
            endpoint. OAuth and pairing make that hard to abuse, but it is
            not “air-gapped.” Do not point this at a workspace you would not
            let ChatGPT see.
          </li>
          <li>
            <strong className="font-medium text-foreground">Browser automation is the control plane.</strong>{" "}
            Codex types into chatgpt.com. UI changes, Developer Mode
            requirements, and connector bugs on OpenAI’s side can break the
            loop even when the bridge is healthy.
          </li>
          <li>
            <strong className="font-medium text-foreground">V1 storage is files, not a keychain.</strong>{" "}
            Token hashes live on disk. Raw tokens are never written. Keychain
            integration is listed as a V2 item.
          </li>
        </ul>
      </div>
    </section>
  );
}
