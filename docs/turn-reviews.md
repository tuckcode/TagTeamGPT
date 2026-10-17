# Review one Codex turn

Each turn receives a saved baseline before execution and a saved receipt after execution.
Chat reviews the differences between those two working-file snapshots.
Earlier local edits remain in the baseline. They do not appear as new edits from the turn.
Unchanged surrounding lines can still appear as patch context.

## Automatic loop

The loop captures the baseline before sending the plan to Codex.
After execution, Codex writes `<repo>/.tagteam/executed.json` with these fields:

```json
{
  "task_id": "c2c_example",
  "iteration": 1,
  "result": "Describe the completed work.",
  "tests": "State the actual results, or not run."
}
```

The task ID and iteration must match the active turn.
The loop captures final file contents and records the actual changed-file count.
Its EXECUTED message includes a REVIEW reference containing that task ID and iteration.
Chat calls `turn_review` with those identifiers to read the receipt.
Chat supplies a changed `path` to read its saved patch.
If a response includes a cursor, Chat continues the same request with that cursor.
The receipt and patches use the existing response limits.

The loop removes stale execution receipts before dispatch.
It preserves a fast completion receipt that appears immediately after dispatch.
If capture or identity validation fails, the loop returns `TURN_REVIEW_FAILED` and stops.
It does not send a successful review handoff for that turn.
Source edits remain available when capture fails.

## Manual execution

Run the helper from a TagTeamGPT clone.
Give it the target project path, task ID, and iteration.
Exclude `.tagteam/` from that project's version control before capturing a turn.
For a global skill installation, locate that clone before running its helper.
The automatic loop already performs these operations. Use this procedure for manual handoffs.

1. Capture the baseline before editing:

   ```sh
   node tools/tagteam-turn.mjs begin --path /absolute/project/path --task-id c2c_example --iteration 1
   ```

2. Execute the approved plan and run the applicable tests.

3. Save the receipt after testing:

   ```sh
   node tools/tagteam-turn.mjs finish --path /absolute/project/path --task-id c2c_example --iteration 1 \
     --result "Describe the changes." --tests "State the test results."
   ```

4. Include this reference in the EXECUTED message:

   ```text
   REVIEW:
   turn_review task_id=c2c_example iteration=1
   ```

5. Have Chat read the receipt and each relevant saved patch through the selected connector.

## Saved evidence and scope

Receipts and patches live in `.tagteam/reviews/<task-id>-<iteration>/` in the target project.
Git objects contain the file snapshots.
Local references under `refs/tagteam/reviews/` retain those objects across Git garbage collection.
Capture uses an isolated index. It does not stage, commit, restore, or rewrite working files.
Pushing the normal `main` branch does not publish these local review references.
Do not publish review state or use a mirror push to distribute private snapshots.

The record includes saved commits before and after the turn, file hashes, file modes, change types, and reported test results.
Those test results come from Codex. The receipt does not independently prove that tests passed.
The collector captures tracked and untracked files allowed by the connector path policy.
Ignored files, sensitive paths, submodules, and `.tagteam` state are outside that scope.
Renames appear as a deletion and an addition.
Binary changes receive a binary marker and hashes. They require separate inspection before approval.
Any concurrent edits during the capture interval appear in the turn record.
Avoid editing the same project while Codex executes if authorship matters.

Later working-file edits do not change a saved patch.
The tool rejects a saved patch whose file metadata changes after capture.
It rejects a missing, mismatched, or duplicate turn record.

Each snapshot permits at most 10000 files, 4 MiB per file, and 64 MiB of file content.
A turn permits at most 128 changed files, 8 MiB of patch text, and a 64 KiB receipt.
The capture stops with an explicit error when a limit is exceeded.
Use smaller plans or resolve the capture failure before requesting review.

## Enable the new review tool

Restart the local server after installing this update.
Keep the private tunnel running.
Select **Refresh tools** in **TagTeamGPT Private** settings.
Select the plugin in the Chat thread and confirm `turn_review` is available.
If the chat still lists the previous tools, select **@TagTeamGPT Private** again and send a new message.
See [private connector setup](private-connector.md) for restart instructions.
