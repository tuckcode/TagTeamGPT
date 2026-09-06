export const UPSTREAM_REPO = "https://github.com/XiaoDuoYa/codex-with-chatgpt";
export const GITHUB_REPO = "https://github.com/tuckcode/CodexGPT";
export const THIS_REPO = GITHUB_REPO;
export const PRODUCT_NAME = "Lob";
export const TAGLINE = "Chat lobs. Codex dunks.";
export const SKILL_PATH = ".agents/skills/lob";
export const SKILL_INVOKE = "$lob";

export const NAV = [
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#loop", label: "The loop" },
  { href: "#desktop", label: "Desktop glue" },
  { href: "#benefit", label: "The benefit" },
  { href: "#caveats", label: "Caveats" },
] as const;

export const SHORTCUTS = [
  { platform: "macOS", chat: "⌃1", work: "⌃2", codex: "⌃3" },
  { platform: "Windows / Linux", chat: "Alt+1", work: "Alt+2", codex: "Alt+3" },
] as const;

export const MCP_TOOLS = [
  {
    name: "workspace_info",
    scope: "workspace.read",
    what: "Project type, languages, git branch, dirty state. Call this first.",
  },
  {
    name: "list_directory",
    scope: "workspace.read",
    what: "Paginated directory listing. Skips node_modules, .git, build output.",
  },
  {
    name: "read_file",
    scope: "workspace.read",
    what: "Paginated file read. Sensitive files (.env, keys) are always denied.",
  },
  {
    name: "search_workspace",
    scope: "workspace.search",
    what: "ripgrep (or Node fallback) across the workspace.",
  },
  {
    name: "git_status",
    scope: "git.read",
    what: "Branch plus staged, unstaged, and untracked files.",
  },
  {
    name: "git_diff",
    scope: "git.read",
    what: "Paginated diff. The independent review tool after EXECUTED.",
  },
  {
    name: "test_status",
    scope: "execution.read",
    what: "Reads the latest record Codex wrote — does not run tests.",
  },
  {
    name: "execution_summary",
    scope: "execution.read",
    what: "Recent iterations: changed files, test summary, exit status.",
  },
] as const;

export const PROTOCOL_STEPS = [
  {
    state: "INIT",
    sender: "Codex",
    title: "Switch to Chat, paste the goal",
    detail:
      "From Codex: copy a tiny [C2C] INIT to the clipboard, hit the Chat keybind, paste, send. No mouse hunting on chatgpt.com.",
    message: `[C2C]
STATE: INIT
TASK_ID: c2c_f81a
ITERATION: 0

GOAL:
Implement dark mode.

INSTRUCTION:
Inspect the workspace (MCP if connected).
Reply with a C2C PLAN for Codex.`,
  },
  {
    state: "PLAN",
    sender: "Chat",
    title: "Chat replies with a finite plan",
    detail:
      "Chat (not Work) owns reasoning. If MCP is connected it pulls code itself; otherwise it plans from the brief you pasted.",
    message: `[C2C]
STATE: PLAN
TASK_ID: c2c_f81a
ITERATION: 1

RATIONALE:
Theme lives in ThemeProvider; no persisted preference yet.

ACTIONS:
1. Add a ThemeContext with system/light/dark.
2. Persist the choice to localStorage.
3. Wire a header toggle.

FILES_LIKELY_INVOLVED:
src/theme/ThemeProvider.tsx
src/components/Header.tsx

TESTS:
Toggle survives reload; no flash of the wrong theme.

SUCCESS_CRITERIA:
User preference persists; default follows system.`,
  },
  {
    state: "EXECUTE",
    sender: "Codex",
    title: "Keybind back to Codex — then ship",
    detail:
      "⌃3 / Alt+3 returns to Codex. Chat does not micro-manage tool calls. Codex edits, shells, tests with its own harness.",
    message: `# back in Codex
execute the PLAN
optionally: c2c record --task c2c_f81a --iteration 1 ...`,
  },
  {
    state: "EXECUTED",
    sender: "Codex",
    title: "Report metadata only",
    detail:
      "Clipboard the EXECUTED stub, switch to Chat again. Still no full diff in the composer if MCP can read it.",
    message: `[C2C]
STATE: EXECUTED
TASK_ID: c2c_f81a
ITERATION: 1

RESULT:
Execution finished.

CHANGED_FILES:
2

TESTS:
27 passed

Please independently inspect the git diff
(MCP) or ask for the paths you need.`,
  },
  {
    state: "REVIEW",
    sender: "Chat",
    title: "Independent review",
    detail:
      "Chat inspects via MCP when available, or asks for targeted snippets. It should not rubber-stamp “27 passed.”",
    message: `Review this turn
• git_diff / read_file (if MCP)
• or request ThemeProvider.tsx only

Finding: toggle flashes on load —
preference applied after first paint.`,
  },
  {
    state: "DONE",
    sender: "Chat",
    title: "Done, another plan, or blocked",
    detail:
      "DONE ends the loop. PLAN starts another iteration. BLOCKED surfaces one human decision. Cap iterations so it cannot spin forever.",
    message: `[C2C]
STATE: DONE
TASK_ID: c2c_f81a
ITERATION: 2

SUMMARY:
Dark mode persists. Flash-on-load fixed by
reading the stored preference before paint.`,
  },
] as const;
