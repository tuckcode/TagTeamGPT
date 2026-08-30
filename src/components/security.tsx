import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function Security() {
  return (
    <section id="security" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          Security
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Paste less. Allowlist deliberately.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          This take has two exposure modes. Pick the smaller one until you
          need independent MCP review.
        </p>

        <Accordion className="mt-10">
          <AccordionItem value="semi">
            <AccordionTrigger>Semi-manual (no MCP)</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Chat only sees what you paste into the composer. No public
              tunnel. Best default while validating the keybind loop.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="mcp">
            <AccordionTrigger>With upstream MCP bridge</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Same posture as C2C: read-only tools only, OAuth pairing, path
              containment, sensitive-file deny list. URL alone is not enough
              without a bearer token bound to one workspace.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="cu">
            <AccordionTrigger>Desktop Computer Use</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              If Codex drives keybinds via Computer Use, Always-allow only
              the ChatGPT app. It can see screen content in allowed apps.
              Prefer keystrokes over broad click automation.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="work">
            <AccordionTrigger>Do not use Work as the brain</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Work is agentic and billed more like Codex. Using it as the
              planner defeats the quota reason this split exists. Chat only.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
