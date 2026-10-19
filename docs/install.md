# Install TagTeamGPT

Goal: get the skill into **ChatGPT desktop Codex**, then set up Chat and Codex the right way.

The product is **TagTeamGPT**. Invoke with `$tagteam`. Clone: `tuckcode/TagTeamGPT`.

## What you need

- ChatGPT desktop app (Chat · Work · Codex in one window)
- A coding project folder you can mount in Codex
- Optional: Node.js 20+ if you want the keystroke driver (macOS + Windows), auto-loop, or MCP helper

## 1. Get the code

```bash
git clone https://github.com/tuckcode/TagTeamGPT.git
cd TagTeamGPT
```

If the repo lives in a nested folder on your machine, `cd` into the package that contains `.agents/skills/tagteam`.

## 2. Install the skill

Pick one:

### A. Use this repo as a Codex project (simplest)

1. Open ChatGPT desktop → **Codex**.
2. Add / open this repo as a **project** (folder mounted).
3. Codex loads skills from `.agents/skills/` automatically.

### B. Install for all Codex projects

```bash
mkdir -p ~/.agents/skills
cp -R .agents/skills/tagteam ~/.agents/skills/tagteam
```

Restart Codex or reopen the project if `$tagteam` does not appear.

If you previously copied `$codexgpt` or `$tagteam`, delete those skill folders and copy `.agents/skills/tagteam` instead.

### Invoke

In a **Codex** composer, type:

```text
$tagteam
```

or say: `Use TagTeamGPT to …`

> Note: `$` is ChatGPT **Codex** skill syntax. Cursor’s `/` picker is a different system.

## 3. Wire Chat and Codex (critical)

ChatGPT **local folder projects do not support Chat**. You will see a banner like:

> Local projects don't support Chat.

Do this instead:

| Mode | Setup |
| --- | --- |
| **Chat** | Plain **cloud** thread — **no** local folder attached |
| **Codex** | Your real project folder **mounted** |
| **Work** | Do **not** use as planner or executor |

Pin **one Chat thread** per goal. Name it something obvious (e.g. `PLANNER`) so you do not paste into the wrong place.

### Mode shortcuts

| OS | Chat | Work | Codex |
| --- | --- | --- | --- |
| macOS | `Control+1` | `Control+2` | `Control+3` |
| Windows / Linux | `Alt+1` | `Alt+2` | `Alt+3` |

Remap in Settings → Keyboard Shortcuts if needed.

**Do not re-press Chat’s shortcut when you are already in Chat** — on macOS `Control+1` can open **New chat** and abandon your pinned planner thread.

**Mode ≠ project.** `Control+3` / `Alt+3` only flips the Codex tab. Bind the folder with `--path` (or `$tagteam` path + goal). Do not click the sidebar every hop. The folder must already be a Codex project from install.

## 4. Optional: guarded desktop control

The automated driver currently supports macOS.
Windows automated sends are disabled. Use manual handoffs on Windows.
Read [desktop control](desktop-control.md) before any automated setup or send.
That guide defines the current requirements, warning periods, bindings, and interruption behavior.

Use separate named Chat and Codex windows with empty message boxes.
Bind each conversation through the guarded driver before starting the loop.
The driver requires the Swift compiler, Accessibility permission, and input observation permission.
If a guard fails, preserve the draft and inspect the conversation.
Resume only after the user explicitly authorizes continuation.

The automated loop requires Chat replies through the connector's `submit_c2c` tool.
Manual handoffs remain available without the driver or connector.
The complete automated planning, execution, and review cycle still needs live validation.

## 5. Optional: MCP connector

Manual handoffs can work without MCP.
The automated loop needs `submit_c2c` to receive Chat replies.
The connector also lets Chat inspect selected files and changes.

Use the [private connector setup](private-connector.md) for first installation and restarts.
That guide includes a request that you can copy to an agent.
Select **TagTeamGPT Private** with `@` in the Chat thread.
Confirm the folder with `workspace_info` before review.
The local server keeps its access key. The private tunnel supplies it locally.
The public Cloudflare helper does not manage this private connection.

## Sanity check

1. Codex: `$tagteam` is recognized.
2. Chat: cloud thread, no folder banner.
3. Codex: sidebar shows **this goal’s** mounted folder; `pwd` is your real git root (not `~/Documents/Codex/…` snapshot).
4. For automated handoffs, verify both conversation bindings as described in [desktop control](desktop-control.md).

Next: [Usage](usage.md).
