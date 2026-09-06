import { PRODUCT_NAME, THIS_REPO, UPSTREAM_REPO } from "@/lib/facts";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <a
            href={THIS_REPO}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {PRODUCT_NAME}
          </a>{" "}
          — desktop-app take on the C2C split. Inspired by{" "}
          <a
            href={UPSTREAM_REPO}
            className="text-foreground underline-offset-4 hover:underline"
          >
            XiaoDuoYa/codex-with-chatgpt
          </a>
          . Not affiliated with OpenAI.
        </p>
        <p>See docs/approach.md</p>
      </div>
    </footer>
  );
}
