export const SOURCE_REPO = "https://github.com/XiaoDuoYa/codex-with-chatgpt";

export const NAV = [
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#loop", label: "The loop" },
  { href: "#security", label: "Security" },
  { href: "#benefit", label: "The benefit" },
  { href: "#caveats", label: "Caveats" },
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
    what: "Paginated diff (unstaged / staged / vs HEAD). The independent review tool.",
  },
  {
    name: "test_status",
    scope: "execution.read",
    what: "Does not run tests. Reads the latest record Codex wrote with c2c record.",
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
    title: "Ask ChatGPT to inspect and plan",
    detail:
      "Codex types a tiny [C2C] message into the ChatGPT web UI. No files, no diffs. Just the goal.",
    message: `[C2C]
STATE: INIT
TASK_ID: c2c_f81a
ITERATION: 0

GOAL:
Implement dark mode.

INSTRUCTION:
Inspect the connected workspace through MCP.
Create an implementation plan for Codex.`,
  },
  {
    state: "PLAN",
    sender: "ChatGPT",
    title: "Pull code, then write a finite plan",
    detail:
      "ChatGPT uses the eight MCP tools to read what it needs, then replies with ACTIONS, FILES, TESTS, and SUCCESS_CRITERIA — not a 40-step epic.",
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
    title: "Codex executes with its own harness",
    detail:
      "ChatGPT does not micro-manage tool calls. Codex edits, shells, tests, and commits using the same Codex agent you already use.",
    message: `c2c record --task c2c_f81a --iteration 1 \\
  --changed-files "src/theme/ThemeProvider.tsx,src/components/Header.tsx" \\
  --tests "27 passed" --exit-status ok`,
  },
  {
    state: "EXECUTED",
    sender: "Codex",
    title: "Report metadata only",
    detail:
      "Codex never pastes the diff. It tells ChatGPT to inspect the workspace itself.",
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

Please independently inspect the git diff through MCP.`,
  },
  {
    state: "REVIEW",
    sender: "ChatGPT",
    title: "Independent review via MCP",
    detail:
      "ChatGPT calls git_diff, read_file, and test_status. It is instructed not to trust “all tests passed” at face value.",
    message: `MCP calls this turn
• git_diff mode=head
• read_file src/theme/ThemeProvider.tsx
• test_status

Finding: toggle flashes on load because
preference is applied after first paint.`,
  },
  {
    state: "DONE",
    sender: "ChatGPT",
    title: "Done, another plan, or blocked",
    detail:
      "If success criteria are met → DONE. If not → PLAN for the next iteration. If a human decision is required → BLOCKED. Default cap is 12 iterations.",
    message: `[C2C]
STATE: DONE
TASK_ID: c2c_f81a
ITERATION: 2

SUMMARY:
Dark mode persists. Flash-on-load fixed by
reading the stored preference before paint.`,
  },
] as const;
