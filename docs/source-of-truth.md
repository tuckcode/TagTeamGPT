# Local source of truth

Use `/Users/dtc/Documents/ChatGPT/TagTeamGPT` for TagTeamGPT development, documentation, and tool execution on this machine.
Use its [README](../README.md) as the product description.
The public repository is `https://github.com/tuckcode/TagTeamGPT.git`.
CodexGPT is an earlier project name. The Origin remote still uses that name.

## Rules for future work

1. Confirm the working directory with `git rev-parse --show-toplevel` before editing or running the tool.
2. Use the local copy named above for product changes.
3. Preserve older copies until their local configuration and runtime state are no longer needed.
4. Inspect `.tagteam` state and connector configuration before changing an existing service path.
5. Follow [desktop control](desktop-control.md) before any live desktop action.

Selecting this source does not move services, secrets, connector settings, or active control state.
It does not authorize a live desktop handoff.

## Older local copies

`/Users/dtc/code/projects/active/TagTeamGPT` contains the original explainer website.
Its saved revision is `536dc07`, dated August 29, 2026, in America/Chicago.
It describes the upstream bridge rather than the current TagTeamGPT tool.
Its README now directs local development here.

`/Users/dtc/code/projects/active/TagTeamGPT/codexgpt` contains the older product copy.
Its saved revision is `b60e1b9`, dated September 20, 2026.
It is an ancestor of this copy's starting revision, `2e613aa`, dated October 17, 2026.
The newer copy contains 10 additional commits and changes across 40 tracked files.
Those changes add desktop guards, private connector instructions, bounded project briefs, saved turn reviews, and updated usage explanations.
The nested copy's README now directs local development here.

The nested copy has unsaved edits in three connector files and an unsaved response-budget test.
Comparison found the same budget implementation and saved-key loading in the newer copy, with subsequent fixes.
The older response-budget test passed against the newer workspace module on October 18, 2026.
The configuration, two demo directories, and pattern poster outside Git match in both product copies.
This copy also has a local `.pnpm-store` dependency cache.
No older code required merging during this comparison.
All existing configuration, demo files, repository history, and runtime state remain in place.

`/Users/dtc/code/projects/active/TagTeamGPT/Untitled` contains Git metadata with no commits or configured remote.
It does not contain another product implementation.
The former `/Users/dtc/code/projects/CodexGPT/codexgpt` path does not exist at the time of inspection.

## Interface evidence

The implemented native interface is the warning and pause banner in `tools/native/tagteam-control.swift`.
It uses white system text on a blue warning panel or a red pause panel.
The website has separate styles and artwork.
This inspection did not identify the app UI renders described in the conversation.
Their origin and any relationship to Rhizome styling remain unverified.
Do not use those renders as evidence of a shipped desktop chat interface.

## Verification boundary

This selection compares local files and saved Git history as of October 18, 2026.
The locally saved `github/main` reference points to `2e613aa`.
No remote fetch, push, service restart, or live desktop action occurred during this selection.

The 17 existing tests passed across two runs after the documentation changes.
The first run passed 16 tests. The HTTP test could not open its temporary local server inside the sandbox.
That test passed when rerun with permission to bind a loopback port.
The older response-budget compatibility test also passed.
Local documentation links and Git whitespace checks passed.
