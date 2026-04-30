/**
 * Startup configuration checks (Task #161).
 *
 * Validates environment variables at boot time and produces a single,
 * easy-to-scan report. The goals are:
 *
 *   1. Hard-fail (throw) on truly required vars so misconfigured deployments
 *      crash loudly instead of "succeeding" then misbehaving silently.
 *   2. Print loud WARNING lines for vars that are required in production
 *      (payments, AI drafting, public URLs) so a deploy without them is
 *      obvious in the logs.
 *   3. Print debug lines noting which fallback default is being used for
 *      optional vars (model names, SITE_URL, ADMIN_EMAIL) so an operator
 *      reading the logs can tell whether the running config is the one
 *      they expected.
 *   4. Print a one-line status for optional integrations (Twilio SMS /
 *      WhatsApp, Gmail) so it's obvious from boot logs which features are
 *      enabled.
 *
 * Call `runStartupChecks()` once, as early as possible, from server/index.ts.
 */

import { sql } from 'drizzle-orm';
import { log } from './vite.js';
// NOTE: `db` is imported dynamically inside runSchemaDriftCheck() so that
// importing this module early does not trigger db.ts's DATABASE_URL guard
// before runStartupChecks() can print its friendly env-validation report.
import { getTwilioConfigStatus, getTwilioWhatsAppConfigStatus } from './twilio-client.js';
import { getGmailConfigStatus } from './gmail-client.js';
import {
  DEFAULT_SITE_URL,
  DEFAULT_DRAFT_MODEL,
  DEFAULT_EMBED_MODEL,
  DEFAULT_ADMIN_EMAIL,
} from './config-defaults.js';

export interface StartupCheckResult {
  errors: string[];
  warnings: string[];
  notices: string[];
}

/**
 * Pure validator. Returns the lists of errors / warnings / notices without
 * logging or throwing, so it can also be exercised from a unit test.
 */
export function collectStartupCheckMessages(env: NodeJS.ProcessEnv = process.env): StartupCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];

  const isSet = (name: string): boolean => {
    const v = env[name];
    return typeof v === 'string' && v.trim().length > 0;
  };

  const isProduction = env.NODE_ENV === 'production';

  // ---- Always required ----------------------------------------------------
  if (!isSet('DATABASE_URL')) {
    errors.push('DATABASE_URL is not set. The app cannot connect to PostgreSQL.');
  }

  // ---- Required in production --------------------------------------------
  if (!isSet('SESSION_SECRET')) {
    if (isProduction) {
      errors.push('SESSION_SECRET is not set. Required in production for signed session cookies.');
    } else {
      notices.push('SESSION_SECRET not set; falling back to the dev-only secret. Do not use this in production.');
    }
  }

  // Public base URL — used to build links in welcome SMS / WhatsApp / email.
  if (!isSet('APP_URL') && !isSet('SITE_URL')) {
    if (isProduction) {
      warnings.push('Neither APP_URL nor SITE_URL is set. Operator welcome links and SMS reminders will fall back to the request host or a hardcoded default and may point at the wrong domain.');
    } else {
      notices.push('Neither APP_URL nor SITE_URL is set; falling back to per-request host in dev.');
    }
  }

  // Stripe — payments are unusable without these.
  if (!isSet('STRIPE_SECRET_KEY')) {
    (isProduction ? errors : warnings).push('STRIPE_SECRET_KEY is not set. Stripe charges, refunds, and SetupIntents will fail.');
  }
  if (!isSet('STRIPE_PUBLISHABLE_KEY') && !isSet('VITE_STRIPE_PUBLISHABLE_KEY')) {
    (isProduction ? errors : warnings).push('STRIPE_PUBLISHABLE_KEY (or VITE_STRIPE_PUBLISHABLE_KEY) is not set. The Stripe payment form on the client will not load.');
  }
  if (!isSet('STRIPE_WEBHOOK_SECRET')) {
    (isProduction ? errors : warnings).push('STRIPE_WEBHOOK_SECRET is not set. Stripe webhook signature verification will reject every event.');
  }

  // OpenAI — AI drafting falls back to a static reply without it.
  if (!isSet('OPENAI_API_KEY')) {
    if (isProduction) {
      warnings.push('OPENAI_API_KEY is not set. AI-drafted email replies will fall back to a generic message and embeddings will be skipped.');
    } else {
      notices.push('OPENAI_API_KEY is not set; AI drafting falls back to a generic reply.');
    }
  }

  // ---- Optional vars with documented defaults (debug-style notices) -------
  if (!isSet('SITE_URL')) {
    notices.push(`SITE_URL not set; using default "${DEFAULT_SITE_URL}" in playbook URLs.`);
  }
  if (!isSet('OPENAI_DRAFT_MODEL')) {
    notices.push(`OPENAI_DRAFT_MODEL not set; using default "${DEFAULT_DRAFT_MODEL}".`);
  }
  if (!isSet('OPENAI_EMBED_MODEL')) {
    notices.push(`OPENAI_EMBED_MODEL not set; using default "${DEFAULT_EMBED_MODEL}".`);
  }
  if (!isSet('ADMIN_EMAIL') && !isSet('GMAIL_USER')) {
    notices.push(`ADMIN_EMAIL / GMAIL_USER not set; admin notifications fall back to "${DEFAULT_ADMIN_EMAIL}".`);
  }

  return { errors, warnings, notices };
}

/**
 * Runs the env-var validator and logs a single startup report, plus the
 * status of the optional integrations (Twilio, Gmail). Throws if any
 * truly-required vars are missing so the process fails fast at boot.
 */
export async function runStartupChecks(): Promise<void> {
  const { errors, warnings, notices } = collectStartupCheckMessages();

  for (const note of notices) {
    log(`config: ${note}`);
  }
  for (const warning of warnings) {
    log(`config WARNING: ${warning}`);
  }

  // Optional integration status — informational, never fatal.
  const sms = getTwilioConfigStatus();
  if (sms.configured) {
    log('config: Twilio SMS configured.');
  } else {
    log(`config: Twilio SMS disabled — ${sms.reason}`);
  }

  const wa = getTwilioWhatsAppConfigStatus();
  if (wa.configured) {
    log('config: Twilio WhatsApp configured.');
  } else {
    log(`config: Twilio WhatsApp disabled — ${wa.reason}`);
  }

  try {
    const gmail = await getGmailConfigStatus();
    if (gmail.configured) {
      log(`config: Gmail configured (${gmail.environment}) — ${gmail.message}`);
    } else {
      log(`config: Gmail not configured (${gmail.environment}) — ${gmail.message}`);
    }
  } catch (err: any) {
    log(`config: Gmail status check failed — ${err?.message ?? err}`);
  }

  if (errors.length > 0) {
    const summary = errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
    throw new Error(
      `Startup configuration check failed. Missing required environment variables:\n${summary}\n` +
      'Set these in the deployment environment and restart.',
    );
  }
}

/**
 * Schema-drift detector (Task #175). Runs after ensureSchemaUpgrades() and
 * verifies every post-baseline column/table actually exists. Logs ERROR on
 * drift; never throws (so a partial outage doesn't become a total one).
 * Keep REQUIRED_COLUMNS / REQUIRED_TABLES in lockstep with the ALTER/CREATE
 * statements in server/databaseStorage.ts ensureSchemaUpgrades().
 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string; addedFor: string }> = [
  // Task #174 — POST /api/applications writes this column on insert.
  { table: 'gemach_applications', column: 'confirmation_email_sent_at', addedFor: 'Task #174 application confirmation email tracking' },
  // Task #22 — inbox archived/spam toggles for web-form contacts.
  { table: 'contacts', column: 'is_archived', addedFor: 'Task #22 inbox archive' },
  { table: 'contacts', column: 'is_spam', addedFor: 'Task #22 inbox spam' },
  // Task #38 — Stripe refund + pay-later consent + refund accounting.
  { table: 'transactions', column: 'stripe_refund_id', addedFor: 'Task #38 refund trace' },
  { table: 'transactions', column: 'last_return_reminder_at', addedFor: 'return reminder cooldown' },
  { table: 'transactions', column: 'return_reminder_count', addedFor: 'return reminder count' },
  { table: 'transactions', column: 'consent_text', addedFor: 'Task #38 pay-later consent text' },
  { table: 'transactions', column: 'consent_accepted_at', addedFor: 'Task #38 pay-later consent timestamp' },
  { table: 'transactions', column: 'consent_max_charge_cents', addedFor: 'Task #38 pay-later consent cap' },
  { table: 'transactions', column: 'card_saved_at', addedFor: 'Task #38 SetupIntent confirmed timestamp' },
  { table: 'transactions', column: 'charge_notification_sent_at', addedFor: 'Task #38 pay-later charge alert' },
  { table: 'transactions', column: 'charge_notification_channel', addedFor: 'Task #38 pay-later charge alert channel' },
  { table: 'transactions', column: 'deposit_fee_cents', addedFor: 'Task #39 per-tx Stripe fee' },
  { table: 'transactions', column: 'charged_at', addedFor: 'pay-later charge timestamp' },
  { table: 'transactions', column: 'refund_attempted_at', addedFor: 'Task #70 refund attempt timestamp' },
  // Return reminder delivery telemetry (Twilio status callbacks).
  { table: 'return_reminder_events', column: 'twilio_sid', addedFor: 'return reminder Twilio SID' },
  { table: 'return_reminder_events', column: 'delivery_status', addedFor: 'return reminder Twilio status' },
  { table: 'return_reminder_events', column: 'delivery_status_updated_at', addedFor: 'return reminder status timestamp' },
  { table: 'return_reminder_events', column: 'delivery_error_code', addedFor: 'return reminder error code' },
  // Task #35 — operator onboarding: claim token + welcome SMS / WhatsApp /
  // email lifecycle (status, SID, error, sent_at, delivered_at) for ALL
  // three channels. Every column here is read by GET /api/admin/locations
  // and similar routes, so a single missing column 500s the entire list.
  { table: 'locations', column: 'claim_token', addedFor: 'Task #35 operator claim token' },
  { table: 'locations', column: 'claim_token_created_at', addedFor: 'Task #35 claim token timestamp' },
  { table: 'locations', column: 'welcome_sent_at', addedFor: 'Task #35 welcome timestamp' },
  { table: 'locations', column: 'welcome_sms_status', addedFor: 'Task #35 welcome SMS status' },
  { table: 'locations', column: 'welcome_sms_error', addedFor: 'Task #35 welcome SMS error' },
  { table: 'locations', column: 'welcome_sms_sent_at', addedFor: 'Task #35 welcome SMS sent_at' },
  { table: 'locations', column: 'welcome_sms_sid', addedFor: 'Task #35 welcome SMS SID' },
  { table: 'locations', column: 'welcome_sms_delivered_at', addedFor: 'Task #35 welcome SMS delivered_at' },
  { table: 'locations', column: 'welcome_whatsapp_status', addedFor: 'Task #35 welcome WhatsApp status' },
  { table: 'locations', column: 'welcome_whatsapp_error', addedFor: 'Task #35 welcome WhatsApp error' },
  { table: 'locations', column: 'welcome_whatsapp_sent_at', addedFor: 'Task #35 welcome WhatsApp sent_at' },
  { table: 'locations', column: 'welcome_whatsapp_sid', addedFor: 'Task #35 welcome WhatsApp SID' },
  { table: 'locations', column: 'welcome_whatsapp_delivered_at', addedFor: 'Task #35 welcome WhatsApp delivered_at' },
  { table: 'locations', column: 'welcome_email_status', addedFor: 'Task #35 welcome email status' },
  { table: 'locations', column: 'welcome_email_error', addedFor: 'Task #35 welcome email error' },
  { table: 'locations', column: 'welcome_email_sent_at', addedFor: 'Task #35 welcome email sent_at' },
  { table: 'locations', column: 'default_welcome_channel', addedFor: 'Task #35 default welcome channel' },
  { table: 'locations', column: 'contact_preference', addedFor: 'Task #35 contact preference' },
  { table: 'locations', column: 'contact_preference_set_at', addedFor: 'Task #35 contact preference set_at' },
  { table: 'locations', column: 'onboarded_at', addedFor: 'Task #35 onboarded timestamp' },
  { table: 'locations', column: 'processing_fee_fixed', addedFor: 'Task #39 per-location fixed fee' },
  // Task #135 — global admin settings toggle.
  { table: 'global_settings', column: 'is_enabled', addedFor: 'global setting is_enabled toggle' },
];

const REQUIRED_TABLES: Array<{ name: string; addedFor: string }> = [
  // Task #174 — admin status changes (approve/reject/restore) write here.
  { name: 'application_status_changes', addedFor: 'Task #174 application status audit trail' },
  // Task #22 — inbox / web-form contacts.
  { name: 'contacts', addedFor: 'inbox / web-form contacts' },
  // Task #38 / #70 — refund + return reminder lifecycle.
  { name: 'return_reminder_events', addedFor: 'return reminder delivery log' },
  // Task #9 — knowledge base for AI drafting.
  { name: 'knowledge_docs', addedFor: 'AI drafting knowledge base' },
  { name: 'reply_examples', addedFor: 'AI drafting reply examples' },
  { name: 'kb_embeddings', addedFor: 'AI drafting embeddings index' },
  // Operational tables.
  { name: 'global_settings', addedFor: 'admin global settings (e.g. AI auto-reply toggle)' },
  { name: 'disputes', addedFor: 'Stripe dispute tracking' },
  { name: 'message_send_logs', addedFor: 'operator message send history (Task #58)' },
  { name: 'playbook_facts', addedFor: 'AI drafting playbook facts' },
  { name: 'faq_entries', addedFor: 'AI drafting FAQ entries' },
];

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

interface DbExecuteResult {
  rows?: Array<{ present?: number }>;
}

function presentRows(result: unknown): Array<{ present?: number }> {
  if (Array.isArray(result)) return result as Array<{ present?: number }>;
  const r = result as DbExecuteResult | null | undefined;
  return r?.rows ?? [];
}

export async function runSchemaDriftCheck(): Promise<{
  missingColumns: string[];
  missingTables: string[];
  introspectionErrors: string[];
}> {
  const missingColumns: string[] = [];
  const missingTables: string[] = [];
  // Tracked separately so a failed introspection never produces a false OK.
  const introspectionErrors: string[] = [];

  let db: typeof import('./db.js').db;
  try {
    ({ db } = await import('./db.js'));
  } catch (err) {
    const m = errMsg(err);
    introspectionErrors.push(`db import failed: ${m}`);
    console.error(`[schema-drift] could not load db client; skipping drift check. ${m}`);
    return { missingColumns, missingTables, introspectionErrors };
  }

  for (const { table, column, addedFor } of REQUIRED_COLUMNS) {
    try {
      const result = await db.execute(sql`
        SELECT 1 AS present
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
        LIMIT 1
      `);
      if (presentRows(result).length === 0) {
        missingColumns.push(`${table}.${column}`);
        console.error(
          `[schema-drift] ERROR: required column "${table}.${column}" is missing (${addedFor}). ` +
          `Reads/writes will return HTTP 500. ` +
          `Apply: ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} <type>; ` +
          `(see ensureSchemaUpgrades in server/databaseStorage.ts for the exact type.)`
        );
      }
    } catch (err) {
      const msg = `column "${table}.${column}": ${errMsg(err)}`;
      introspectionErrors.push(msg);
      console.error(`[schema-drift] could not introspect ${msg}`);
    }
  }

  for (const { name, addedFor } of REQUIRED_TABLES) {
    try {
      const result = await db.execute(sql`
        SELECT 1 AS present
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${name}
        LIMIT 1
      `);
      if (presentRows(result).length === 0) {
        missingTables.push(name);
        console.error(
          `[schema-drift] ERROR: required table "${name}" is missing (${addedFor}). ` +
          `Reads/writes will return HTTP 500 until the table is created. ` +
          `(See CREATE TABLE statement for "${name}" in ensureSchemaUpgrades in server/databaseStorage.ts.)`
        );
      }
    } catch (err) {
      const msg = `table "${name}": ${errMsg(err)}`;
      introspectionErrors.push(msg);
      console.error(`[schema-drift] could not introspect ${msg}`);
    }
  }

  if (missingColumns.length === 0 && missingTables.length === 0 && introspectionErrors.length === 0) {
    log('schema-drift: OK (all required columns and tables present).');
  } else if (introspectionErrors.length > 0 && missingColumns.length === 0 && missingTables.length === 0) {
    log(
      `schema-drift: UNKNOWN — ${introspectionErrors.length} introspection query(ies) failed; ` +
      `cannot confirm schema health. See ERROR lines above.`
    );
  } else {
    log(
      `schema-drift: WARNING — ${missingColumns.length} missing column(s), ` +
      `${missingTables.length} missing table(s)` +
      (introspectionErrors.length > 0 ? `, ${introspectionErrors.length} introspection error(s)` : '') +
      `. Routes depending on them will 500 until fixed.`
    );
  }

  return { missingColumns, missingTables, introspectionErrors };
}
