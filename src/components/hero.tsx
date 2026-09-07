import { Badge } from "@/components/ui/badge";
import { PRODUCT_NAME, UPSTREAM_REPO } from "@/lib/facts";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.35_0.06_145)_0%,_transparent_55%)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{PRODUCT_NAME}</Badge>
          <Badge variant="outline">Desktop app take</Badge>
        </div>
        <h1 className="font-heading mt-6 max-w-3xl text-5xl leading-[1.05] tracking-tight sm:text-7xl">
          They switch.
          <br />
          <span className="italic text-primary">The goal doesn&apos;t.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          My take on the split-brain idea from{" "}
          <a
            href={UPSTREAM_REPO}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Codex with ChatGPT
          </a>
          : keep Chat as the planning brain and Codex as the hands — inside
          the unified ChatGPT desktop app, glued with keybinds and clipboard,
          not a nested browser and mouse Computer Use.
        </p>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Same division of labor. Different transport. Stay on Chat for the
          quota win; never use Work as the planner.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#how"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline"
          >
            See the approach
          </a>
          <a
            href="#loop"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-secondary px-4 text-sm no-underline"
          >
            Step through a task
          </a>
        </div>
      </div>
    </section>
  );
}
