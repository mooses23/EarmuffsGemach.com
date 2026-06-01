---
name: schema-drift snapshot dedup
description: How the schema-snapshot drift checker avoids flooding the admin mailbox
---
# Schema-drift snapshot reporting

The committed baseline lives at `drizzle/schema-snapshot.sql`; the checker is
`scripts/schema-snapshot.mjs` (CLI + diff engine) wrapped by
`server/schema-snapshot.ts` (cron + admin route + emailer).

**Rule:** the snapshot must be regenerated (`node scripts/schema-snapshot.mjs
--write` against a DB with all `ensureSchemaUpgrades` applied) whenever
`shared/schema.ts` gains tables/columns, or every drift run emails the admin.

**Why:** drift is detected on startup, weekly cron, and the manual admin route;
reports go to the admin's own address so they land in Inbox AND Sent. A stale
snapshot therefore floods the mailbox on every run.

**Dedup (do not regress):** `maybeEmailSchemaDriftReport()` fingerprints the
drift (sha256 of the full diff) and only emails when it differs from the last
reported one. The fingerprint is persisted in `global_settings` under
`schema_snapshot.last_drift_fingerprint` so dedup survives restarts and Vercel
serverless cold starts (in-memory state would not). Schema-OK clears the
fingerprint so a recurrence re-emails once. Fingerprint is stored only on a
successful send, so transient gmail failures retry. baseline-missing always
emails (intentionally not deduped).
