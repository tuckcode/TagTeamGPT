# TagTeamGPT loop

Run the happy path from the repository root:

```bash
node tools/tagteam-loop.mjs --goal "your goal" --path /path/to/repo
```

ChatGPT is briefly taken for about one second to paste the handoff, then given back. Codex completion is proven by `<repo>/.tagteam/executed.json`.
