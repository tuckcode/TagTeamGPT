# Make your Codex usage go further

TagTeamGPT exists to reduce avoidable Codex usage during software work.
Chat handles planning and independent review.
Codex handles edits, commands, and tests.
The relay passes compact instructions and evidence between them.

## How the design aims to help

- Move planning discussions and review reasoning into ordinary Chat.
- Use `project_brief` to provide relevant rules, test commands, and the current revision.
- Use `turn_review` to inspect one saved turn without including earlier local edits.
- Keep control messages small. Request only the files or patches needed for the decision.
- Stop after an interruption. Repeated failed handoffs consume resources without completing useful work.

These are design choices. They do not establish a billing result.
The connector, review calls, planning conversation, and relay all have overhead.
A small task can cost less when Codex completes it directly.

## What official sources establish

Checked October 17, 2026.
OpenAI explains that task complexity, model choice, context, reasoning, tools, and caching affect usage.
It recommends focused prompts and relevant source material.
See [usage limits and efficiency guidance](https://learn.chatgpt.com/docs/pricing#what-can-i-do-to-make-my-usage-limits-last-longer).

Chat, Work, and Codex are distinct surfaces.
Work and Codex share usage limits.
Use ordinary Chat for this project's planning role.
See [surface selection](https://learn.chatgpt.com/docs/use-chatgpt).
For credit-based workspaces, combined usage and contracted billing rules can apply.
See [the Work administrator FAQ](https://learn.chatgpt.com/docs/enterprise/work-admin-faq).
The project does not promise that every account has separate billing pools.

## What we still need to measure

We have no published controlled benchmark or verified savings percentage.
A shorter patch or handoff measures transferred text, not charged usage.

Compare the same disposable task through direct Codex and through the full relay.
Use equivalent starting files, model settings, tests, and completion criteria.
Record elapsed time, retries, calls, and transferred bytes separately.
Record account usage changes only when the dashboard exposes a useful measurement.
Include Chat planning and review overhead when reporting the total workflow.
Report unavailable measurements as unavailable.
Publish both successful outcomes and failed attempts before claiming savings.
