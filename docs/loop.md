# TagTeamGPT loop

Read [desktop control](desktop-control.md) and bind the intended conversations before starting the loop.
Run the loop from the repository root:

```bash
node tools/tagteam-loop.mjs --goal "your goal" --path /path/to/repo
```

The driver shows a banner before each send.
It pauses when the user interacts or the conversation cannot be verified.
It does not replay an interrupted message or press Enter after a late reply.
Codex completion requires `<repo>/.tagteam/executed.json`.
