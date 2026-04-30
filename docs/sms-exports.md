# Handling Twilio SMS / messaging-log exports

## TL;DR

**Never** drop a raw Twilio CSV export into `attached_assets/` (or anywhere
else inside the repo). Use `/tmp/sms-exports/` instead.

## Why this matters

Twilio Console exports are named like:

```
sms-log-AC<32 hex chars>.csv
messages-AC<32 hex chars>.csv
```

The filename leaks the **Twilio Account SID**, and the body contains
customer **phone numbers and message bodies**. Any of these committed to a
public GitHub repo is a credentialed PII leak.

The Replit editor auto-saves a checkpoint of unstaged files in
`attached_assets/` whenever a new agent task starts. Combined with the
"attach file" affordance in chat, it is dangerously easy for a Twilio
export to ride that auto-checkpoint into the next git push.

## Workflow

1. When you download an export from the Twilio Console, save it to
   `/tmp/sms-exports/` (create the directory if it is missing —
   `mkdir -p /tmp/sms-exports`). `/tmp` is outside the project tree, so
   nothing in there is ever picked up by git or by Replit checkpoints.
2. If you need to share a snippet of the data with the agent or with a
   teammate, **scrub it first**:
   - Replace the SID (`AC[0-9a-fA-F]{32}`) with a placeholder such as
     `AC<sid>`.
   - Truncate or mask the `To` / `From` columns (`+1*******1234`).
   - Drop or hash the `Body` column.
   If the scrubbed version really needs to live in the repo, save it
   **outside `attached_assets/`** — e.g. `docs/examples/sms-sample-scrubbed.csv`
   — because `.gitignore` now blocks every `*.csv` in `attached_assets/`.
   `git add -f attached_assets/sms-sample-scrubbed.csv` is the explicit
   escape hatch if you need to override the ignore for a single file,
   but prefer the `docs/examples/` location so the policy stays the
   default.
3. Delete the raw export from `/tmp/sms-exports/` once you are done.
   `/tmp` is wiped on container restart, but explicit `rm` is safer.

## Belt and braces

Two automated guards catch slip-ups:

- **`.gitignore`** ignores `attached_assets/*.csv` and any file in
  `attached_assets/` whose name contains `AC` (the SID prefix), plus the
  obvious `sms-log-*`, `messages-*`, `twilio-*` prefixes. So even an
  accidental `git add attached_assets/sms-log-2026-04-30.csv` is a no-op.
- **`.github/workflows/secret-scan.yml`** runs on every push and pull
  request. It greps the working tree for the literal regex
  `AC[0-9a-fA-F]{32}` and fails the build if it finds a match. This
  catches the case where a SID slips into a file with an unexpected
  name (e.g. `notes.md` or `my-export.txt`).

If the secret-scan workflow ever fails on you, do **not** "fix" it by
deleting the offending line in a follow-up commit — the SID is still in
git history. Rotate the Twilio Auth Token and ask the maintainer to
rewrite history (or open a fresh task following the same playbook as
Task #180 / #182).
