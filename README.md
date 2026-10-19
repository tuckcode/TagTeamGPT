# TagTeamGPT

TagTeamGPT relays a coding goal between Chat and Codex in the existing ChatGPT desktop app: Chat plans and reviews, while Codex edits files and runs tests.

Its purpose is to reduce Codex usage spent on planning and repeated review.
The project has no published savings benchmark or verified savings percentage.
Read the [usage rationale and measurement plan](docs/usage-savings.md).

This is an experimental skill and a set of local tools.
The macOS helper displays a warning before desktop control and a pause banner after interruption.
The repository also includes an explainer website. That website is separate from the desktop workflow.
TagTeamGPT is an independent project inspired by [codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt).

![TagTeamGPT wrestling banner](docs/tagteamgpt-banner.png)

## Quick start

Install the skill from this repository:

```bash
git clone https://github.com/tuckcode/TagTeamGPT.git
cd TagTeamGPT
mkdir -p ~/.agents/skills
cp -R .agents/skills/tagteam ~/.agents/skills/tagteam
```

Open your target coding project in desktop Codex.
Invoke the skill in its message box:

```text
$tagteam
```

Provide the goal and the target project path.
Keep the planner in an ordinary cloud Chat conversation.
Keep the target project attached to Codex.
Use manual handoffs when desktop control is unavailable.
Read the [installation guide](docs/install.md) for the manual workflow.

## How the relay works

1. Chat receives the goal and prepares a plan.
2. Codex implements the plan in the target project and records the result.
3. Chat reviews the evidence and requests changes or completes the task.

Small `[C2C]` messages identify the task, iteration, and state.
The automated loop receives Chat replies through `submit_c2c`, a connector tool that saves the reply locally.
Codex completion is recorded in `.tagteam/executed.json` inside the target project.
The loop also saves changes for each turn so Chat can review that turn independently.
See the [loop guide](docs/loop.md) and [review evidence guide](docs/turn-reviews.md).

## Desktop control and current limits

The guarded macOS driver verifies the named conversation and checks for an empty message box before sending.
It shows a blue warning for two seconds before a send. Setup actions use a 15-second warning.
Clicks, typing, scrolling, and application changes interrupt control.
An interruption preserves the paused state and requires inspection and explicit authorization before continuation.
The driver never automatically retries an interrupted send.

The helper requires the Swift compiler and macOS permissions for Accessibility and input observation.
Windows automated sends are disabled. Use manual handoffs on Windows.
Live checks proved interruption protection and one guarded message delivery.
A complete Chat planning, Codex execution, and Chat review cycle still needs live validation.

Read [desktop control](docs/desktop-control.md) before binding conversations or starting the loop.
That guide defines the current control behavior.

## Optional workspace connector

MCP, a protocol that connects AI tools to local data, lets Chat inspect selected files and changes.
Repository inspection tools are read-only.
The `submit_c2c` tool writes the relay reply to `.tagteam/last-reply.json`.
The automated loop requires that reply mechanism. Manual handoffs can work without the connector.

The private connection uses **TagTeamGPT Private** through OpenAI Secure MCP Tunnel.
Follow the [private connector guide](docs/private-connector.md) and confirm the target folder before review.
The public Cloudflare helper manages a separate connection.

## Documentation and help

- [Install](docs/install.md): skill installation and manual setup.
- [Desktop control](docs/desktop-control.md): warnings, binding, interruption, and recovery.
- [Usage](docs/usage.md): handoffs and optional tools.
- [Troubleshooting](docs/troubleshooting.md): common failures.
- [Source of truth](docs/source-of-truth.md): the authoritative local copy and older copies.

Report project problems through [GitHub issues](https://github.com/tuckcode/TagTeamGPT/issues).
This repository does not identify an individual maintainer or include a contributing guide.

## Explainer website

The website explains the project. It does not start the relay.
To run it locally:

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## License and credit

This repository does not include a license file.
The upstream inspiration is MIT-licensed. That license does not establish a license for this repository.
