// Twilio SMS client for return reminders. SMS is enabled only when
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are all set.

import twilio, { type Twilio } from 'twilio';

export interface TwilioConfigStatus {
  configured: boolean;
  reason?: string;
}

let cachedClient: Twilio | null = null;
let cachedConfigKey = '';

function configKey(): string {
  return [
    process.env.TWILIO_ACCOUNT_SID || '',
    process.env.TWILIO_AUTH_TOKEN || '',
    process.env.TWILIO_FROM_NUMBER || '',
  ].join('|');
}

export function getTwilioConfigStatus(): TwilioConfigStatus {
  const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = (process.env.TWILIO_FROM_NUMBER || '').trim();
  if (!sid || !token || !from) {
    return {
      configured: false,
      reason: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to enable SMS reminders.',
    };
  }
  if (!sid.startsWith('AC')) {
    return { configured: false, reason: 'TWILIO_ACCOUNT_SID must start with "AC".' };
  }
  return { configured: true };
}

function getClient(): Twilio {
  const key = configKey();
  if (cachedClient && key === cachedConfigKey) return cachedClient;
  cachedClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  cachedConfigKey = key;
  return cachedClient;
}

// Normalize to E.164 ("+<country><subscriber>"). Returns null for
// ambiguous local formats so callers fail with a clear error instead of
// letting Twilio guess the country wrong.
export function normalizePhoneForSms(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return '+' + digits;
  }

  const digits = trimmed.replace(/\D/g, '');
  // NANP only: area code must start 2-9.
  if (digits.length === 10 && /^[2-9]/.test(digits)) return '+1' + digits;
  if (digits.length === 11 && /^1[2-9]/.test(digits)) return '+' + digits;
  return null;
}

export interface ReturnReminderSmsContext {
  borrowerName: string;
  borrowerPhone: string;
  locationName: string;
  language: 'en' | 'he';
  dueDate?: Date | null;
  statusUrl?: string;
}

function formatDueDate(d: Date, language: 'en' | 'he'): string {
  try {
    return new Intl.DateTimeFormat(language === 'he' ? 'he-IL' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// Bilingual SMS body. Kept under ~2 SMS segments. Includes gemach name,
// item, due date (when known), and the borrower status link.
export function buildReturnReminderSmsBody(ctx: ReturnReminderSmsContext): string {
  const firstName = (ctx.borrowerName || '').trim().split(/\s+/)[0] || ctx.borrowerName || '';
  const dueStr = ctx.dueDate ? formatDueDate(ctx.dueDate, ctx.language) : '';
  const link = ctx.statusUrl ? `\n${ctx.statusUrl}` : '';
  if (ctx.language === 'he') {
    const dueLine = dueStr ? ` שתאריך ההחזרה שלהן היה ${dueStr}` : '';
    return `שלום ${firstName}, תזכורת ידידותית מגמ"ח אוזניות בייבי בנז ${ctx.locationName} — נשמח אם תחזיר את האוזניות${dueLine} כדי שמשפחה נוספת תוכל ליהנות מהן. אם כבר החזרת, אפשר להתעלם.${link}`;
  }
  const dueLine = dueStr ? ` (due ${dueStr})` : '';
  return `Hi ${firstName}, friendly reminder from the ${ctx.locationName} Baby Banz Earmuffs Gemach — please bring back the earmuffs${dueLine} when you can so the next family can use them. If you've already returned them, ignore this note.${link}`;
}

// Sends a return-reminder SMS. Throws when Twilio is not configured,
// the phone is invalid, or Twilio rejects the request.
export async function sendReturnReminderSMS(ctx: ReturnReminderSmsContext): Promise<{ sid: string }> {
  const status = getTwilioConfigStatus();
  if (!status.configured) {
    throw new Error(status.reason || 'SMS is not configured.');
  }
  const to = normalizePhoneForSms(ctx.borrowerPhone);
  if (!to) {
    throw new Error('Borrower phone number is missing or too short to send SMS.');
  }
  const body = buildReturnReminderSmsBody({ ...ctx, borrowerPhone: to });
  const client = getClient();
  try {
    const msg = await client.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body,
    });
    return { sid: msg.sid };
  } catch (e: any) {
    // Twilio errors include `code` and `moreInfo`; surface a short reason.
    const reason = e?.message || 'Twilio rejected the SMS request.';
    throw new Error(`SMS send failed: ${reason}`);
  }
}
