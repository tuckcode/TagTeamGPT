import { SOURCE_REPO } from "@/lib/facts";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Explainer of{" "}
          <a
            href={SOURCE_REPO}
            className="text-foreground underline-offset-4 hover:underline"
          >
            XiaoDuoYa/codex-with-chatgpt
          </a>
          . Not affiliated with that project or with OpenAI.
        </p>
        <p>
          Sources: README, architecture, protocol, security, SKILL.md,
          mcp/server.ts
        </p>
      </div>
    </footer>
  );
}
