"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PROTOCOL_STEPS } from "@/lib/facts";

export function ProtocolLoop() {
  const [index, setIndex] = useState(0);
  const step = PROTOCOL_STEPS[index];
  const fromCodex = step.sender === "Codex";

  return (
    <section id="loop" className="border-t border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
          A real task loop
        </p>
        <h2 className="font-heading mt-3 max-w-2xl text-4xl tracking-tight sm:text-5xl">
          INIT → PLAN → execute → EXECUTED → review → DONE
        </h2>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Codex drives ChatGPT through the in-app browser. It never pastes
          source. ChatGPT never runs the plan. Step through one dark-mode
          task the way the protocol actually specifies it.
        </p>

        <ol className="mt-8 flex flex-wrap gap-2">
          {PROTOCOL_STEPS.map((item, i) => (
            <li key={item.state}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  i === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {i + 1}. {item.state}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {step.sender} · {step.state}
            </p>
            <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {step.detail}
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                Previous
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  setIndex((i) => Math.min(PROTOCOL_STEPS.length - 1, i + 1))
                }
                disabled={index === PROTOCOL_STEPS.length - 1}
              >
                Next
              </Button>
            </div>
          </div>
          <pre
            className={`overflow-x-auto rounded-xl border p-4 font-mono text-[13px] leading-relaxed ${
              fromCodex
                ? "border-accent/40 bg-accent/5 text-foreground"
                : "border-primary/40 bg-primary/5 text-foreground"
            }`}
          >
            {step.message}
          </pre>
        </div>
      </div>
    </section>
  );
}
