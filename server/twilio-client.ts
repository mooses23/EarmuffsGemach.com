// Twilio SMS client for return reminders. SMS is enabled only when
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are all set.

import twilio, { type Twilio } from 'twilio';
import { normalizePhoneForSms } from '../shared/phone.js';
// Re-export so existing callers (routes, tests) keep importing from
// twilio-client without churn.
export { normalizePhoneForSms };

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

/**
 * Verify a Twilio webhook signature so untrusted callers can't forge delivery
 * status callbacks (which would otherwise let anyone with a guessed Message
 * SID poison admin delivery visibility). Twilio signs the full public URL
 * the request was sent to, plus all POST body params, with HMAC-SHA1 keyed
 * by TWILIO_AUTH_TOKEN.
 *
 * Returns:
 *   - "valid"        signature header present and matches.
 *   - "invalid"      signature header present but did not match.
 *   - "missing"      no signature header on the request.
 *   - "unconfigured" TWILIO_AUTH_TOKEN unset; no validation possible.
 *
 * Caller (the route) decides whether to enforce: in production with token
 * configured we reject "invalid" and "missing"; in dev we log and pass.
 */
export function validateTwilioSignature(
  req: { header: (n: string) => string | undefined; body: unknown; protocol: string; get: (n: string) => string | undefined; originalUrl: string },
  publicUrl?: string,
): 'valid' | 'invalid' | 'missing' | 'unconfigured' {
  const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!token) return 'unconfigured';
  const sig = req.header('X-Twilio-Signature') || req.header('x-twilio-signature');
  if (!sig) return 'missing';
  // Build the URL Twilio used to call us. Prefer the explicit override
  // (statusCallbackUrl) so we match exactly what we registered with Twilio.
  const url = publicUrl || `${req.protocol}://${req.get('host') || ''}${req.originalUrl}`;
  const params = (req.body && typeof req.body === 'object') ? (req.body as Record<string, unknown>) : {};
  try {
    const ok = twilio.validateRequest(token, sig, url, params as Record<string, string>);
    return ok ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
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

// ---------------------------------------------------------------------------
// Operator onboarding — Task #35
// ---------------------------------------------------------------------------

export interface TwilioWhatsAppConfigStatus {
  configured: boolean;
  reason?: string;
}

// WhatsApp ride-along on the same Twilio account. We accept either a bare
// phone number (e.g. "+15551234567") or a full "whatsapp:+..." URI in
// TWILIO_WHATSAPP_FROM. If unset, we fall back to TWILIO_FROM_NUMBER —
// only safe once the same business number is registered for WhatsApp
// Business API in the Twilio console.
export function getTwilioWhatsAppConfigStatus(): TwilioWhatsAppConfigStatus {
  const base = getTwilioConfigStatus();
  if (!base.configured) {
    return { configured: false, reason: base.reason };
  }
  const waFrom = (process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER || '').trim();
  if (!waFrom) {
    return {
      configured: false,
      reason: 'Set TWILIO_WHATSAPP_FROM (or reuse TWILIO_FROM_NUMBER, once enabled for WhatsApp Business) to send WhatsApp.',
    };
  }
  return { configured: true };
}

function whatsappFrom(): string {
  const raw = (process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER || '').trim();
  return raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;
}

export interface OperatorWelcomeMessageContext {
  locationName: string;
  locationCode: string;
  claimUrl: string;
  language: 'en' | 'he';
  defaultPin?: string;
  /** Optional named human signing the message. Defaults to "Earmuffs Gemach". */
  signOff?: string;
}

// Clear, friendly welcome body — one SMS segment where possible.
// EN uses GSM-7; HE is UCS-2. Both stay well under 320 chars.
// No emojis, no shouting, no "Reply STOP" footer.
export function buildOperatorWelcomeMessageBody(ctx: OperatorWelcomeMessageContext): string {
  const signOff = (ctx.signOff || '').trim() || 'Earmuffs Gemach';
  const pin = (ctx.defaultPin || '1234').trim();
  if (ctx.language === 'he') {
    return `שלום ${ctx.locationName}, הוזמנת לנהל את דשבורד הגמ"ח שלך (${ctx.locationCode}). קוד הכניסה החד-פעמי שלך: ${pin}. לחץ כאן להתחלה:\n${ctx.claimUrl}\n— ${signOff}`;
  }
  return `Hi ${ctx.locationName}, you've been invited to manage your ${ctx.locationCode} gemach dashboard. Your one-time login PIN is ${pin}. Tap here to get started:\n${ctx.claimUrl}\n— ${signOff}`;
}

export interface OperatorWelcomeSendContext extends OperatorWelcomeMessageContext {
  toPhone: string;
  /** Optional public URL Twilio will POST delivery updates to. */
  statusCallbackUrl?: string;
  /** Optional fully-custom body (admin-edited). Overrides the template when set. */
  customBody?: string;
}

export interface OperatorWelcomeChannelResult {
  ok: boolean;
  sid?: string;
  error?: string;
  /** Friendly hint shown to admins when WhatsApp template isn't approved yet. */
  hint?: string;
}

export interface OperatorWelcomeSendResult {
  sms?: OperatorWelcomeChannelResult;
  whatsapp?: OperatorWelcomeChannelResult;
}

function describeTwilioError(e: any, channel: 'sms' | 'whatsapp'): { error: string; hint?: string } {
  const code = typeof e?.code === 'number' ? e.code : undefined;
  const msg = (e?.message || '').toString();
  // 63016: free-form WhatsApp message outside 24h customer-care window — needs an approved template.
  // 63015 / 63017: similar template/channel issues. Surface a friendly hint.
  if (channel === 'whatsapp' && (code === 63016 || code === 63015 || code === 63017 || /template/i.test(msg))) {
    return {
      error: msg || 'WhatsApp message rejected.',
      hint: 'WhatsApp needs a Meta-approved template for the first contact. The SMS may have gone through; once the template is approved, WhatsApp sends will succeed.',
    };
  }
  // 21211: invalid To. 21408: permission denied for region. 21610: opted out.
  if (code === 21610) {
    return { error: 'This number has opted out of messages from this Twilio number.' };
  }
  return { error: msg || `Twilio rejected the ${channel === 'sms' ? 'SMS' : 'WhatsApp'} request.` };
}

export async function sendOperatorWelcomeSms(ctx: OperatorWelcomeSendContext): Promise<OperatorWelcomeChannelResult> {
  const status = getTwilioConfigStatus();
  if (!status.configured) {
    return { ok: false, error: status.reason || 'SMS is not configured.' };
  }
  const to = normalizePhoneForSms(ctx.toPhone);
  if (!to) {
    return { ok: false, error: 'Phone number is missing or not a valid SMS-capable number.' };
  }
  const body = ctx.customBody || buildOperatorWelcomeMessageBody(ctx);
  const client = getClient();
  try {
    const msg = await client.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body,
      ...(ctx.statusCallbackUrl ? { statusCallback: ctx.statusCallbackUrl } : {}),
    });
    return { ok: true, sid: msg.sid };
  } catch (e: any) {
    return { ok: false, ...describeTwilioError(e, 'sms') };
  }
}

export async function sendOperatorWelcomeWhatsApp(ctx: OperatorWelcomeSendContext): Promise<OperatorWelcomeChannelResult> {
  const status = getTwilioWhatsAppConfigStatus();
  if (!status.configured) {
    return { ok: false, error: status.reason || 'WhatsApp is not configured.' };
  }
  const to = normalizePhoneForSms(ctx.toPhone);
  if (!to) {
    return { ok: false, error: 'Phone number is missing or not a valid WhatsApp-capable number.' };
  }
  const body = buildOperatorWelcomeMessageBody(ctx);
  const client = getClient();
  // If a content template SID is configured for the operator's language,
  // use it (avoids the 24-hour customer-care window restriction). Variables
  // are positional and match the EN/HE template body order: 1=name, 2=link,
  // 3=code, 4=pin.
  const contentSid = ctx.language === 'he'
    ? (process.env.TWILIO_WHATSAPP_CONTENT_SID_HE || '').trim()
    : (process.env.TWILIO_WHATSAPP_CONTENT_SID_EN || '').trim();
  try {
    const cb = ctx.statusCallbackUrl ? { statusCallback: ctx.statusCallbackUrl } : {};
    const msg = await client.messages.create(
      contentSid
        ? {
            to: `whatsapp:${to}`,
            from: whatsappFrom(),
            contentSid,
            contentVariables: JSON.stringify({
              '1': ctx.locationName,
              '2': ctx.claimUrl,
              '3': ctx.locationCode,
              '4': (ctx.defaultPin || '1234').trim(),
            }),
            ...cb,
          }
        : {
            to: `whatsapp:${to}`,
            from: whatsappFrom(),
            body,
            ...cb,
          },
    );
    return { ok: true, sid: msg.sid };
  } catch (e: any) {
    return { ok: false, ...describeTwilioError(e, 'whatsapp') };
  }
}

// Fires SMS and/or WhatsApp in parallel, returning per-channel results.
// Never throws — channel failures are surfaced via {ok:false, error}.
export async function sendOperatorWelcome(
  ctx: OperatorWelcomeSendContext,
  channels: { sms?: boolean; whatsapp?: boolean },
): Promise<OperatorWelcomeSendResult> {
  const tasks: Promise<void>[] = [];
  const out: OperatorWelcomeSendResult = {};
  if (channels.sms) {
    tasks.push(sendOperatorWelcomeSms(ctx).then((r) => { out.sms = r; }));
  }
  if (channels.whatsapp) {
    tasks.push(sendOperatorWelcomeWhatsApp(ctx).then((r) => { out.whatsapp = r; }));
  }
  await Promise.all(tasks);
  return out;
}
