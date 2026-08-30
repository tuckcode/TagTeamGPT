# CodexGPT protocol (v0)

Control messages are tiny `[C2C]` stubs. The user copies them into the ChatGPT
desktop **Chat** tab and pastes Chat’s reply back into **Codex**. No nested
`chatgpt.com` browser automation. No Work mode as the planner.

## Hard rules

1. Keep every Codex→Chat control message under ~1 KB.
2. Never paste full file bodies, full diffs, or long logs into Chat unless Chat
   explicitly asks for a short targeted snippet.
3. Chat owns plan and review. Codex owns edit, shell, git, and tests.
4. Never use **Work** as the planning brain (Work is Codex-like usage).
5. Default max iterations: **12**. At the limit, pause and ask the user whether
   to continue.
6. Stay C2C-compatible so boot prompts and state headers match upstream
   Codex-with-ChatGPT protocol shape.

## States

```
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED
```

## Boot prompt (paste once into a pinned Chat thread)

```
You are the planning and review layer of a Codex coding session.

Codex owns execution (edit, shell, git, tests).
You own high-level reasoning, planning, and review.

You are talking through the ChatGPT desktop Chat tab. The human (or Codex)
will paste short [C2C] control messages. Reply with [C2C] control messages only
for state changes.

Rules:

1. Do not ask Codex to paste whole files or full diffs unless you truly need a
   short targeted snippet.
2. Produce concise, finite, executable plans — not 40-step epics.
3. After Codex reports EXECUTED, review independently. If the CodexGPT workspace
   connector is enabled, prefer git_diff / read_file over asking for pastes.
   If it is not, do not trust “all tests passed” at face value; ask for a short
   path list or one targeted snippet only when unclear.
4. Continue until SUCCESS_CRITERIA are met, then reply DONE.
5. If you cannot proceed without a human decision, reply BLOCKED with one clear
   NEEDS item.
6. Always return structured [C2C] messages with STATE headers.
7. Be substantive: PLAN needs GOAL, RATIONALE (prose reasoning — not a
   restatement of the checklist), ACTIONS, FILES_LIKELY_INVOLVED, TESTS, and
   SUCCESS_CRITERIA. Never reply with a bare one-liner or ACTIONS-only list.
```

## INIT (Codex → Chat)

```
[C2C]
STATE: INIT
TASK_ID: c2c_XXXX
ITERATION: 0

GOAL:
<one paragraph goal>

INSTRUCTION:
Create an implementation PLAN for Codex. Keep it finite and executable.
Reply with a C2C PLAN message.
```

## PLAN (Chat → Codex) — expected shape

A PLAN is **reasoning first**, checklist second. `RATIONALE` should read like a
short design note (why this approach, what to avoid, what “done” means).
`ACTIONS` is a finite execution list for Codex — not the whole plan.

```
[C2C]
STATE: PLAN
TASK_ID: c2c_XXXX
ITERATION: N

GOAL:
<one paragraph: what success looks like for the human>

RATIONALE:
<prose: approach, constraints, risks, why these files — not a restatement of ACTIONS>

ACTIONS:
1. ...
2. ...

FILES_LIKELY_INVOLVED:
...

TESTS:
...

SUCCESS_CRITERIA:
...
```

## EXECUTED (Codex → Chat)

```
[C2C]
STATE: EXECUTED
TASK_ID: c2c_XXXX
ITERATION: N

RESULT:
Execution finished.

CHANGED_FILES:
<count>

TESTS:
<summary or "not run">

Please review against SUCCESS_CRITERIA and reply DONE, PLAN (next), or BLOCKED.
```

## DONE (Chat → Codex)

```
[C2C]
STATE: DONE
TASK_ID: c2c_XXXX
ITERATION: N

SUMMARY:
...
```

## BLOCKED (Chat → Codex)

```
[C2C]
STATE: BLOCKED
TASK_ID: c2c_XXXX
ITERATION: N

REASON:
...

NEEDS:
<one human decision>
```
