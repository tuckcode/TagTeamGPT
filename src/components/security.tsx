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
          Security model
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          Read-only by construction, not by a prompt.
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          ChatGPT can see your code. It cannot change it. That is not a
          system-prompt rule. Write, delete, shell, and commit tools are
          absent from the server. One bridge serves one workspace; tokens
          cannot hop to another project.
        </p>

        <Accordion className="mt-10">
          <AccordionItem value="readonly">
            <AccordionTrigger>No write surface exists</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Prompt injection in comments or READMEs cannot enable a
              capability the MCP server does not register. Tool
              descriptions also warn that workspace content is untrusted
              data, not instructions.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="paths">
            <AccordionTrigger>Path containment</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Paths are canonicalized with realpath of the deepest existing
              ancestor. Symlinks, <code>../</code>, absolute paths, and
              backslash tricks are rejected. Sensitive patterns (.env*,
              keys, SSH, cloud creds) are denied at resolve time for reads,
              listings, search, and git diff. <code>.env.example</code> is
              allowed. You can add rules in <code>.c2cignore</code>.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="oauth">
            <AccordionTrigger>OAuth, not “know the URL”</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Access tokens live one hour. Refresh tokens last 30 days and
              rotate on every use. Scopes are{" "}
              <code>workspace.read</code>, <code>workspace.search</code>,{" "}
              <code>git.read</code>, <code>execution.read</code>,{" "}
              <code>offline_access</code>. State lives in the OS app dir
              with 0700/0600 permissions. Stolen state files contain hashes,
              not bearer tokens.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="admin">
            <AccordionTrigger>Admin API stays on loopback</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              The bridge refuses to bind 0.0.0.0. Admin endpoints require a
              random local token and reject proxied headers like{" "}
              <code>x-forwarded-for</code>. Logs redact pairing-code-shaped
              strings and bearer headers.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
