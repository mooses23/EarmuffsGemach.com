// Task #39: heads-up notification sent to the borrower BEFORE we run an
// off-session Stripe charge. Goal: dramatically reduce "I don't recognize
// this charge" disputes by giving the borrower a single calm, factual
// message ("we are about to charge $X for the unreturned earmuffs from
// {gemach name} — reply if there's a mistake").
//
// Channel selection:
//   1. SMS   — if borrower has a phone and Twilio is configured
//   2. Email — fallback if no SMS could be sent
//
// Whether a send failure blocks the charge is determined by the caller:
// chargeTransaction reads `requirePreChargeNotification` (global_settings key
// stripe.requirePreChargeNotification, default TRUE) and returns an error if
// notification fails and the setting is enabled. The result (channel + sentAt)
// is always persisted on the transaction so operators can see what was attempted.

import twilio from 'twilio';
import { getTwilioConfigStatus } from './twilio-client.js';
import { sendNewEmail } from './gmail-client.js';
import { storage } from './storage.js';
import { randomBytes, createHash } from 'crypto';
import type { Transaction, Location } from '../shared/schema.js';

export type ChargeNotificationChannel = 'sms' | 'whatsapp' | 'email' | 'none';

export interface ChargeNotificationResult {
  channel: ChargeNotificationChannel;
  sent: boolean;
  error?: string;
}

function normalizePhoneForSms(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits.length >= 11 ? digits : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Generate a fresh 30-day magic token, persist the hashed form on the transaction,
 * and return both the raw token (for embedding in the URL) and the status URL.
 *
 * The status route expects /status/:id?token=<rawToken> — the server hashes the
 * raw token at validation time and compares against the stored hash.
 */
async function buildFreshStatusUrl(transaction: Transaction): Promise<string | null> {
  try {
    const rawToken = randomBytes(32).toString('hex');
    const hashed = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await storage.updateTransaction(transaction.id, {
      magicToken: hashed,
      magicTokenExpiresAt: expiresAt,
    });
    const base = process.env.APP_ORIGIN || process.env.VITE_APP_URL || 'https://earmuffsgemach.com';
    return `${base}/status/${transaction.id}?token=${rawToken}`;
  } catch (err) {
    console.error('buildFreshStatusUrl failed:', err);
    return null;
  }
}

function buildSmsBody(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const noteLine = operatorNote ? ` Note from the gemach: "${operatorNote}"` : '';
  const linkLine = statusUrl ? ` Check status: ${statusUrl}` : '';
  return (
    `Hi ${firstName} — heads up: the ${location.name} Baby Banz Earmuffs Gemach is about to charge $${dollars} on the card you saved for the unreturned earmuffs.${noteLine} If you've already returned them or this looks wrong, please call ${location.phone} right away.${linkLine}`
  );
}

function buildEmailSubject(location: Location): string {
  return `Heads up — pending charge from ${location.name} Baby Banz Earmuffs Gemach`;
}

function buildEmailBody(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const noteSection = operatorNote
    ? `\nAdditional note from the gemach coordinator:\n  "${operatorNote}"\n`
    : '';
  const linkSection = statusUrl
    ? `\nYou can also view the status of your loan at any time:\n  ${statusUrl}\n`
    : '';
  return `Hi ${firstName},

This is a heads-up note from the ${location.name} Baby Banz Earmuffs Gemach.

We are about to charge $${dollars} on the card you saved when you borrowed earmuffs from us, because the earmuffs have not been returned. The charge will be processed shortly.
${noteSection}
If you have already returned the earmuffs, or if anything about this looks wrong, please get in touch with us right away:

  Phone: ${location.phone}
  Email: ${location.email}
${linkSection}
We would much rather sort this out with you than process a charge in error.

Thank you,
${location.name} Baby Banz Earmuffs Gemach
`;
}

async function trySendSms(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const status = getTwilioConfigStatus();
  if (!status.configured) {
    return { ok: false, error: status.reason || 'SMS not configured' };
  }
  const to = normalizePhoneForSms(transaction.borrowerPhone);
  if (!to) return { ok: false, error: 'No valid phone number' };

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body: buildSmsBody(transaction, location, amountCents, statusUrl, operatorNote),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'SMS send failed' };
  }
}

async function trySendEmail(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!transaction.borrowerEmail) return { ok: false, error: 'No email on file' };
  try {
    await sendNewEmail(
      transaction.borrowerEmail,
      buildEmailSubject(location),
      buildEmailBody(transaction, location, amountCents, statusUrl, operatorNote),
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed' };
  }
}

/**
 * Notify the borrower that an off-session charge is about to be made.
 * Generates a fresh valid status URL (with raw token) so the borrower can
 * check their loan status in real time. Tries SMS first, falls back to email.
 * Never throws.
 *
 * @param operatorNote Optional free-text note from the operator (e.g. "your
 *   borrow was 45 days ago") included verbatim in the message so borrowers
 *   understand the context before the charge lands.
 */
export async function notifyBorrowerBeforeCharge(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  operatorNote?: string,
): Promise<ChargeNotificationResult> {
  // Build a fresh, usable status link. Raw token embedded in URL; hashed token
  // stored in DB. The pre-charge URL doubles as the post-charge receipt URL.
  const statusUrl = await buildFreshStatusUrl(transaction);

  const sms = await trySendSms(transaction, location, amountCents, statusUrl, operatorNote);
  if (sms.ok) return { channel: 'sms', sent: true };

  const email = await trySendEmail(transaction, location, amountCents, statusUrl, operatorNote);
  if (email.ok) return { channel: 'email', sent: true };

  return {
    channel: 'none',
    sent: false,
    error: [sms.error, email.error].filter(Boolean).join('; ') || 'No notification channel available',
  };
}

export function describePreferredChannel(transaction: Transaction): ChargeNotificationChannel {
  if (transaction.borrowerPhone) return 'sms';
  if (transaction.borrowerEmail) return 'email';
  return 'none';
}

// ── Post-charge receipt ──────────────────────────────────────────────────────

function buildReceiptSmsBody(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const noteLine = operatorNote ? ` Note: "${operatorNote}"` : '';
  const linkLine = statusUrl ? ` View receipt: ${statusUrl}` : '';
  return (
    `Hi ${firstName} — your $${dollars} deposit has been charged by the ${location.name} Baby Banz Earmuffs Gemach.${noteLine} Questions? Call ${location.phone}.${linkLine}`
  );
}

function buildReceiptEmailSubject(location: Location): string {
  return `Receipt — deposit charge from ${location.name} Baby Banz Earmuffs Gemach`;
}

function buildReceiptEmailBody(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  statusUrl: string | null,
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const noteSection = operatorNote
    ? `\nNote from the gemach coordinator:\n  "${operatorNote}"\n`
    : '';
  const linkSection = statusUrl
    ? `\nYou can view the details of your loan at any time:\n  ${statusUrl}\n`
    : '';
  return `Hi ${firstName},

This is a confirmation that your deposit of $${dollars} has been charged by the ${location.name} Baby Banz Earmuffs Gemach.

This charge was collected because the borrowed earmuffs were not returned. If you believe this is an error, please contact us right away:

  Phone: ${location.phone}
  Email: ${location.email}
${noteSection}${linkSection}
Thank you,
${location.name} Baby Banz Earmuffs Gemach
`;
}

/**
 * Send a post-charge receipt notification to the borrower confirming the charge landed.
 * Generates a fresh valid status URL so the borrower can view their loan details.
 * Includes the same operator note/reason as the pre-charge notification for context.
 * Tries SMS first, falls back to email. Never throws.
 */
export async function notifyBorrowerAfterCharge(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  operatorNote?: string,
): Promise<ChargeNotificationResult> {
  // Generate a fresh valid status link (raw token in URL, hashed stored in DB).
  const statusUrl = await buildFreshStatusUrl(transaction);

  // Try SMS
  const smsStatus = getTwilioConfigStatus();
  if (smsStatus.configured) {
    const to = normalizePhoneForSms(transaction.borrowerPhone);
    if (to) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID!;
        const authToken = process.env.TWILIO_AUTH_TOKEN!;
        const client = twilio(accountSid, authToken);
        await client.messages.create({
          to,
          from: process.env.TWILIO_FROM_NUMBER!,
          body: buildReceiptSmsBody(transaction, location, amountCents, statusUrl, operatorNote),
        });
        return { channel: 'sms', sent: true };
      } catch (e: any) {
        console.error('Receipt SMS failed:', e?.message);
      }
    }
  }

  // Fall back to email
  if (transaction.borrowerEmail) {
    try {
      await sendNewEmail(
        transaction.borrowerEmail,
        buildReceiptEmailSubject(location),
        buildReceiptEmailBody(transaction, location, amountCents, statusUrl, operatorNote),
      );
      return { channel: 'email', sent: true };
    } catch (e: any) {
      console.error('Receipt email failed:', e?.message);
    }
  }

  return { channel: 'none', sent: false, error: 'No notification channel available' };
}
