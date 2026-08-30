import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SetupAndSkill() {
  return (
    <section id="setup" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          The Skill is the UX
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          You talk to Codex. Codex talks to ChatGPT.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Installing means copying{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            skill/SKILL.md
          </code>{" "}
          to{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            ~/.codex/skills/codex-with-chatgpt/
          </code>
          . After that you say “Set up Codex with ChatGPT” or “Use Codex with
          ChatGPT to implement X.” The Skill hides MCP, OAuth, tunnels, and
          ports. The only thing you may have to do is log in.
        </p>

        <Tabs defaultValue="setup" className="mt-10">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="setup">First-time setup</TabsTrigger>
            <TabsTrigger value="pair">OAuth pairing</TabsTrigger>
            <TabsTrigger value="tunnel">Why a tunnel</TabsTrigger>
          </TabsList>
          <TabsContent
            value="setup"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Codex runs <code className="font-mono text-foreground">c2c setup</code>,
                starts the bridge on loopback, and opens a Cloudflare Quick
                Tunnel so ChatGPT can reach <code>/mcp</code> over HTTPS.
              </li>
              <li>
                It opens ChatGPT’s built-in browser (not Chrome), turns on
                Developer Mode, and creates a custom connector named after this
                workspace.
              </li>
              <li>
                Authentication is OAuth. ChatGPT’s client hits the bridge’s
                pairing page. Codex types the one-time pairing code. Tokens
                stay between ChatGPT and the bridge — the model never sees them.
              </li>
              <li>
                A boot prompt is sent once per conversation. Codex saves that
                chat URL; one workspace keeps one long-lived ChatGPT thread.
              </li>
            </ol>
          </TabsContent>
          <TabsContent
            value="pair"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p>
              The bridge is a full OAuth 2.1 authorization server: RFC 8414
              discovery, dynamic client registration, authorization-code +
              PKCE S256 only, refresh rotation, revocation. Tokens are opaque and
              stored as SHA-256 hashes, bound to one <code>workspace_id</code>.
            </p>
            <p className="mt-3">
              The pairing code is 8 characters from a 31-character CSPRNG
              alphabet (~40 bits), 5-minute TTL, 5 attempts, per-IP rate
              limit, destroyed on use. Knowing the public URL grants nothing:
              unauthenticated <code>/mcp</code> is 401; a token from another
              project is 403.
            </p>
          </TabsContent>
          <TabsContent
            value="tunnel"
            className="mt-4 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            <p>
              ChatGPT custom MCP connectors only talk to a public HTTPS
              endpoint (typically ending in <code>/mcp</code>). They cannot
              attach to a local stdio server. So the bridge stays on
              127.0.0.1 and <code>cloudflared tunnel --url</code> publishes it.
            </p>
            <p className="mt-3">
              Quick Tunnel URLs change every restart. After you quit Codex or
              the machine, <code>c2c doctor</code> starts a new address and
              the Skill deletes then recreates this workspace’s connector.
              Never click Reconnect — the old URL is dead and the settings
              page hangs.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
