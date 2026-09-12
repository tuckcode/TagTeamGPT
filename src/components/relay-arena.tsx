"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clipboard,
  Code2,
  GitFork,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

const stages = [
  {
    id: "PLAN",
    corner: "chat",
    eyebrow: "Round 01 · Chat",
    title: "Turn intent into a finite plan.",
    body: "Chat reasons about the goal, identifies the likely files, and defines what done means before Codex touches the repo.",
    signal: "[C2C] PLAN",
  },
  {
    id: "TAG",
    corner: "tag",
    eyebrow: "The handoff",
    title: "Pass the goal—not the whole conversation.",
    body: "A compact control message crosses the ropes. The task identity and success criteria stay intact without a giant context dump.",
    signal: "GOAL LOCKED",
  },
  {
    id: "BUILD",
    corner: "codex",
    eyebrow: "Round 02 · Codex",
    title: "Edit, run, test, report.",
    body: "Codex works in the mounted repository with its own tools, then records a durable execution receipt for review.",
    signal: "[C2C] EXECUTED",
  },
  {
    id: "REVIEW",
    corner: "review",
    eyebrow: "Round 03 · Chat",
    title: "Review independently. Finish deliberately.",
    body: "Chat inspects the result and calls DONE, sends another PLAN, or surfaces one BLOCKED decision for a human.",
    signal: "DONE ✓",
  },
] as const;

const features = [
  {
    icon: MessageSquareText,
    number: "01",
    title: "Chat owns the thinking",
    body: "Planning and independent review stay in a plain cloud Chat thread.",
  },
  {
    icon: Terminal,
    number: "02",
    title: "Codex owns the repo",
    body: "Edits, shell commands, and tests happen where the project is mounted.",
  },
  {
    icon: Zap,
    number: "03",
    title: "Keybinds move the baton",
    body: "Desktop shortcuts and clipboard messages replace nested browser automation.",
  },
  {
    icon: ShieldCheck,
    number: "04",
    title: "MCP stays read-only",
    body: "Optional repo visibility gives Chat evidence without handing it write access.",
  },
] as const;

const install = `git clone https://github.com/tuckcode/TagTeamGPT.git
cd TagTeamGPT
mkdir -p ~/.agents/skills
cp -R .agents/skills/tagteam ~/.agents/skills/tagteam`;

export function RelayArena() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = stages[stage];
  const imageBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setStage((value) => (value + 1) % stages.length),
      2600,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  async function copyInstall() {
    await navigator.clipboard.writeText(install);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main>
      <header className="site-nav">
        <a className="wordmark" href="#top" aria-label="TagTeamGPT home">
          <span>TAG</span>TEAM<span>GPT</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#relay">The relay</a>
          <a href="#install">Install</a>
          <a href="#rules">Rules</a>
        </nav>
        <a
          className="repo-link"
          href="https://github.com/tuckcode/TagTeamGPT"
          target="_blank"
          rel="noreferrer"
        >
          <GitFork size={16} /> GitHub
        </a>
      </header>

      <section className="hero-shell" id="top">
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-copy">
          <p className="kicker"><span /> Chat ↔ Codex, ringside</p>
          <h1>
            One goal.
            <br />
            <em>Two corners.</em>
          </h1>
          <p className="hero-lede">
            Chat calls the play. Codex ships the change. TagTeamGPT keeps the
            same mission moving between them inside the desktop app.
          </p>
          <div className="hero-actions">
            <a className="button-primary" href="#relay">
              Watch the handoff <ArrowDown size={17} />
            </a>
            <a className="button-ghost" href="#install">Install $tagteam</a>
          </div>
          <div className="hero-proof" aria-label="Project attributes">
            <span><Check size={14} /> Open source</span>
            <span><Check size={14} /> Desktop native</span>
            <span><Check size={14} /> Human on BLOCKED</span>
          </div>
        </div>
        <div
          className="hero-poster"
          role="img"
          aria-label="Chat and coding robots tagging hands in a futuristic wrestling ring"
          style={{ "--poster-image": `url(${imageBase}/tagteamgpt-banner.png)` } as CSSProperties & Record<"--poster-image", string>}
        >
          <div className="poster-label">PLAN IN CHAT <span>×</span> BUILD IN CODEX</div>
        </div>
      </section>

      <section className="marquee" aria-label="TagTeamGPT protocol states">
        <div>INIT <span>→</span> PLAN <span>→</span> EXECUTE <span>→</span> REVIEW <span>→</span> DONE <b>✦</b> INIT <span>→</span> PLAN <span>→</span> EXECUTE <span>→</span> REVIEW <span>→</span> DONE</div>
      </section>

      <section className="relay-section" id="relay">
        <div className="section-heading">
          <p className="kicker"><span /> Interactive protocol</p>
          <h2>See the baton move.</h2>
          <p>Four stages. One task ID. No context avalanche.</p>
        </div>

        <div className="arena-panel">
          <div className={`arena-visual state-${current.corner}`}>
            <div className="arena-grid" aria-hidden="true" />
            <div className="corner corner-chat">
              <MessageSquareText size={28} />
              <strong>CHAT</strong>
              <small>plan + review</small>
            </div>
            <div className="corner corner-codex">
              <Code2 size={28} />
              <strong>CODEX</strong>
              <small>edit + test</small>
            </div>
            <div className="ring">
              <div className="rope rope-one" />
              <div className="rope rope-two" />
              <div className="rope rope-three" />
              <div className="goal-baton">
                <Sparkles size={16} />
                <span>{current.signal}</span>
              </div>
            </div>
            <div className="round-counter">0{stage + 1} / 04</div>
          </div>

          <div className="arena-copy" aria-live="polite">
            <p className="stage-eyebrow">{current.eyebrow}</p>
            <h3>{current.title}</h3>
            <p>{current.body}</p>
            <div className="stage-tabs" role="tablist" aria-label="Relay stages">
              {stages.map((item, index) => (
                <button
                  key={item.id}
                  className={index === stage ? "active" : ""}
                  onClick={() => { setStage(index); setPlaying(false); }}
                  role="tab"
                  aria-selected={index === stage}
                >
                  {item.id}
                </button>
              ))}
            </div>
            <div className="player-controls">
              <button onClick={() => setPlaying((value) => !value)}>
                {playing ? <Pause size={17} /> : <Play size={17} />}
                {playing ? "Pause relay" : "Play relay"}
              </button>
              <button onClick={() => { setStage(0); setPlaying(false); }} aria-label="Reset relay">
                <RotateCcw size={17} /> Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section" id="rules">
        <div className="section-heading compact">
          <p className="kicker"><span /> The corner rules</p>
          <h2>Clear roles. Clean handoffs.</h2>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, number, title, body }) => (
            <article key={number}>
              <div className="feature-top"><span>{number}</span><Icon size={22} /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="install-section" id="install">
        <div className="install-copy">
          <p className="kicker"><span /> Get in the ring</p>
          <h2>Install once.<br />Tag in anywhere.</h2>
          <p>
            Copy the skill to your shared Codex skills folder, open a cloud Chat
            thread for planning, and mount the real project in Codex.
          </p>
          <a href="https://github.com/tuckcode/TagTeamGPT/blob/main/docs/install.md" target="_blank" rel="noreferrer">
            Read the full setup guide <ArrowRight size={16} />
          </a>
        </div>
        <div className="terminal-card">
          <div className="terminal-bar">
            <div><i /><i /><i /></div>
            <span>install.sh</span>
            <button onClick={copyInstall} aria-label="Copy installation commands">
              {copied ? <Check size={16} /> : <Clipboard size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre><code>{install}</code></pre>
          <div className="invoke-line"><span>$</span> Invoke with <strong>$tagteam</strong></div>
        </div>
      </section>

      <section className="cta-section">
        <p>THE BELL IS YOUR PROMPT.</p>
        <h2>Give the team a goal.</h2>
        <a href="https://github.com/tuckcode/TagTeamGPT" target="_blank" rel="noreferrer">
          View on GitHub <GitFork size={18} />
        </a>
      </section>

      <footer>
        <div className="wordmark"><span>TAG</span>TEAM<span>GPT</span></div>
        <p>Independent open-source project. Not affiliated with OpenAI.</p>
        <div><a href="https://github.com/tuckcode/TagTeamGPT/blob/main/docs/usage.md">Docs</a><a href="https://github.com/XiaoDuoYa/codex-with-chatgpt">Credit</a></div>
      </footer>
    </main>
  );
}
