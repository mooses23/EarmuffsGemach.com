// Task #39: heads-up notification sent to the borrower BEFORE we run an
// off-session Stripe charge. Goal: dramatically reduce "I don't recognize
// this charge" disputes by giving the borrower a single calm, factual
// message ("we are about to charge $X for the unreturned earmuffs from
// {gemach name} — reply if there's a mistake").
//
// Channel selection (best effort, never blocks the charge):
//   1. SMS   — if borrower has a phone and Twilio is configured
//   2. Email — fallback if no SMS could be sent
//
// We do NOT throw on send failure — caller will charge anyway. The result
// (channel + sentAt) is persisted on the transaction so operators can
// see what was attempted.

import twilio from 'twilio';
import { getTwilioConfigStatus } from './twilio-client.js';
import { sendNewEmail } from './gmail-client.js';
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

function buildStatusUrl(transaction: Transaction): string | null {
  if (!transaction.magicToken) return null;
  const base = process.env.APP_ORIGIN || process.env.VITE_APP_URL || 'https://earmuffsgemach.com';
  return `${base}/status/${transaction.magicToken}`;
}

function buildSmsBody(
  transaction: Transaction,
  location: Location,
  amountCents: number,
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const statusUrl = buildStatusUrl(transaction);
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
  operatorNote?: string,
): string {
  const firstName = (transaction.borrowerName || '').trim().split(/\s+/)[0] || 'Hi';
  const dollars = (amountCents / 100).toFixed(2);
  const statusUrl = buildStatusUrl(transaction);
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
      body: buildSmsBody(transaction, location, amountCents, operatorNote),
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
  operatorNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!transaction.borrowerEmail) return { ok: false, error: 'No email on file' };
  try {
    await sendNewEmail(
      transaction.borrowerEmail,
      buildEmailSubject(location),
      buildEmailBody(transaction, location, amountCents, operatorNote),
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed' };
  }
}

/**
 * Notify the borrower that an off-session charge is about to be made.
 * Tries SMS first, falls back to email. Never throws.
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
  const sms = await trySendSms(transaction, location, amountCents, operatorNote);
  if (sms.ok) return { channel: 'sms', sent: true };

  const email = await trySendEmail(transaction, location, amountCents, operatorNote);
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
