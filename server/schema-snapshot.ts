/**
 * server/schema-snapshot.ts — Task #177
 *
 * In-process wrapper around scripts/schema-snapshot.mjs. Used by:
 *   - GET /api/admin/schema-snapshot/check (admin or cron-secret protected)
 *   - The weekly self-cron in server/index.ts
 *
 * Why this lives separately from scripts/schema-snapshot.mjs:
 *   The .mjs file is the source of truth for the pg_dump invocation,
 *   normalization, and diff logic so the same code runs in CI, the cron
 *   route, and on a developer's laptop. This module just wires the .mjs
 *   into the running server's DATABASE_URL and the gmail-based admin
 *   notifier.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dumpSchema,
  normalizeDump,
  diffSnapshots,
  compactDiff,
} from '../scripts/schema-snapshot.mjs';
import { sendNewEmail } from './gmail-client.js';
import { DEFAULT_ADMIN_EMAIL } from './config-defaults.js';

// Inlined from server/vite.ts on purpose: importing from './vite.js' here
// pulls vite.config into the Vercel serverless bundle, which fails to
// resolve at runtime ("Cannot find module '/var/task/vite.config'") and
// kills every route. Keep this in sync with the log() in vite.ts.
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// We resolve the snapshot path from process.cwd() instead of importing the
// SNAPSHOT_PATH constant from the .mjs. The .mjs computes its constant from
// `import.meta.url`, which is correct when run as a CLI but unreliable once
// the .mjs is inlined by esbuild's `--bundle` (the bundled module's URL is
// the dist file, not the original scripts/ path). The server always starts
// with the project root as cwd in both dev (`tsx server/index.ts`) and prod
// (`node dist/index.js`), so cwd-relative resolution is stable.
export const SNAPSHOT_PATH = resolve(process.cwd(), 'drizzle', 'schema-snapshot.sql');

export interface SchemaSnapshotCheckResult {
  /** Path of the committed snapshot we compared against. */
  snapshotPath: string;
  /** True when the committed snapshot was missing (first-run case). */
  baselineMissing: boolean;
  /** True iff DB matches the committed snapshot. */
  ok: boolean;
  /** Empty when ok; otherwise the unified diff (full). */
  diff: string;
  /** Compact diff suitable for embedding in an email. */
  compactDiff: string;
  /** Snapshot of the live DB rendered as text (always populated). */
  currentSnapshot: string;
  /** Number of "+ " or "- " lines in the diff. */
  changedLineCount: number;
}

/**
 * Run the full snapshot/diff pipeline against the live DB.
 * Throws only on infrastructure failure (DB unreachable, etc.). Schema drift
 * is a normal result, not a thrown error — the caller decides what to do.
 */
export async function runSchemaSnapshotCheck(): Promise<SchemaSnapshotCheckResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set; cannot run schema snapshot check.');
  }
  const raw = await dumpSchema(databaseUrl);
  const currentSnapshot = normalizeDump(raw);

  if (!existsSync(SNAPSHOT_PATH)) {
    return {
      snapshotPath: SNAPSHOT_PATH,
      baselineMissing: true,
      ok: false,
      diff: '',
      compactDiff: '',
      currentSnapshot,
      changedLineCount: 0,
    };
  }
  const committed = await readFile(SNAPSHOT_PATH, 'utf8');
  const diff = diffSnapshots(committed, currentSnapshot);
  const ok = diff === '';
  const changedLineCount = ok
    ? 0
    : diff.split('\n').filter((l: string) => l.startsWith('+ ') || l.startsWith('- ')).length;
  return {
    snapshotPath: SNAPSHOT_PATH,
    baselineMissing: false,
    ok,
    diff,
    compactDiff: ok ? '' : compactDiff(diff),
    currentSnapshot,
    changedLineCount,
  };
}

/**
 * Resolves the admin email the same way the rest of the codebase does:
 * ADMIN_EMAIL > GMAIL_USER > DEFAULT_ADMIN_EMAIL. Kept as a separate helper
 * so the cron and the route stay consistent.
 */
function resolveAdminEmail(): string {
  return (
    process.env.ADMIN_EMAIL?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    DEFAULT_ADMIN_EMAIL
  );
}

/**
 * Send the drift report to the admin email. Caps the embedded diff so we
 * don't post a 500 KB email when someone drops every table at once.
 */
export async function emailSchemaDriftReport(result: SchemaSnapshotCheckResult): Promise<void> {
  if (result.ok && !result.baselineMissing) return;
  const adminEmail = resolveAdminEmail();
  const subject = result.baselineMissing
    ? 'Schema snapshot baseline missing'
    : `Schema drift detected — ${result.changedLineCount} line(s) differ`;
  const MAX_DIFF_BYTES = 60_000;
  let body: string;
  if (result.baselineMissing) {
    body =
      `The committed schema snapshot was not found at ${result.snapshotPath}.\n\n` +
      `Run \`node scripts/schema-snapshot.mjs --write\` from a checkout connected ` +
      `to the production DB and commit the resulting file. Until then, this cron ` +
      `cannot detect schema drift.\n`;
  } else {
    let diffBlock = result.compactDiff;
    if (diffBlock.length > MAX_DIFF_BYTES) {
      diffBlock = diffBlock.slice(0, MAX_DIFF_BYTES) + '\n... (diff truncated) ...';
    }
    body =
      `The live database schema no longer matches the committed snapshot at\n` +
      `${result.snapshotPath}.\n\n` +
      `Changed lines: ${result.changedLineCount}\n\n` +
      `Compact diff (committed = "-", live DB = "+"):\n` +
      `--------------------------------------------------------------\n` +
      `${diffBlock}\n` +
      `--------------------------------------------------------------\n\n` +
      `If this drift was intentional (e.g. ensureSchemaUpgrades added a new ` +
      `column), regenerate the snapshot with:\n\n` +
      `    node scripts/schema-snapshot.mjs --write\n\n` +
      `and commit drizzle/schema-snapshot.sql so future drift reports stay ` +
      `meaningful. If it was NOT intentional, the live DB has unexpected ` +
      `changes — investigate before they cause request-time HTTP 500s.\n`;
  }

  try {
    await sendNewEmail(adminEmail, subject, body);
    log(`schema-snapshot: drift report emailed to ${adminEmail}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Never throw from the cron — log and move on.
    console.error(`[schema-snapshot] failed to email drift report to ${adminEmail}: ${msg}`);
  }
}

const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
// Wait this long after boot before the first check so we don't add load
// to the boot path or race ensureSchemaUpgrades on a fresh deploy.
const STARTUP_DELAY_MS = 5 * 60 * 1000;

let cronTimer: NodeJS.Timeout | null = null;

/**
 * Schedule the weekly drift check. Idempotent — calling this twice will
 * cancel the previous timer.
 *
 * Set SCHEMA_SNAPSHOT_CRON_DISABLED=1 to skip scheduling (useful in tests).
 */
export function startSchemaSnapshotCron(): void {
  if (process.env.SCHEMA_SNAPSHOT_CRON_DISABLED === '1') {
    log('schema-snapshot: weekly cron disabled via SCHEMA_SNAPSHOT_CRON_DISABLED=1.');
    return;
  }
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
  // Use unref() so the timer never holds the process open during graceful
  // shutdown.
  const startupHandle = setTimeout(() => {
    void runAndReport('startup');
    cronTimer = setInterval(() => {
      void runAndReport('weekly');
    }, WEEKLY_INTERVAL_MS);
    cronTimer.unref?.();
  }, STARTUP_DELAY_MS);
  startupHandle.unref?.();
  log(
    `schema-snapshot: weekly drift check scheduled ` +
      `(first run in ${Math.round(STARTUP_DELAY_MS / 60_000)} min, then every 7 days).`,
  );
}

async function runAndReport(trigger: 'startup' | 'weekly' | 'manual'): Promise<void> {
  try {
    const result = await runSchemaSnapshotCheck();
    if (result.ok) {
      log(`schema-snapshot: ${trigger} check OK — live DB matches committed snapshot.`);
      return;
    }
    if (result.baselineMissing) {
      log(`schema-snapshot: ${trigger} check — baseline snapshot missing; emailing admin.`);
    } else {
      log(
        `schema-snapshot: ${trigger} check — DRIFT (${result.changedLineCount} changed line(s)); emailing admin.`,
      );
    }
    await emailSchemaDriftReport(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[schema-snapshot] ${trigger} check failed: ${msg}`);
  }
}

/**
 * Manually trigger a check + email. Exposed for the admin route so an
 * operator can force a drift report on demand.
 */
export async function triggerSchemaSnapshotCheck(): Promise<SchemaSnapshotCheckResult> {
  const result = await runSchemaSnapshotCheck();
  if (!result.ok) {
    await emailSchemaDriftReport(result);
  }
  return result;
}
